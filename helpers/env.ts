try {
  process.loadEnvFile('.env');
} catch {
  // It's okay if the file is missing in some environments
}
function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Environment variable ${key} is missing! Check your .env file.`);
  }
  return value;
}

export const env = {
  BASE_URL: process.env.BASE_URL ?? 'http://localhost:3300',
  /** Optional: run isolated apps from another copy of Practice-App-v2 (for example a deliberately broken one). */
  APP_DIR: process.env.APP_DIR,
  TRADER1_USERNAME: required('TRADER1_USERNAME'),
  TRADER1_PASSWORD: required('TRADER1_PASSWORD'),
  TRADER2_USERNAME: required('TRADER2_USERNAME'),
  TRADER2_PASSWORD: required('TRADER2_PASSWORD'),
  APPROVER1_USERNAME: required('APPROVER1_USERNAME'),
  APPROVER1_PASSWORD: required('APPROVER1_PASSWORD'),
};

export interface Credentials {
  username: string;
  password: string;
}

export const credentials = {
  trader1: { username: env.TRADER1_USERNAME, password: env.TRADER1_PASSWORD },
  trader2: { username: env.TRADER2_USERNAME, password: env.TRADER2_PASSWORD },
  approver1: { username: env.APPROVER1_USERNAME, password: env.APPROVER1_PASSWORD },
} as const satisfies Record<string, Credentials>;
