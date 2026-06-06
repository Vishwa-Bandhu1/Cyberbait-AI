import {NativeModules, Platform} from 'react-native';
import {
  ADB_REVERSE_ACTIVE,
  LOCAL_BACKEND_HOST,
  LOCAL_BACKEND_MODE,
} from './backendHost';



export const getHostFromUrl = url => {
  const match = url?.match(/^https?:\/\/\[?([^:/\]]+)\]?(?::\d+)?/);
  return match?.[1];
};

const sourceCodeConstants = NativeModules.SourceCode?.getConstants?.();

export const bundlerUrl =
  NativeModules.SourceCode?.scriptURL || sourceCodeConstants?.scriptURL;

export const bundlerHost =
  getHostFromUrl(bundlerUrl) ||
  Platform.constants?.ServerHost?.split(':')?.[0];

export const isLoopbackHost = host => false;

export const isPrivateLanHost = host => false;

export const isLikelyAndroidEmulator = () => {
  if (Platform.OS !== 'android') {
    return false;
  }

  const constants = Platform.constants || {};
  const deviceText = [
    constants.Brand,
    constants.Fingerprint,
    constants.Manufacturer,
    constants.Model,
    constants.Release,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return (
    deviceText.includes('emulator') ||
    deviceText.includes('generic') ||
    deviceText.includes('genymotion') ||
    deviceText.includes('sdk_gphone') ||
    deviceText.includes('google_sdk') ||
    deviceText.includes('ranchu') ||
    deviceText.includes('goldfish')
  );
};

export const getRuntimeTarget = () => {
  if (Platform.OS === 'web') {
    return 'web';
  }

  if (Platform.OS === 'android') {
    return isLikelyAndroidEmulator() ? 'android-emulator' : 'android-device';
  }

  return Platform.OS;
};



export const isAdbReverseMode = () => false;

export const getLocalBackendHostCandidates = () => {
  return [];
};

export const getApiBaseUrls = ({useDeployed, deployedUrl}) => {
  if (useDeployed) {
    return [deployedUrl];
  }

  return [];
};

export const describeAxiosError = error => {
  const status = error?.response?.status;
  const code = error?.code;
  const message = error?.message || 'Unknown network error';
  const lowerMessage = message.toLowerCase();

  if (status) {
    return {
      type: 'http',
      retryable: status === 408 || status === 425 || status === 429 || status >= 500,
      message: `HTTP ${status}`,
      status,
      code,
    };
  }

  if (code === 'ECONNABORTED' || /timeout/i.test(message)) {
    return {
      type: 'timeout',
      retryable: true,
      message: 'Request timed out before the backend responded',
      code: code || 'ECONNABORTED',
    };
  }

  if (
    lowerMessage.includes('connection refused') ||
    lowerMessage.includes('econnrefused')
  ) {
    return {
      type: 'refused',
      retryable: true,
      message: 'Backend host is reachable but refused the connection',
      code: code || 'ECONNREFUSED',
    };
  }

  if (
    lowerMessage.includes('network is unreachable') ||
    lowerMessage.includes('enetunreach') ||
    lowerMessage.includes('ehostunreach') ||
    lowerMessage.includes('unable to resolve host') ||
    lowerMessage.includes('no address associated')
  ) {
    return {
      type: 'no-internet-or-route',
      retryable: true,
      message: 'Device has no route to the backend host',
      code: code || 'ENETUNREACH',
    };
  }

  if (error?.request) {
    return {
      type: 'unreachable',
      retryable: true,
      message: 'No response received from backend host',
      code,
    };
  }

  return {
    type: 'setup',
    retryable: false,
    message,
    code,
  };
};

export const getDebugNetworkSummary = () => ({
  platform: Platform.OS,
  runtimeTarget: getRuntimeTarget(),
  configuredLanHost: LOCAL_BACKEND_HOST || '(none)',
  backendMode: LOCAL_BACKEND_MODE || 'auto',
  adbReverseActive: ADB_REVERSE_ACTIVE === true,
  bundlerHost: bundlerHost || '(unknown)',
  bundlerUrl: bundlerUrl || '(unknown)',
});
