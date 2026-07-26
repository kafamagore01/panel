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

const limiters = new Map<string, Ratelimit | null>();

/** Prefix başına tek Ratelimit örneği; Redis yoksa null (sınırlama kapalı). */
function limiterFor(prefix: string, tokens: number): Ratelimit | null {
  if (!limiters.has(prefix)) {
    const redis = getRedis();
    limiters.set(
      prefix,
      redis
        ? new Ratelimit({
            redis,
            limiter: Ratelimit.slidingWindow(tokens, "1 m"),
            prefix,
          })
        : null
    );
  }
  return limiters.get(prefix) ?? null;
}

async function limit(
  prefix: string,
  tokens: number,
  identifier: string
): Promise<LimitResult> {
  const limiter = limiterFor(prefix, tokens);
  if (!limiter) {
    return { success: true, remaining: tokens, reset: Date.now() + 60_000 };
  }
  const result = await limiter.limit(identifier);
  return {
    success: result.success,
    remaining: result.remaining,
    reset: result.reset,
  };
}

/** Lisans doğrulama API'si: IP başına dakikada 60 istek. */
export function limitValidateApi(ip: string): Promise<LimitResult> {
  return limit("rl:validate", 60, ip);
}

/** Aktivasyon bırakma API'si: IP başına dakikada 20 istek. */
export function limitDeactivateApi(ip: string): Promise<LimitResult> {
  return limit("rl:deactivate", 20, ip);
}
