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
  TRADER1_USERNAME: required('TRADER1_USERNAME'),
  TRADER1_PASSWORD: required('TRADER1_PASSWORD'),
  TRADER2_USERNAME: required('TRADER2_USERNAME'),
  TRADER2_PASSWORD: required('TRADER2_PASSWORD'),
  APPROVER1_USERNAME: required('APPROVER1_USERNAME'),
  APPROVER1_PASSWORD: required('APPROVER1_PASSWORD'),
};
