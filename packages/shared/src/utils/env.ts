export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

export function parseJsonEnv<T>(name: string): T {
  const value = requireEnv(name);
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`Invalid JSON in environment variable: ${name}`);
  }
}
