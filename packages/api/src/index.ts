import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '../../..');

config({ path: resolve(rootDir, '.env.local') });
config({ path: resolve(rootDir, '.env') });

export { createApp, startServer } from './server.js';

if (process.argv[1] === import.meta.url.slice(8) || process.argv[1]?.endsWith('index.ts')) {
  import('./server.js').then(({ startServer }) => startServer());
}
