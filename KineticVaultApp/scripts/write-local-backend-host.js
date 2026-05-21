const fs = require('fs');
const childProcess = require('child_process');
const os = require('os');
const path = require('path');

const outputPath = path.resolve(__dirname, '../src/services/backendHost.js');
const BACKEND_PORT = '8080';

const getAdbExecutable = () => {
  const candidates = [
    process.env.ADB,
    process.env.ANDROID_HOME &&
      path.join(process.env.ANDROID_HOME, 'platform-tools', 'adb.exe'),
    process.env.ANDROID_SDK_ROOT &&
      path.join(process.env.ANDROID_SDK_ROOT, 'platform-tools', 'adb.exe'),
    process.env.LOCALAPPDATA &&
      path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
    'adb',
  ].filter(Boolean);

  return candidates.find(candidate => {
    if (candidate === 'adb') {
      return true;
    }
    return fs.existsSync(candidate);
  });
};

const adbExecutable = getAdbExecutable();
let adbProbeAvailable = true;

const isPrivateIPv4 = address =>
  /^10\./.test(address) ||
  /^192\.168\./.test(address) ||
  /^172\.(1[6-9]|2\d|3[0-1])\./.test(address);

const isVirtualInterface = name =>
  /virtual|vmware|vbox|docker|hyper-v|wsl|loopback|npcap/i.test(name);

const getCandidates = () =>
  Object.entries(os.networkInterfaces())
    .flatMap(([name, addresses]) =>
      (addresses || []).map(address => ({
        name,
        address: address.address,
        family: address.family,
        internal: address.internal,
      })),
    )
    .filter(
      item =>
        item.family === 'IPv4' &&
        !item.internal &&
        isPrivateIPv4(item.address) &&
        !isVirtualInterface(item.name),
    )
    .sort((a, b) => {
      const aPreferred = /wi-?fi|wlan|ethernet|en\d/i.test(a.name) ? 0 : 1;
      const bPreferred = /wi-?fi|wlan|ethernet|en\d/i.test(b.name) ? 0 : 1;
      return aPreferred - bPreferred;
    });

const normalizeHost = value =>
  String(value || '')
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    .split(':')[0]
    .trim();

const runAdb = args => {
  try {
    return childProcess
      .execFileSync(adbExecutable, args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      .trim();
  } catch (error) {
    adbProbeAvailable = false;
    return '';
  }
};

const readExistingBackendMode = () => {
  try {
    const existing = fs.readFileSync(outputPath, 'utf8');
    const host = existing.match(/LOCAL_BACKEND_HOST = '([^']*)'/)?.[1] || '';
    const mode = existing.match(/LOCAL_BACKEND_MODE = '([^']*)'/)?.[1] || '';
    const reverse = /ADB_REVERSE_ACTIVE = true/.test(existing);
    return {host, mode, reverse};
  } catch (error) {
    return {host: '', mode: '', reverse: false};
  }
};

const getConnectedDeviceIds = () =>
  runAdb(['devices'])
    .split(/\r?\n/)
    .slice(1)
    .map(line => line.trim().split(/\s+/))
    .filter(([id, state]) => id && state === 'device')
    .map(([id]) => id);

const ensureAdbReverse = () => {
  const devices = getConnectedDeviceIds();

  if (devices.length === 0) {
    return false;
  }

  runAdb(['reverse', `tcp:${BACKEND_PORT}`, `tcp:${BACKEND_PORT}`]);

  const reverseList = runAdb(['reverse', '--list']);
  return reverseList
    .split(/\r?\n/)
    .some(line => {
      const tokens = line.trim().split(/\s+/);
      return (
        tokens.includes(`tcp:${BACKEND_PORT}`) &&
        tokens.filter(token => token === `tcp:${BACKEND_PORT}`).length >= 2
      );
    });
};

const requestedMode = String(
  process.env.BACKEND_CONNECTION_MODE || process.argv[3] || 'auto',
)
  .trim()
  .toLowerCase();
const requestedHost = normalizeHost(process.env.LOCAL_BACKEND_HOST || process.argv[2]);
const adbReverseActive = requestedMode !== 'lan' && ensureAdbReverse();
const lanHost = requestedHost || getCandidates()[0]?.address || '';
const existingConfig = readExistingBackendMode();
const preserveExistingReverse =
  !adbProbeAvailable &&
  !requestedHost &&
  requestedMode === 'auto' &&
  (existingConfig.reverse || existingConfig.mode === 'adb-reverse');
const effectiveAdbReverseActive = adbReverseActive || preserveExistingReverse;
const selectedMode = effectiveAdbReverseActive
  ? 'adb-reverse'
  : requestedMode === 'lan'
    ? 'lan'
    : 'auto';
const selectedHost = effectiveAdbReverseActive ? '127.0.0.1' : lanHost;

const contents = `// This file is refreshed by \`npm run configure:backend\`.
// USB tethering/physical USB debug uses adb reverse and 127.0.0.1.
// Wi-Fi mode uses the computer LAN IP.
export const LOCAL_BACKEND_HOST = '${selectedHost}';
export const LOCAL_BACKEND_MODE = '${selectedMode}';
export const ADB_REVERSE_ACTIVE = ${effectiveAdbReverseActive};
`;

fs.writeFileSync(outputPath, contents);

if (effectiveAdbReverseActive) {
  console.log('[backend-config] adb reverse active: tcp:8080 -> tcp:8080');
  console.log('[backend-config] Local backend host set to 127.0.0.1 for USB/adb reverse mode');
} else if (selectedHost) {
  console.log(`[backend-config] Local backend host set to ${selectedHost} (${selectedMode} mode)`);
  console.log('[backend-config] adb reverse not active; physical devices need Wi-Fi/LAN reachability for this host.');
} else {
  console.log('[backend-config] No backend route detected. Connect a USB-debuggable device or set LOCAL_BACKEND_HOST.');
}
