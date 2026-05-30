export const DEFAULT_API_PORT = 3001;
export const DEFAULT_WEB_PORT = 3000;

export function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}
