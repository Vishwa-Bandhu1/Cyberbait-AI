import axios from 'axios';
import {describeAxiosError} from './connectivity';

const HEALTH_PATH = '/health';
const HEALTH_TIMEOUT_MS = 2500;
const BASE_BACKOFF_MS = 1500;
const MAX_BACKOFF_MS = 30000;
const RECENT_SUCCESS_MS = 15000;

const healthClient = axios.create({
  timeout: HEALTH_TIMEOUT_MS,
  validateStatus: status => status < 500,
});

const now = () => Date.now();

const clampBackoff = failures =>
  Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(failures - 1, 0));

const removeTrailingSlash = value => String(value || '').replace(/\/+$/, '');

const buildHealthUrl = (baseUrl, healthPath = HEALTH_PATH) =>
  `${removeTrailingSlash(baseUrl)}${healthPath}`;

const formatDetails = details =>
  [
    `type=${details?.type || 'unknown'}`,
    details?.code ? `code=${details.code}` : '',
    details?.message || '',
  ]
    .filter(Boolean)
    .join(' ');

export const createBackendAvailabilityManager = ({
  baseUrls,
  healthPath = HEALTH_PATH,
  logger = console.log,
}) => {
  const orderedBaseUrls = [...new Set(baseUrls.filter(Boolean))];
  const states = new Map(
    orderedBaseUrls.map((baseUrl, priority) => [
      baseUrl,
      {
        baseUrl,
        priority,
        state: 'unknown',
        failures: 0,
        lastFailureAt: 0,
        lastSuccessAt: 0,
        nextProbeAt: 0,
        inFlightHealthCheck: null,
      },
    ]),
  );
  let activeBaseUrl = orderedBaseUrls[0];

  const getState = baseUrl => states.get(baseUrl);

  const getOrderedStates = () =>
    [...states.values()].sort((a, b) => a.priority - b.priority);

  const getBackoffRemainingMs = state =>
    Math.max(0, (state?.nextProbeAt || 0) - now());

  const canProbe = state => !state?.nextProbeAt || state.nextProbeAt <= now();

  const markSuccess = (baseUrl, source = 'request') => {
    const state = getState(baseUrl);
    if (!state) {
      return;
    }

    const wasRecovering = state.state !== 'healthy' || state.failures > 0;
    state.state = 'healthy';
    state.failures = 0;
    state.lastSuccessAt = now();
    state.nextProbeAt = 0;
    activeBaseUrl = baseUrl;

    if (wasRecovering) {
      logger(`[API Backend] Host healthy via ${source}: ${baseUrl}`);
    }
  };

  const markFailure = (baseUrl, details, source = 'request') => {
    const state = getState(baseUrl);
    if (!state) {
      return;
    }

    state.state = 'open';
    state.failures += 1;
    state.lastFailureAt = now();
    state.nextProbeAt = state.lastFailureAt + clampBackoff(state.failures);

    logger(
      `[API Backend] Host unavailable via ${source}: ${baseUrl}`,
      formatDetails(details),
      `nextProbeIn=${getBackoffRemainingMs(state)}ms`,
    );
  };

  const pingBackend = async (baseUrl, reason = 'health') => {
    const state = getState(baseUrl);

    if (!state) {
      return false;
    }

    if (state.inFlightHealthCheck) {
      return state.inFlightHealthCheck;
    }

    const healthUrl = buildHealthUrl(baseUrl, healthPath);
    logger(`[API Health] Pinging ${healthUrl} (${reason})`);

    state.inFlightHealthCheck = healthClient
      .get(healthUrl, {
        timeout: HEALTH_TIMEOUT_MS,
        params: {_t: Date.now()},
      })
      .then(response => {
        if (response.status >= 200 && response.status < 300) {
          logger(`[API Health] OK ${healthUrl} status=${response.status}`);
        } else {
          logger(
            `[API Health] Transport reachable ${healthUrl} status=${response.status}`,
          );
        }
        markSuccess(baseUrl, 'health');
        return true;
      })
      .catch(error => {
        const details = describeAxiosError(error);
        markFailure(baseUrl, details, 'health');
        logger(
          `[API Health] Failed ${healthUrl}`,
          formatDetails(details),
        );
        return false;
      })
      .finally(() => {
        state.inFlightHealthCheck = null;
      });

    return state.inFlightHealthCheck;
  };

  const probeCandidates = async (candidates, reason) => {
    for (const baseUrl of candidates) {
      const healthy = await pingBackend(baseUrl, reason);
      if (healthy) {
        return baseUrl;
      }
    }

    return undefined;
  };

  const getProbeCandidates = ignoredBaseUrls => {
    const ignored = new Set(ignoredBaseUrls);
    return getOrderedStates()
      .filter(state => !ignored.has(state.baseUrl))
      .filter(
        state =>
          state.state !== 'open' ||
          canProbe(state) ||
          state.lastSuccessAt > state.lastFailureAt,
      )
      .map(state => state.baseUrl);
  };

  const getCoolingCandidates = ignoredBaseUrls => {
    const ignored = new Set(ignoredBaseUrls);
    return getOrderedStates()
      .filter(state => !ignored.has(state.baseUrl))
      .map(state => state.baseUrl);
  };

  const resolveBaseUrl = async ({
    preferredBaseUrl,
    reason = 'request',
  } = {}) => {
    const preferredState = getState(preferredBaseUrl);

    if (
      preferredState?.state === 'healthy' &&
      now() - preferredState.lastSuccessAt < RECENT_SUCCESS_MS
    ) {
      return preferredBaseUrl;
    }

    const activeState = getState(activeBaseUrl);

    if (
      activeBaseUrl &&
      activeState?.state === 'healthy' &&
      now() - activeState.lastSuccessAt < RECENT_SUCCESS_MS
    ) {
      return activeBaseUrl;
    }

    const candidates = getProbeCandidates([]);
    const healthyBaseUrl = await probeCandidates(candidates, reason);

    if (healthyBaseUrl) {
      return healthyBaseUrl;
    }

    const fallbackBaseUrl =
      preferredBaseUrl ||
      activeBaseUrl ||
      getCoolingCandidates([])[0];

    if (fallbackBaseUrl) {
      const state = getState(fallbackBaseUrl);
      logger(
        `[API Backend] No healthy host confirmed; attempting ${fallbackBaseUrl}`,
        state ? `cooldownRemaining=${getBackoffRemainingMs(state)}ms` : '',
      );
    }

    return fallbackBaseUrl;
  };

  const getNextRetryBaseUrl = async ({
    triedBaseUrls = [],
    reason = 'retry',
  } = {}) => {
    const candidates = getProbeCandidates(triedBaseUrls);
    const healthyBaseUrl = await probeCandidates(candidates, reason);

    if (healthyBaseUrl) {
      return healthyBaseUrl;
    }

    return getCoolingCandidates(triedBaseUrls)[0];
  };

  return {
    baseUrls: orderedBaseUrls,
    getActiveBaseUrl: () => activeBaseUrl,
    resolveBaseUrl,
    getNextRetryBaseUrl,
    markSuccess,
    markFailure,
    pingBackend,
  };
};

