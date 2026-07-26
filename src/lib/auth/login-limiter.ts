import {
  getRedis,
  isDistributedRateLimitConfigured,
} from "@/lib/security/rate-limit";

/**
 * Giriş deneme sınırlaması: e-posta ve IP başına 5 başarısız denemeden sonra
 * 15 dakika kilitleme. Upstash Redis yoksa süreç içi bellek kullanılır.
 */

const WINDOW_SECONDS = 15 * 60;
const MAX_FAILURES = 5;
const MAX_MEMORY_ENTRIES = 10_000;

const memory = new Map<string, { count: number; resetAt: number }>();

function sweepMemory(now = Date.now()): void {
  for (const [key, entry] of memory) {
    if (entry.resetAt <= now) memory.delete(key);
  }
  while (memory.size >= MAX_MEMORY_ENTRIES) {
    const oldest = memory.keys().next().value;
    if (typeof oldest !== "string") break;
    memory.delete(oldest);
  }
}

function keysFor(email: string, ip: string | null): string[] {
  const keys = [`login:fail:e:${email.toLowerCase()}`];
  if (ip) keys.push(`login:fail:ip:${ip}`);
  return keys;
}

function memoryGet(key: string): number {
  const entry = memory.get(key);
  if (!entry || entry.resetAt < Date.now()) {
    memory.delete(key);
    return 0;
  }
  return entry.count;
}

export async function isLoginLocked(
  email: string,
  ip: string | null
): Promise<boolean> {
  const redis = getRedis();
  const keys = keysFor(email, ip);
  if (!redis && process.env.NODE_ENV === "production") {
    return true;
  }
  if (redis) {
    const counts = await Promise.all(keys.map((k) => redis.get<number>(k)));
    return counts.some((c) => (c ?? 0) >= MAX_FAILURES);
  }
  return keys.some((k) => memoryGet(k) >= MAX_FAILURES);
}

export async function registerLoginFailure(
  email: string,
  ip: string | null
): Promise<void> {
  const redis = getRedis();
  const keys = keysFor(email, ip);
  if (!redis && process.env.NODE_ENV === "production") return;
  if (redis) {
    await Promise.all(
      keys.map(async (k) => {
        const count = await redis.incr(k);
        if (count === 1) await redis.expire(k, WINDOW_SECONDS);
      })
    );
    return;
  }
  for (const k of keys) {
    const current = memoryGet(k);
    if (!memory.has(k)) sweepMemory();
    memory.set(k, {
      count: current + 1,
      resetAt: Date.now() + WINDOW_SECONDS * 1000,
    });
  }
}

export async function clearLoginFailures(
  email: string
): Promise<void> {
  const redis = getRedis();
  const keys = keysFor(email, null);
  if (!redis && process.env.NODE_ENV === "production") return;
  if (redis) {
    await Promise.all(keys.map((k) => redis.del(k)));
    return;
  }
  for (const k of keys) memory.delete(k);
}

/** Startup/env denetimlerinin doğrudan kullanabilmesi için açık durum sinyali. */
export function hasDistributedLoginLimiter(): boolean {
  return isDistributedRateLimitConfigured();
}
