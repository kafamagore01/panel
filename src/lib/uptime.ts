import net from "node:net";
import { prisma } from "@/lib/db/prisma";
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

const cache = new Map<string, { at: number; report: Promise<UptimeReport> }>();

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

  async function request(method: "HEAD" | "GET"): Promise<Response> {
    return fetch(target, {
      method,
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      headers: { "user-agent": "OperasyonMerkezi-SistemDurumu/1.0" },
    });
  }

  try {
    let usedGet = false;
    let res: Response;

    try {
      res = await request("HEAD");
    } catch {
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
    await res.body?.cancel().catch(() => undefined);

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
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = new net.Socket();
    let settled = false;

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

    socket.setTimeout(TCP_TIMEOUT_MS);
    socket.once("connect", () => finish("up", null));
    socket.once("timeout", () => finish("down", "Zaman aşımı"));
    socket.once("error", (error: NodeJS.ErrnoException) =>
      finish("down", describeSocketError(error))
    );
    socket.connect(port, host);
  });
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

  const siteChecks = projects.flatMap((project) => {
    const raw = project.live_url?.trim();
    if (!raw) return [];
    return [checkUrl(raw, { id: project.id, name: project.name })];
  });

  const serverChecks = servers.map((server) => {
    const host = server.hostname?.trim() || server.primary_ip?.trim();
    if (!host) {
      return Promise.resolve<CheckItem>({
        id: server.id,
        name: server.name,
        target: "—",
        state: "unknown",
        response_ms: null,
        error: "Adres girilmemiş",
      });
    }
    return checkTcp(host, server.ssh_port, {
      id: server.id,
      name: server.name,
    });
  });

  const [siteResults, serverResults] = await Promise.all([
    Promise.all(siteChecks),
    Promise.all(serverChecks),
  ]);

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
  const cached = cache.get(workspaceId);
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.report;
  }

  const report = runChecks(workspaceId).catch((error) => {
    // Başarısız tur önbellekte kalmasın; sonraki istek yeniden denesin.
    cache.delete(workspaceId);
    throw error;
  });
  cache.set(workspaceId, { at: Date.now(), report });
  return report;
}
