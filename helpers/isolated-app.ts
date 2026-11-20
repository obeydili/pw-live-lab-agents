import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { env } from './env';

const APP_DIR = env.APP_DIR ?? fileURLToPath(new URL('../practice-app-v2', import.meta.url));
const START_TIMEOUT_MS = 15_000;

export interface IsolatedApp {
  readonly baseURL: string;
  stop(): Promise<void>;
}

async function findFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (address === null || typeof address === 'string') {
    throw new Error('Could not find a free port for the isolated app');
  }
  return address.port;
}

function waitForListening(child: ChildProcess): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Isolated app did not start within ${START_TIMEOUT_MS} ms`)),
      START_TIMEOUT_MS,
    );
    child.stdout?.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes('running on')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Isolated app exited early with code ${code}`));
    });
  });
}

/** Starts a private Practice-App-v2 with its own in-memory data, so no other worker can write to it. */
export async function startIsolatedApp(): Promise<IsolatedApp> {
  const port = await findFreePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: APP_DIR,
    env: { PATH: process.env.PATH, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await waitForListening(child);
  return {
    baseURL: `http://localhost:${port}`,
    stop: () =>
      new Promise<void>((resolve) => {
        if (child.exitCode !== null) {
          resolve();
          return;
        }
        child.once('exit', () => resolve());
        child.kill();
      }),
  };
}
