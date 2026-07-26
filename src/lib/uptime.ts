import net from "node:net";
import { prisma } from "@/lib/db/prisma";
import {
  resolveSafeHostname,
  safeHttpRequest,
  SsrfError,
} from "@/lib/security/ssrf-guard";
import type {
  CheckItem,
  OverallState,
  UptimeReport,
} from "@/lib/uptime-types";

/**
 * Çalışma alanındaki projelerin canlı adreslerine ve sunucularına
 * erişilebilirlik kontrolü.
 *
 * Siteler: HTTP isteği (yanıt gövdesi hiçbir zaman okunmaz/döndürülmez).
 * Sunucular: SSH portuna TCP el sıkışması — giriş denemesi yapılmaz, kimlik
 * bilgisi gönderilmez, bağlantı kurulur kurulmaz kapatılır.
 */

export type { CheckItem, UptimeReport } from "@/lib/uptime-types";

/** Site (HTTP) kontrolü için azami süre. */
const HTTP_TIMEOUT_MS = 8_000;
/** Sunucu (TCP) kontrolü için azami süre. */
const TCP_TIMEOUT_MS = 5_000;
/** Aynı çalışma alanı için sonucun paylaşıldığı süre (poll aralığından kısa). */
const CACHE_TTL_MS = 45_000;
/** Tek turda kontrol edilecek azami kayıt sayısı (site ve sunucu için ayrı ayrı). */
const MAX_TARGETS = 50;
/** Aynı anda açılabilecek azami HTTP/TCP bağlantısı. */
const MAX_CONCURRENT_CHECKS = 10;
/** Aşırı sayıda workspace isteğinde process kuyruğunun büyümesini sınırlar. */
const MAX_PENDING_CHECKS = 200;
/** Kullanıcının zorla yenileme isteği için asgari bekleme süresi. */
const FORCE_REFRESH_MIN_INTERVAL_MS = 15_000;
/** Uzun ömürlü process'te workspace cache'inin azami anahtar sayısı. */
const MAX_CACHE_ENTRIES = 500;

const cache = new Map<string, { at: number; report: Promise<UptimeReport> }>();
let activeChecks = 0;
const checkWaiters: Array<() => void> = [];

/** Yalnızca http/https adresleri kontrol edilir. */
function parseUrl(raw: string): URL | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

function describeFetchError(error: unknown): string {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return "Zaman aşımı";
  }
  if (error instanceof Error && error.name === "AbortError") {
    return "Zaman aşımı";
  }
  if (error instanceof SsrfError) {
    return "Güvenli olmayan hedef";
  }
  return "Bağlantı kurulamadı";
}

function describeSocketError(error: NodeJS.ErrnoException): string {
  switch (error.code) {
    case "ECONNREFUSED":
      return "Bağlantı reddedildi";
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return "Adres çözülemedi";
    case "EHOSTUNREACH":
    case "ENETUNREACH":
      return "Sunucuya ulaşılamıyor";
    case "ECONNRESET":
      return "Bağlantı sıfırlandı";
    default:
      return "Bağlantı kurulamadı";
  }
}

/**
 * Bir HTTP yanıtı sitenin erişilebilir olduğunu gösteriyor mu?
 *
 * 401/403, uygulamanın veya güvenlik katmanının isteği bilinçli olarak
 * yanıtladığını gösterir. Bu ekran içerik doğruluğunu değil çalışma durumunu
 * izlediği için bu iki erişim-korumalı yanıtı "çalışıyor" kabul eder.
 */
function isReachableStatus(status: number): boolean {
  return status < 400 || status === 401 || status === 403;
}

