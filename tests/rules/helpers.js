import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rules = readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8');

export async function makeEnv() {
  return initializeTestEnvironment({
    projectId: 'motus-test',
    firestore: {
      rules,
      host: '127.0.0.1',
      port: 8080,
    },
  });
}

export { assertFails, assertSucceeds };
