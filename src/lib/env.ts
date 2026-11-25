// Environment validation without a schema library.
// Zod was used here only to check four variables, and it pulled a large chunk
// into the entry bundle on the bootstrap path, so the checks are plain code.

type EnvMode = 'development' | 'staging' | 'production';
const MODES: readonly EnvMode[] = ['development', 'staging', 'production'];

const raw = import.meta.env as Record<string, unknown>;
const issues: string[] = [];

function readString(key: string): string | undefined {
  const value = raw[key];
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string') {
    issues.push(`  ${key}: must be a string`);
    return undefined;
  }
  return value;
}

function isAbsoluteUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

const traccarUrl = readString('VITE_TRACCAR_URL') ?? '';
if (traccarUrl && !isAbsoluteUrl(traccarUrl)) {
  issues.push('  VITE_TRACCAR_URL: must be an absolute URL');
}

const basePath = readString('VITE_BASE_PATH') ?? '';

const sentryDsn = readString('VITE_SENTRY_DSN');
if (sentryDsn && !isAbsoluteUrl(sentryDsn)) {
  issues.push('  VITE_SENTRY_DSN: must be an absolute URL');
}

const sentryEnvRaw = readString('VITE_SENTRY_ENV');
const sentryEnv: EnvMode =
  sentryEnvRaw && MODES.includes(sentryEnvRaw as EnvMode)
    ? (sentryEnvRaw as EnvMode)
    : 'production';
if (sentryEnvRaw && !MODES.includes(sentryEnvRaw as EnvMode)) {
  issues.push(`  VITE_SENTRY_ENV: must be one of ${MODES.join(', ')}`);
}

if (issues.length) {
  console.warn(`[env] Invalid environment variables:\n${issues.join('\n')}`);
}

export const env = {
  ...raw,
  VITE_TRACCAR_URL: traccarUrl,
  VITE_BASE_PATH: basePath,
  VITE_SENTRY_DSN: sentryDsn,
  VITE_SENTRY_ENV: sentryEnv,
} as {
  VITE_TRACCAR_URL: string;
  VITE_BASE_PATH: string;
  VITE_SENTRY_DSN?: string;
  VITE_SENTRY_ENV: EnvMode;
  [key: string]: unknown;
};