/** Tek bir adresin erişilebilirliğini ölçer. Yanıt gövdesi okunmaz. */
export async function checkUrl(
  raw: string,
  meta: { id: string; name: string }
): Promise<CheckItem> {
  const url = parseUrl(raw);
  if (!url) {
    return {
      ...meta,
      target: raw,
      state: "down",
      response_ms: null,
      error: "Geçersiz adres",
    };
  }

  const target = url;
  const started = Date.now();

  async function request(method: "HEAD" | "GET") {
    return safeHttpRequest(target, {
      method,
      allowedProtocols: ["http:", "https:"],
      redirect: "follow",
      maxRedirects: 3,
      timeoutMs: HTTP_TIMEOUT_MS,
      maxResponseBytes: 0,
      subject: "Uptime hedefi",
      headers: { "user-agent": "OperasyonMerkezi-SistemDurumu/1.0" },
    });
  }

  try {
    let usedGet = false;
    let res: Awaited<ReturnType<typeof request>>;

    try {
      res = await request("HEAD");
    } catch (error) {
      if (error instanceof SsrfError) throw error;
      // HEAD bağlantısı başarısız olsa bile tarayıcıların kullandığı GET
      // yöntemi çalışabilir; kapalı demeden önce onu da dene.
      res = await request("GET");
      usedGet = true;
    }

    // CDN/WAF katmanları çalışan bir site için HEAD isteğini 401/403/405 ile
    // reddedebilir. Hatalı "kapalı" sonucunu önlemek için gerçek sayfa
    // yöntemiyle doğrula; gövdeyi indirmeden hemen iptal et.
    if (!usedGet && res.status >= 400) {
      res = await request("GET");
    }
    const ok = isReachableStatus(res.status);
    return {
      ...meta,
      target: target.host,
      state: ok ? "up" : "down",
      response_ms: Date.now() - started,
      error: ok ? null : `HTTP ${res.status}`,
    };
  } catch (error) {
    return {
      ...meta,
      target: target.host,
      state: "down",
      response_ms: Date.now() - started,
      error: describeFetchError(error),
    };
  }
}

/**
 * Bir host:port çiftine TCP bağlantısı kurulabiliyor mu?
 * Yalnızca el sıkışma yapılır; veri gönderilmez, bağlantı hemen kapatılır.
 */
export function checkTcp(
  host: string,
  port: number,
  meta: { id: string; name: string }
): Promise<CheckItem> {
  const started = Date.now();

  return resolveSafeHostname(host, {
    timeoutMs: TCP_TIMEOUT_MS,
    subject: "Sunucu hedefi",
  })
    .then(
      (addresses) =>
        new Promise<CheckItem>((resolve) => {
          const target = addresses[0];
          const socket = new net.Socket();
          let settled = false;
          const remainingTimeout = Math.max(
            1,
            TCP_TIMEOUT_MS - (Date.now() - started)
          );

          function finish(state: "up" | "down", error: string | null) {
            if (settled) return;
            settled = true;
            socket.destroy();
            resolve({
              ...meta,
              target: `${host}:${port}`,
              state,
              response_ms: Date.now() - started,
              error,
            });
          }

          socket.setTimeout(remainingTimeout);
          socket.once("connect", () => finish("up", null));
          socket.once("timeout", () => finish("down", "Zaman aşımı"));
          socket.once("error", (error: NodeJS.ErrnoException) =>
            finish("down", describeSocketError(error))
          );
          socket.connect({
            host: target.address,
            port,
            family: target.family,
          });
        })
    )
    .catch((error) => ({
      ...meta,
      target: `${host}:${port}`,
      state: "down" as const,
      response_ms: Date.now() - started,
      error:
        error instanceof SsrfError
          ? "Güvenli olmayan hedef"
          : "Adres çözümlenemedi",
    }));
}

function acquireCheckSlot(): Promise<void> {
  if (activeChecks < MAX_CONCURRENT_CHECKS) {
    activeChecks += 1;
    return Promise.resolve();
  }
  if (checkWaiters.length >= MAX_PENDING_CHECKS) {
    return Promise.reject(new Error("Sistem durumu kontrol kuyruğu dolu."));
  }

  return new Promise((resolve) => {
    checkWaiters.push(resolve);
  });
}

function releaseCheckSlot() {
  const next = checkWaiters.shift();
  if (next) {
    next();
    return;
  }
  activeChecks = Math.max(0, activeChecks - 1);
}

async function withCheckSlot<T>(task: () => Promise<T>): Promise<T> {
  await acquireCheckSlot();
  try {
    return await task();
  } finally {
    releaseCheckSlot();
  }
}

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= tasks.length) return;
      results[index] = await withCheckSlot(tasks[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, () => worker())
  );
  return results;
}

