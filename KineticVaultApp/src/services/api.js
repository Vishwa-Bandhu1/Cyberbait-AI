import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {createBackendAvailabilityManager} from './backendManager';
import {
  describeAxiosError,
  getApiBaseUrls,
  getDebugNetworkSummary,
} from './connectivity';

// Set this to true when testing against the live Render backend.
const USE_DEPLOYED = false;
const DEPLOYED_URL = 'https://kineticvault-backend.onrender.com/api';
const SCAN_HISTORY_KEY = 'scan_history';
const MAX_LOCAL_HISTORY_ITEMS = 100;
const API_BASE_URLS = getApiBaseUrls({
  useDeployed: USE_DEPLOYED,
  deployedUrl: DEPLOYED_URL,
});
const BASE_URL = API_BASE_URLS[0];
const API_TIMEOUT_MS = 30000;
const TEXT_ANALYSIS_TIMEOUT_MS = 8000;
const IMAGE_TIMEOUT_MS = 70000;
const HISTORY_TIMEOUT_MS = 4000;
const API_RETRY_ATTEMPTS = 2;

const unique = values => [...new Set(values.filter(Boolean))];
let activeBaseUrl = BASE_URL;

const api = axios.create({
  baseURL: BASE_URL,
  timeout: API_TIMEOUT_MS,
});

const networkSummary = getDebugNetworkSummary();

console.log(
  '[API] Backend target:',
  USE_DEPLOYED ? 'Render deployment' : networkSummary.runtimeTarget,
  'baseURLs:',
  API_BASE_URLS.join(' -> '),
);
console.log(
  '[API] Network context:',
  `platform=${networkSummary.platform}`,
  `metroHost=${networkSummary.bundlerHost}`,
  `configuredLanHost=${networkSummary.configuredLanHost}`,
  `backendMode=${networkSummary.backendMode}`,
  `adbReverseActive=${networkSummary.adbReverseActive}`,
);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const isRetryableError = error => describeAxiosError(error).retryable;

const requestWithRetry = async (
  requestFactory,
  attempts = API_RETRY_ATTEMPTS,
) => {
  let lastError;

  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    try {
      return await requestFactory();
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isRetryableError(error)) {
        throw error;
      }
      await sleep(400 * (attempt + 1));
    }
  }

  throw lastError;
};

const logRecoverableApiIssue = (...args) => {
  console.log(...args);
};

const backendManager = createBackendAvailabilityManager({
  baseUrls: API_BASE_URLS,
  logger: logRecoverableApiIssue,
});

const formatRequestUrl = config => {
  if (/^https?:\/\//i.test(config.url || '')) {
    return config.url;
  }
  return `${config.baseURL || ''}${config.url || ''}`;
};

const shouldRetryWithAlternateHost = details =>
  !USE_DEPLOYED &&
  ['timeout', 'unreachable', 'refused', 'no-internet-or-route'].includes(
    details.type,
  );

const isLoopbackBaseUrl = baseUrl =>
  /^https?:\/\/(127\.0\.0\.1|localhost)(?::\d+)?/i.test(baseUrl || '');

const getBackendDiagnosticHint = (baseUrl, details) => {
  if (
    networkSummary.runtimeTarget === 'android-device' &&
    isLoopbackBaseUrl(baseUrl) &&
    ['timeout', 'unreachable', 'refused'].includes(details.type)
  ) {
    return 'adb reverse is missing, stale, or the backend is not listening on laptop port 8080. Run: adb reverse tcp:8080 tcp:8080 and verify with adb reverse --list.';
  }

  if (
    networkSummary.runtimeTarget === 'android-device' &&
    networkSummary.backendMode === 'lan'
  ) {
    return 'LAN mode requires the phone to route to the laptop IP. USB tethering normally should use adb reverse mode instead.';
  }

  return 'Ensure Spring Boot is running on port 8080, bound to 0.0.0.0, and reachable from this device.';
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const toNumber = (value, fallback = 0) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.replace('%', '').trim());
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

