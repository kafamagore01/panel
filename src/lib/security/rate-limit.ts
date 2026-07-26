import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Upstash Redis tabanlı oran sınırlama.
 * Yerel geliştirmede bounded process-memory fallback kullanılır. Üretimde
 * dağıtık Redis yapılandırması yoksa istekler fail-closed reddedilir.
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

export function isDistributedRateLimitConfigured(): boolean {
  return hasUpstash;
}

export type LimitResult = { success: boolean; remaining: number; reset: number };

const limiters = new Map<string, Ratelimit | null>();
const memoryLimits = new Map<string, { count: number; reset: number }>();
const MAX_MEMORY_ENTRIES = 10_000;

function evictMemoryEntries(now: number): void {
  for (const [key, entry] of memoryLimits) {
    if (entry.reset <= now) memoryLimits.delete(key);
  }
  while (memoryLimits.size >= MAX_MEMORY_ENTRIES) {
    const oldest = memoryLimits.keys().next().value;
    if (typeof oldest !== "string") break;
    memoryLimits.delete(oldest);
  }
}

function memoryLimit(
  prefix: string,
  tokens: number,
  identifier: string
): LimitResult {
  const now = Date.now();
  const key = `${prefix}:${identifier}`;
  let entry = memoryLimits.get(key);
  if (!entry || entry.reset <= now) {
    evictMemoryEntries(now);
    entry = { count: 0, reset: now + 60_000 };
  }
  entry.count += 1;
  // Erişim sırasını koruyarak en eski anahtarların tahliyesini kolaylaştır.
  memoryLimits.delete(key);
  memoryLimits.set(key, entry);
  return {
    success: entry.count <= tokens,
    remaining: Math.max(0, tokens - entry.count),
    reset: entry.reset,
  };
}

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
    if (process.env.NODE_ENV === "production") {
      return { success: false, remaining: 0, reset: Date.now() + 60_000 };
    }
    return memoryLimit(prefix, tokens, identifier);
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