function pruneCache(now: number) {
  for (const [workspaceId, entry] of cache) {
    if (now - entry.at > CACHE_TTL_MS * 2) {
      cache.delete(workspaceId);
    }
  }

  while (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

function summarize(sites: CheckItem[], servers: CheckItem[]): UptimeReport {
  // Adresi girilmemiş kayıtlar (unknown) sorunlu sayılmaz ve toplama girmez.
  const monitored = [...sites, ...servers].filter((i) => i.state !== "unknown");
  const up_count = monitored.filter((i) => i.state === "up").length;
  const down_count = monitored.length - up_count;

  let state: OverallState;
  if (monitored.length === 0) state = "empty";
  else if (down_count === 0) state = "up";
  else if (up_count === 0) state = "down";
  else state = "partial";

  return {
    checked_at: new Date().toISOString(),
    sites,
    servers,
    total: monitored.length,
    up_count,
    down_count,
    state,
  };
}

async function runChecks(workspaceId: string): Promise<UptimeReport> {
  const [projects, servers] = await Promise.all([
    prisma.project.findMany({
      where: {
        workspace_id: workspaceId,
        deleted_at: null,
        status: { not: "archived" },
        live_url: { not: null },
      },
      select: { id: true, name: true, live_url: true },
      orderBy: { name: "asc" },
      take: MAX_TARGETS,
    }),
    // Bakımdaki/askıya alınmış/sonlandırılmış sunucular kasıtlı kapalıdır;
    // alarm üretmemeleri için yalnızca aktif olanlar izlenir.
    prisma.server.findMany({
      where: {
        workspace_id: workspaceId,
        deleted_at: null,
        status: "active",
      },
      select: {
        id: true,
        name: true,
        hostname: true,
        primary_ip: true,
        ssh_port: true,
      },
      orderBy: { name: "asc" },
      take: MAX_TARGETS,
    }),
  ]);

  const siteChecks = projects.flatMap<() => Promise<CheckItem>>((project) => {
    const raw = project.live_url?.trim();
    if (!raw) return [];
    return [() => checkUrl(raw, { id: project.id, name: project.name })];
  });

  const serverChecks = servers.map<() => Promise<CheckItem>>((server) => {
    const host = server.hostname?.trim() || server.primary_ip?.trim();
    if (!host) {
      return () =>
        Promise.resolve<CheckItem>({
          id: server.id,
          name: server.name,
          target: "—",
          state: "unknown",
          response_ms: null,
          error: "Adres girilmemiş",
        });
    }
    return () =>
      checkTcp(host, server.ssh_port, {
        id: server.id,
        name: server.name,
      });
  });

  const results = await runWithConcurrency(
    [...siteChecks, ...serverChecks],
    MAX_CONCURRENT_CHECKS
  );
  const siteResults = results.slice(0, siteChecks.length);
  const serverResults = results.slice(siteChecks.length);

  return summarize(siteResults, serverResults);
}

/**
 * Çalışma alanının durum raporu. Sonuç kısa süre önbelleklenir; aynı anda
 * birden fazla sekme açık olsa da hedeflere tek tur istek gider.
 */
export function getUptimeReport(
  workspaceId: string,
  { force = false }: { force?: boolean } = {}
): Promise<UptimeReport> {
  const now = Date.now();
  const cached = cache.get(workspaceId);
  const cacheAge = cached ? now - cached.at : Number.POSITIVE_INFINITY;
  if (
    cached &&
    ((!force && cacheAge < CACHE_TTL_MS) ||
      (force && cacheAge < FORCE_REFRESH_MIN_INTERVAL_MS))
  ) {
    return cached.report;
  }

  pruneCache(now);
  const report = runChecks(workspaceId).catch((error) => {
    // Başarısız tur önbellekte kalmasın; sonraki istek yeniden denesin.
    if (cache.get(workspaceId)?.report === report) {
      cache.delete(workspaceId);
    }
    throw error;
  });
  cache.delete(workspaceId);
  cache.set(workspaceId, { at: now, report });
  return report;
}
