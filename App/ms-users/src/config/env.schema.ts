import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  PORT: z.coerce.number().int().min(1).max(65535).default(3001),

  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  TRUST_PROXY: z.string().optional(),

  DB_HOST: z.string().min(1),

  DB_PORT: z.coerce.number().int().min(1).max(65535).default(5432),

  DB_USERNAME: z.string().min(1),

  DB_PASSWORD: z.string().min(12),

  DB_DATABASE: z.string().min(1),

  DB_SSL: z.enum(['true', 'false']).default('false'),

  RATE_LIMIT_TTL_MS: z.coerce.number().int().positive().default(60000),

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

  RATE_LIMIT_BLOCK_MS: z.coerce.number().int().positive().default(60000),

  /*
   * JWT
   */

  JWT_PRIVATE_KEY_PATH: z.string().min(1).default('secrets/jwt-private.pem'),
  JWT_PUBLIC_KEY_PATH: z.string().min(1).default('secrets/jwt-public.pem'),
  AUTH_TLS_CERT_PATH: z.string().min(1).default('secrets/auth-tls.crt'),
  AUTH_TLS_KEY_PATH: z.string().min(1).default('secrets/auth-tls.key'),
  AUTH_BIND_HOST: z.string().min(1).default('127.0.0.1'),
  AUTH_INTERNAL_PORT: z.coerce.number().int().min(1).max(65535).default(3443),
  STEGO_SERVICE_TOKEN: z.string().regex(/^[a-f0-9]{64,}$/),
  JWT_EXPIRES_IN_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(3600)
    .default(900),

  JWT_ISSUER: z.string().min(1).default('user-service'),

  JWT_AUDIENCE: z.string().min(1).default('secure-shop-api'),
});
