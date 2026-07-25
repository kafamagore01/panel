import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Upstash Redis tabanlı oran sınırlama.
 * Ortam değişkenleri tanımlı değilse (yerel geliştirme) sınırlama devre dışı
 * kalır ve tüm istekler kabul edilir — üretimde mutlaka tanımlı olmalıdır.
 */

const hasUpstash = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

let redisClient: Redis | null = null;

export function getRedis(): Redis | null {
  if (!hasUpstash) return null;
  redisClient ??= Redis.fromEnv();
  return redisClient;
}

export type LimitResult = { success: boolean; remaining: number; reset: number };

let validateLimiter: Ratelimit | null | undefined;

/** Lisans doğrulama API'si: IP başına dakikada 60 istek. */
export async function limitValidateApi(ip: string): Promise<LimitResult> {
  if (validateLimiter === undefined) {
    const redis = getRedis();
    validateLimiter = redis
      ? new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(60, "1 m"),
          prefix: "rl:validate",
        })
      : null;
  }
  if (!validateLimiter) {
    return { success: true, remaining: 60, reset: Date.now() + 60_000 };
  }
  const result = await validateLimiter.limit(ip);
  return {
    success: result.success,
    remaining: result.remaining,
    reset: result.reset,
  };
}
