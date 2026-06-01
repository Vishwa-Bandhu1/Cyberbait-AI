const fs = require('fs');
const path = require('path');

const outputPath = path.resolve(__dirname, '../src/services/backendHost.js');

const contents = `// Production-only configuration. Local fallback is disabled.
export const LOCAL_BACKEND_HOST = '';
export const LOCAL_BACKEND_MODE = 'deployed';
export const ADB_REVERSE_ACTIVE = false;
`;

fs.writeFileSync(outputPath, contents);
console.log('[backend-config] Configured for production deployment at https://cyberbait-ai.onrender.com');
