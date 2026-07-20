// Environment variable validation with Zod
import { z } from 'zod';

const envSchema = z.object({
  VITE_TRACCAR_URL: z.string().url().optional().or(z.literal('')).default(''),
  VITE_BASE_PATH: z.string().optional(),
  VITE_SENTRY_DSN: z.string().url().optional(),
  VITE_SENTRY_ENV: z.enum(['development', 'staging', 'production']).optional().default('production'),
});

function parseEnv() {
  try {
    return envSchema.parse(import.meta.env);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const issues = err.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
      console.warn(`[env] Invalid environment variables:\n${issues}`);
    }
    // Fallback to raw env on validation failure
    return import.meta.env as Record<string, string>;
  }
}

export const env = parseEnv();