const normalizeThreatLevel = (level, score) => {
  if (score >= 81) {
    return 'CRITICAL';
  }
  if (score >= 61) {
    return 'HIGH';
  }
  if (score >= 41) {
    return 'MEDIUM';
  }
  if (score >= 21) {
    return 'LOW';
  }

  const normalized = String(level || '').trim().toUpperCase();
  if (['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(normalized)) {
    return normalized;
  }
  return 'NONE';
};

const scoreFromThreatLevel = level => {
  const normalized = String(level || '').trim().toUpperCase();
  if (normalized.includes('CRITICAL')) {
    return 85;
  }
  if (normalized.includes('HIGH')) {
    return 65;
  }
  if (normalized.includes('MEDIUM') || normalized.includes('MODERATE')) {
    return 45;
  }
  if (normalized.includes('LOW')) {
    return 25;
  }
  return 0;
};

const normalizeArray = value => {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
};

const normalizeThreats = data =>
  normalizeArray(data?.threats || data?.detectedThreats || data?.categories)
    .map(item => {
      if (typeof item === 'string') {
        return item;
      }
      return item?.word || item?.name || item?.label || item?.type || '';
    })
    .filter(Boolean);

const normalizeKeywords = (data, threats, riskScore) => {
  const rawKeywords = normalizeArray(data?.keywords || data?.signals);
  const confidence = riskScore >= 81 ? 95 : riskScore >= 61 ? 88 : riskScore >= 41 ? 78 : 60;
  const keywords = rawKeywords
    .map(item => {
      if (typeof item === 'string') {
        return {word: item, confidence, type: 'threat'};
      }
      if (!item || typeof item !== 'object') {
        return null;
      }
      return {
        word: item.word || item.name || item.label || item.threat || 'Suspicious indicator',
        confidence: clamp(toNumber(item.confidence ?? item.score, confidence), 0, 100),
        type: item.type || item.category || 'threat',
      };
    })
    .filter(Boolean);

  if (keywords.length > 0) {
    return keywords;
  }

  return threats.map(threat => ({word: threat, confidence, type: 'threat'}));
};

const normalizeEntities = entities => ({
  urls: normalizeArray(entities?.urls),
  phoneNumbers: normalizeArray(entities?.phoneNumbers),
  upiIds: normalizeArray(entities?.upiIds),
});

const normalizeAnalysisResult = (data, originalMessage = '') => {
  console.log('[API] Parsing JSON response & normalizing analysis result...');
  const safeData = data && typeof data === 'object' ? data : {};
  let riskScore = clamp(
    Math.round(toNumber(safeData.riskScore ?? safeData.score ?? safeData.risk, 5)),
    0,
    100,
  );
  const rawThreatLevel =
    safeData.threatLevel || safeData.riskLevel || safeData.level || safeData.severity;
  riskScore = Math.max(riskScore, scoreFromThreatLevel(rawThreatLevel));

  const aiThreatFlag =
    typeof safeData.isThreat === 'boolean'
      ? safeData.isThreat
      : typeof safeData.threat === 'boolean'
        ? safeData.threat
        : undefined;

  if (aiThreatFlag === true && riskScore < 41) {
    riskScore = 65;
  }
  if (aiThreatFlag === false && riskScore === 0) {
    riskScore = 5;
  }

  const threatLevel = normalizeThreatLevel(
    rawThreatLevel,
    riskScore,
  );
  const threats = normalizeThreats(safeData);
  const keywords = normalizeKeywords(safeData, threats, riskScore);
  const explanation =
    safeData.explanation ||
    safeData.reason ||
    safeData.analysis ||
    (riskScore > 40
      ? 'Suspicious scam indicators were detected in this message.'
      : 'No scam indicators were detected in this message.');

  return {
    id: safeData.id,
    isThreat: riskScore > 40,
    riskScore,
    threatLevel,
    riskLevel: threatLevel,
    threats,
    keywords,
    entities: normalizeEntities(safeData.entities),
    explanation,
    reason: explanation,
    content: safeData.content || originalMessage,
    createdAt: safeData.createdAt || new Date().toISOString(),
  };
};

const createLocalHistoryId = () =>
  `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const getHistoryTimestamp = item => {
  const timestamp = Date.parse(item?.createdAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const getHistoryKey = item => {
  if (item?.id) {
    return `id:${item.id}`;
  }

  const content = String(item?.content || '')
    .trim()
    .toLowerCase()
    .slice(0, 160);
  const createdMinute = Math.floor(getHistoryTimestamp(item) / 60000);
  return `scan:${content}:${item?.riskScore}:${createdMinute}`;
};

const normalizeHistoryItem = item => {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const normalized = normalizeAnalysisResult(
    item,
    item.content || item.message || '',
  );

  return {
    ...item,
    ...normalized,
    sender: item.sender,
    scanType: item.scanType || item.type,
  };
};

const mergeHistoryItems = (...historyLists) => {
  const byKey = new Map();

  historyLists.flat().forEach(item => {
    const normalized = normalizeHistoryItem(item);
    if (!normalized) {
      return;
    }

    const key = getHistoryKey(normalized);
    const current = byKey.get(key);
    byKey.set(
      key,
      current
        ? {
            ...current,
            ...normalized,
            sender: current.sender || normalized.sender,
            scanType: current.scanType || normalized.scanType,
          }
        : normalized,
    );
  });

  return [...byKey.values()].sort(
    (a, b) => getHistoryTimestamp(b) - getHistoryTimestamp(a),
  );
};

const readLocalHistory = async () => {
  try {
    const raw = await AsyncStorage.getItem(SCAN_HISTORY_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return mergeHistoryItems(parsed).slice(0, MAX_LOCAL_HISTORY_ITEMS);
  } catch (error) {
    logRecoverableApiIssue(
      '[API] Failed to read local scan history:',
      error.message,
    );
    return [];
  }
};

const writeLocalHistory = async history => {
  try {
    await AsyncStorage.setItem(
      SCAN_HISTORY_KEY,
      JSON.stringify(history.slice(0, MAX_LOCAL_HISTORY_ITEMS)),
    );
  } catch (error) {
    logRecoverableApiIssue(
      '[API] Failed to save local scan history:',
      error.message,
    );
  }
};

export const saveScanToHistory = async (scan, metadata = {}) => {
  try {
    const normalized = normalizeAnalysisResult(
      {...scan, ...metadata},
      scan?.content || metadata.message || '',
    );
    const historyItem = {
      ...metadata,
      ...normalized,
      id: normalized.id || scan?.id || createLocalHistoryId(),
      sender: metadata.sender || scan?.sender,
      scanType: metadata.scanType || metadata.type || scan?.scanType || scan?.type,
    };
    const localHistory = await readLocalHistory();
    const nextHistory = mergeHistoryItems([historyItem], localHistory).slice(
      0,
      MAX_LOCAL_HISTORY_ITEMS,
    );

    await writeLocalHistory(nextHistory);
    return historyItem;
  } catch (error) {
    logRecoverableApiIssue(
      '[API] Could not cache scan result locally:',
      error.message,
    );
    return scan;
  }
};

const URL_PATTERN =
  /\b((?:https?:\/\/|www\.)[^\s<>"']+|[a-z0-9][a-z0-9-]{1,63}(?:\.[a-z]{2,})(?:\/[^\s<>"']*)?)/gi;

const extractUrls = text => {
  const matches = String(text || '').match(URL_PATTERN) || [];
  return [...new Set(matches.map(url => url.replace(/[),.;!?]+$/, '')))];
};

const matches = (text, pattern) => pattern.test(String(text || '').toLowerCase());

const addThreat = (threats, keywords, word, confidence, type) => {
  if (!threats.includes(word)) {
    threats.push(word);
  }
  if (!keywords.some(keyword => keyword.word === word)) {
    keywords.push({word, confidence, type});
  }
};

const buildLocalTextFallback = (message, prefix) => {
  const lower = String(message || '').toLowerCase();
  const urls = extractUrls(message);
  const threats = [];
  const keywords = [];
  let score = lower.trim() ? 5 : 10;

  if (urls.length > 0) {
    score += 45;
    addThreat(threats, keywords, 'Suspicious URL', 92, 'phishing');
  }
  if (matches(lower, /\b(bank|account|debit|credit|card|upi|wallet|transaction|aadhaar|aadhar|pan|kyc)\b/)) {
    score += 18;
    addThreat(threats, keywords, 'Banking or KYC language', 88, 'financial');
  }
  if (matches(lower, /\b(otp|one time password|verification code|cvv|pin|password|login|credential)\b/)) {
    score += 25;
    addThreat(threats, keywords, 'Credential or OTP request', 94, 'credential_theft');
  }
  if (matches(lower, /\b(verify|validate|update|reactivate|confirm|unlock|blocked|suspended|frozen|locked)\b/)) {
    score += 20;
    addThreat(threats, keywords, 'Phishing action request', 88, 'phishing');
  }
  if (matches(lower, /\b(immediately|urgent|today|now|within|last chance|act fast|final notice)\b/)) {
    score += 16;
    addThreat(threats, keywords, 'Urgency tactics', 86, 'urgency');
  }
  if (matches(lower, /\b(pay now|payment due|payment failed|refund|claim|cashback|fine|fee|loan|emi|overdue)\b/)) {
    score += 16;
    addThreat(threats, keywords, 'Payment or refund lure', 82, 'financial');
  }
  if (matches(lower, /\b(lottery|winner|won|prize|reward|gift card|jackpot|selected)\b/)) {
    score += 24;
    addThreat(threats, keywords, 'Lottery or prize scam', 90, 'social_engineering');
  }
  if (matches(lower, /\b(apk|install app|download app|download now|enable unknown sources)\b/)) {
    score += 32;
    addThreat(threats, keywords, 'APK download request', 96, 'malware');
  }

  if (
    matches(lower, /\b(swiggy|zomato|delivered successfully|order has been delivered|order delivered)\b/) &&
    urls.length === 0 &&
    threats.length === 0
  ) {
    score = 5;
  }

  const riskScore = clamp(threats.length === 0 ? Math.min(score, 20) : score, 5, 100);
  const threatLevel = normalizeThreatLevel('', riskScore);
  const explanation =
    riskScore > 40
      ? `${prefix} Detected ${threats.join(', ')}.`
      : `${prefix} No phishing patterns, suspicious URLs, urgency tactics, credential theft, APK download requests, or financial fraud indicators were found.`;

  return normalizeAnalysisResult(
    {
      isThreat: riskScore > 40,
      riskScore,
      threatLevel,
      riskLevel: threatLevel,
      threats,
      keywords,
      entities: {urls, phoneNumbers: [], upiIds: []},
      explanation,
    },
    message,
  );
};

const buildImageFallback = () =>
  normalizeAnalysisResult({
    isThreat: true,
    riskScore: 45,
    threatLevel: 'MEDIUM',
    riskLevel: 'MEDIUM',
    threats: ['Image analysis unavailable'],
    keywords: [
      {word: 'Image analysis unavailable', confidence: 70, type: 'service'},
    ],
    entities: {urls: [], phoneNumbers: [], upiIds: []},
    explanation:
      'Image analysis could not complete because the backend service did not respond. Treat unknown links or payment requests in the image as suspicious and retry when the service is available.',
  });

// Request interceptor for debugging logs
api.interceptors.request.use(
  async config => {
    const preferredBaseUrl = config.baseURL || activeBaseUrl || BASE_URL;
    const resolvedBaseUrl = config._backendBaseUrlLocked
      ? preferredBaseUrl
      : await backendManager.resolveBaseUrl({
          preferredBaseUrl,
          reason: `${config.method?.toUpperCase() || 'REQUEST'} ${config.url || ''}`,
        });

    config.baseURL = resolvedBaseUrl || preferredBaseUrl;
    config.metadata = {
      ...(config.metadata || {}),
      startedAt: Date.now(),
    };

    console.log(
      `[API Request] ${config.method?.toUpperCase()} ${formatRequestUrl(config)}`,
    );
    return config;
  },
  error => Promise.reject(error),
);

// Response interceptor for error handling logs
api.interceptors.response.use(
  response => {
    activeBaseUrl = response.config.baseURL || activeBaseUrl || BASE_URL;
    api.defaults.baseURL = activeBaseUrl;
    backendManager.markSuccess(activeBaseUrl, 'response');
    const durationMs = response.config.metadata?.startedAt
      ? Date.now() - response.config.metadata.startedAt
      : undefined;
    console.log(
      `[API Response] ${response.config.url} => Status:`,
      response.status,
      durationMs ? `(${durationMs}ms)` : '',
    );
    return response;
  },
  async error => {
    const details = describeAxiosError(error);
    const currentBaseUrl = error.config?.baseURL || activeBaseUrl || BASE_URL;
    const triedBaseUrls = unique([
      ...(error.config?._triedBaseUrls || []),
      currentBaseUrl,
    ]);

    if (error.response) {
      backendManager.markSuccess(currentBaseUrl, 'error-response');
      console.error(
        '[API Error - Response Data]',
        error.response.status,
        error.response.data,
      );
    } else if (
      details.retryable &&
      error.config &&
      shouldRetryWithAlternateHost(details)
    ) {
      backendManager.markFailure(currentBaseUrl, details, 'request');
      const nextBaseUrl = await backendManager.getNextRetryBaseUrl({
        triedBaseUrls,
        reason: `${error.config.method?.toUpperCase() || 'REQUEST'} ${error.config.url || ''}`,
      });

      if (nextBaseUrl && error.config) {
        logRecoverableApiIssue(
          '[API Warning - Retrying with alternate backend host]',
          `${currentBaseUrl} failed (${details.type}: ${details.message}). Trying ${nextBaseUrl}.`,
        );
        return api.request({
          ...error.config,
          baseURL: nextBaseUrl,
          _backendBaseUrlLocked: true,
          _triedBaseUrls: triedBaseUrls,
        });
      }

      logRecoverableApiIssue(
        '[API Warning - Backend Unreachable]',
        `${triedBaseUrls.join(', ')} did not respond.`,
        `type=${details.type}`,
        details.code ? `code=${details.code}` : '',
        getBackendDiagnosticHint(currentBaseUrl, details),
        error.message,
      );
    } else {
      console.error(
        '[API Error - Setup Message]',
        details.code ? `code=${details.code}` : '',
        details.message,
      );
    }
    return Promise.reject(error);
  },
);

/**
 * Analyze a text message for threats.
 */
export const analyzeMessage = async (message, metadata = {}) => {
  try {
    const response = await requestWithRetry(
      () => api.post('/analyze', {message}, {timeout: TEXT_ANALYSIS_TIMEOUT_MS}),
      0,
    );
    const result = normalizeAnalysisResult(response.data, message);
    await saveScanToHistory(result, {
      ...metadata,
      message,
      scanType: metadata.scanType || 'text',
    });
    return result;
  } catch (error) {
    logRecoverableApiIssue(
      '[API] Text analysis unavailable after retries, using local fallback:',
      error.message,
    );
    const fallbackResult = buildLocalTextFallback(
      message,
      'Backend analysis was temporarily unavailable, so Kinetic Vault used local scam detection rules.',
    );
    await saveScanToHistory(fallbackResult, {
      ...metadata,
      message,
      scanType: metadata.scanType || 'text',
    });
    return fallbackResult;
  }
};

/**
 * Analyze an image (OCR + threat detection).
 */
export const analyzeImage = async imageFile => {
  const formData = new FormData();
  formData.append('image', {
    uri: imageFile.uri,
    type: imageFile.type || 'image/jpeg',
    name: imageFile.fileName || 'image.jpg',
  });

  try {
    const response = await requestWithRetry(() =>
      api.post('/analyze-image', formData, {
        headers: {
          Accept: 'application/json',
          // Content-Type MUST NOT be manually set to allow React Native attaching boundary natively
        },
        timeout: IMAGE_TIMEOUT_MS,
      }),
    );
    const result = normalizeAnalysisResult(response.data);
    await saveScanToHistory(result, {scanType: 'image'});
    return result;
  } catch (error) {
    logRecoverableApiIssue(
      '[API] Image analysis unavailable after retries, using safe fallback:',
      error.message,
    );
    const fallbackResult = buildImageFallback();
    await saveScanToHistory(fallbackResult, {scanType: 'image'});
    return fallbackResult;
  }
};

/**
 * Generate a report for a given message ID.
 */
export const generateReport = async messageId => {
  const response = await requestWithRetry(() => api.post('/report', {messageId}));
  return response.data;
};

/**
 * Get scan history.
 */
export const getHistory = async () => {
  const localHistory = await readLocalHistory();

  try {
    const response = await api.get('/history', {timeout: HISTORY_TIMEOUT_MS});
    const remoteHistory = Array.isArray(response.data) ? response.data : [];
    const mergedHistory = mergeHistoryItems(remoteHistory, localHistory).slice(
      0,
      MAX_LOCAL_HISTORY_ITEMS,
    );

    if (mergedHistory.length > 0) {
      await writeLocalHistory(mergedHistory);
    }

    return mergedHistory;
  } catch (error) {
    logRecoverableApiIssue(
      '[API] History unavailable, showing local scan history:',
      error.message,
    );
    return localHistory;
  }
};

/**
 * Get PDF report URL for a message.
 */
export const getPdfReportUrl = messageId => {
  return `${activeBaseUrl}/report/pdf/${messageId}`;
};

export default api;
