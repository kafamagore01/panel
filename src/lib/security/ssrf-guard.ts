import dns from "node:dns/promises";
import http, { type IncomingHttpHeaders } from "node:http";
import https from "node:https";
import net from "node:net";

/**
 * Sunucudan kullanıcı tarafından belirlenen hedeflere yapılan bağlantılar için
 * ortak SSRF koruması.
 *
 * Güvenlik modeli:
 * - yalnız açıkça izin verilen protokoller kabul edilir;
 * - tüm DNS cevapları genel IP olmak zorundadır;
 * - bağlantı, kontrolden geçen IP'ye sabitlenir (DNS rebinding/TOCTOU yok);
 * - yönlendirmeler elle takip edilir ve her hedef yeniden doğrulanır;
 * - yanıt gövdesi ve toplam istek süresi üst sınırlarla korunur.
 */

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

export class SafeRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafeRequestError";
  }
}

export type ResolvedPublicAddress = {
  address: string;
  family: 4 | 6;
};

const BLOCKED_V4_CIDRS: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

const BLOCKED_V6_CIDRS: ReadonlyArray<readonly [string, number]> = [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
];

const DEFAULT_DNS_TIMEOUT_MS = 3_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

function parseIpv4(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;

  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet < 0 || octet > 255) return null;
    value = (value << 8) | octet;
  }
  return value >>> 0;
}

function inIpv4Cidr(ip: number, base: string, maskBits: number): boolean {
  const parsedBase = parseIpv4(base);
  if (parsedBase === null) return true;
  const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;
  return (ip & mask) === (parsedBase & mask);
}

function parseIpv6(ip: string): number[] | null {
  if (net.isIP(ip) !== 6 || ip.includes("%")) return null;

  let normalized = ip.toLowerCase();
  const lastColon = normalized.lastIndexOf(":");
  const ipv4Tail = normalized.slice(lastColon + 1);
  if (ipv4Tail.includes(".")) {
    const ipv4 = parseIpv4(ipv4Tail);
    if (ipv4 === null) return null;
    normalized = `${normalized.slice(0, lastColon)}:${(
      (ipv4 >>> 16) &
      0xffff
    ).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
  }

  const halves = normalized.split("::");
  if (halves.length > 2) return null;

  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (
    (halves.length === 1 && missing !== 0) ||
    (halves.length === 2 && missing < 1)
  ) {
    return null;
  }

  const groups = [
    ...left,
    ...Array.from({ length: Math.max(0, missing) }, () => "0"),
    ...right,
  ];
  if (groups.length !== 8) return null;

  const value: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    value.push(Number.parseInt(group, 16));
  }
  return value;
}

function inIpv6Cidr(ip: number[], base: string, maskBits: number): boolean {
  const parsedBase = parseIpv6(base);
  if (parsedBase === null) return true;
  if (maskBits === 0) return true;

  const fullGroups = Math.floor(maskBits / 16);
  for (let index = 0; index < fullGroups; index += 1) {
    if (ip[index] !== parsedBase[index]) return false;
  }

  const remainder = maskBits % 16;
  if (remainder === 0) return true;
  const mask = (0xffff << (16 - remainder)) & 0xffff;
  return (ip[fullGroups] & mask) === (parsedBase[fullGroups] & mask);
}

function isBlockedIpv4Value(value: number): boolean {
  return BLOCKED_V4_CIDRS.some(([base, bits]) =>
    inIpv4Cidr(value, base, bits)
  );
}

export function isBlockedIp(ip: string): boolean {
  const normalized = ip.replace(/^\[|\]$/g, "").toLowerCase();
  const version = net.isIP(normalized);

  if (version === 4) {
    const value = parseIpv4(normalized);
    return value === null || isBlockedIpv4Value(value);
  }

  if (version === 6) {
    const value = parseIpv6(normalized);
    if (value === null) return true;

    // IPv4-mapped IPv6 adreslerini taşıdıkları IPv4 adresiyle sınıflandır.
    const upper80IsZero = value.slice(0, 5).every((group) => group === 0);
    if (upper80IsZero && value[5] === 0xffff) {
      const embeddedIpv4 = ((value[6] << 16) | value[7]) >>> 0;
      return isBlockedIpv4Value(embeddedIpv4);
    }

    // Eski IPv4-compatible biçimleri genel hedef olarak kabul etme.
    if (value.slice(0, 6).every((group) => group === 0)) return true;

    return BLOCKED_V6_CIDRS.some(([base, bits]) =>
      inIpv6Cidr(value, base, bits)
    );
  }

  return true;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new SsrfError(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export async function resolveSafeHostname(
  rawHostname: string,
  {
    timeoutMs = DEFAULT_DNS_TIMEOUT_MS,
    subject = "Hedef",
  }: { timeoutMs?: number; subject?: string } = {}
): Promise<ResolvedPublicAddress[]> {
  const hostname = rawHostname
    .trim()
    .replace(/^\[|\]$/g, "")
    .toLowerCase();
  if (!hostname || hostname.length > 253 || hostname.includes("\0")) {
    throw new SsrfError(`${subject} alan adı geçersiz.`);
  }

  const literalFamily = net.isIP(hostname);
  if (literalFamily) {
    if (isBlockedIp(hostname)) {
      throw new SsrfError(`${subject} özel veya güvenli olmayan bir IP adresine işaret ediyor.`);
    }
    return [
      {
        address: hostname,
        family: literalFamily as 4 | 6,
      },
    ];
  }

  let lookupResults: Array<{ address: string; family: number }>;
  try {
    lookupResults = await withTimeout(
      dns.lookup(hostname, { all: true, verbatim: true }),
      timeoutMs,
      `${subject} DNS çözümlemesi zaman aşımına uğradı.`
    );
  } catch (error) {
    if (error instanceof SsrfError) throw error;
    throw new SsrfError(`${subject} alan adı DNS üzerinden çözümlenemedi.`);
  }

  const unique = new Map<string, ResolvedPublicAddress>();
  for (const result of lookupResults) {
    if (result.family !== 4 && result.family !== 6) {
      throw new SsrfError(`${subject} için desteklenmeyen bir IP ailesi döndü.`);
    }
    if (isBlockedIp(result.address)) {
      throw new SsrfError(`${subject} özel veya güvenli olmayan bir IP adresine çözümleniyor.`);
    }
    unique.set(`${result.family}:${result.address}`, {
      address: result.address,
      family: result.family,
    });
  }

  if (unique.size === 0) {
    throw new SsrfError(`${subject} alan adı için genel IP kaydı bulunamadı.`);
  }

  // IPv4'ü öncelemek, yalnız IPv6'nın erişilemediği ortamlarda gereksiz hatayı azaltır.
  return [...unique.values()].sort((a, b) => a.family - b.family);
}

async function resolveSafeUrl(
  rawUrl: string | URL,
  {
    allowedProtocols,
    timeoutMs,
    subject,
  }: {
    allowedProtocols: readonly string[];
    timeoutMs: number;
    subject: string;
  }
): Promise<{ url: URL; addresses: ResolvedPublicAddress[] }> {
  let url: URL;
  try {
    url = rawUrl instanceof URL ? new URL(rawUrl) : new URL(rawUrl);
  } catch {
    throw new SsrfError(`${subject} geçerli bir URL değil.`);
  }

  if (!allowedProtocols.includes(url.protocol)) {
    throw new SsrfError(`${subject} izin verilmeyen bir protokol kullanıyor.`);
  }
  if (url.username || url.password) {
    throw new SsrfError(`${subject} kullanıcı bilgisi içeremez.`);
  }

  const addresses = await resolveSafeHostname(url.hostname, {
    timeoutMs,
    subject,
  });
  return { url, addresses };
}

export async function assertSafeWebhookUrl(rawUrl: string): Promise<URL> {
  return (
    await resolveSafeUrl(rawUrl, {
      allowedProtocols: ["https:"],
      timeoutMs: DEFAULT_DNS_TIMEOUT_MS,
      subject: "Webhook URL'i",
    })
  ).url;
}

export async function assertSafeImageUrl(rawUrl: string): Promise<URL> {
  return (
    await resolveSafeUrl(rawUrl, {
      allowedProtocols: ["https:"],
      timeoutMs: DEFAULT_DNS_TIMEOUT_MS,
      subject: "Görsel URL'si",
    })
  ).url;
}

export type SafeHttpResponse = {
  url: URL;
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
  truncated: boolean;
};

export type SafeHttpRequestOptions = {
  method?: "GET" | "HEAD" | "POST";
  headers?: Record<string, string>;
  body?: string | Buffer;
  allowedProtocols?: readonly ("http:" | "https:")[];
  timeoutMs?: number;
  maxRedirects?: number;
  redirect?: "follow" | "error";
  maxResponseBytes?: number;
  bodyLimitMode?: "reject" | "truncate";
  subject?: string;
};

type RequestOnceOptions = {
  method: "GET" | "HEAD" | "POST";
  headers: Record<string, string>;
  body?: Buffer;
  timeoutMs: number;
  maxResponseBytes: number;
  bodyLimitMode: "reject" | "truncate";
};

function normalizedHeaders(
  input: Record<string, string>,
  url: URL,
  body?: Buffer
): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [name, value] of Object.entries(input)) {
    const lower = name.toLowerCase();
    if (
      lower === "host" ||
      lower === "connection" ||
      lower === "transfer-encoding"
    ) {
      continue;
    }
    output[lower] = value;
  }

  output.host = url.host;
  output.connection = "close";
  if (body) {
    output["content-length"] = String(body.byteLength);
  }
  return output;
}

function requestOnce(
  url: URL,
  address: ResolvedPublicAddress,
  options: RequestOnceOptions
): Promise<SafeHttpResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const requestBody = options.body;
    const requestHeaders = normalizedHeaders(options.headers, url, requestBody);
    const port = url.port ? Number(url.port) : undefined;
    const originalHostname = url.hostname.replace(/^\[|\]$/g, "");
    const requestOptions: https.RequestOptions = {
      protocol: url.protocol,
      hostname: address.address,
      family: address.family,
      port,
      path: `${url.pathname}${url.search}`,
      method: options.method,
      headers: requestHeaders,
      agent: false,
      rejectUnauthorized: true,
      servername: net.isIP(originalHostname) ? undefined : originalHostname,
    };

    const finishResolve = (value: SafeHttpResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const finishReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        error instanceof Error
          ? error
          : new SafeRequestError("Uzak istek başarısız oldu.")
      );
    };

    const onResponse = (response: http.IncomingMessage) => {
      const status = response.statusCode ?? 0;
      if (options.maxResponseBytes === 0 || options.method === "HEAD") {
        response.destroy();
        finishResolve({
          url,
          status,
          headers: response.headers,
          body: Buffer.alloc(0),
          truncated: false,
        });
        return;
      }

      const contentLength = Number(response.headers["content-length"]);
      if (
        options.bodyLimitMode === "reject" &&
        Number.isFinite(contentLength) &&
        contentLength > options.maxResponseBytes
      ) {
        response.destroy();
        finishReject(new SafeRequestError("Uzak yanıt izin verilen boyutu aşıyor."));
        return;
      }

      const chunks: Buffer[] = [];
      let total = 0;
      response.on("data", (chunk: Buffer | Uint8Array) => {
        if (settled) return;
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const remaining = options.maxResponseBytes - total;

        if (buffer.byteLength > remaining) {
          if (remaining > 0) chunks.push(buffer.subarray(0, remaining));
          total += Math.max(0, remaining);
          response.destroy();

          if (options.bodyLimitMode === "reject") {
            finishReject(
              new SafeRequestError("Uzak yanıt izin verilen boyutu aşıyor.")
            );
          } else {
            finishResolve({
              url,
              status,
              headers: response.headers,
              body: Buffer.concat(chunks, total),
              truncated: true,
            });
          }
          return;
        }

        chunks.push(buffer);
        total += buffer.byteLength;
      });
      response.once("end", () =>
        finishResolve({
          url,
          status,
          headers: response.headers,
          body: Buffer.concat(chunks, total),
          truncated: false,
        })
      );
      response.once("aborted", () => {
        if (!settled) {
          finishReject(new SafeRequestError("Uzak yanıt tamamlanmadan kesildi."));
        }
      });
      response.once("error", finishReject);
    };

    const request =
      url.protocol === "https:"
        ? https.request(requestOptions, onResponse)
        : http.request(requestOptions, onResponse);
    const timer = setTimeout(() => {
      request.destroy(new SafeRequestError("Uzak istek zaman aşımına uğradı."));
    }, options.timeoutMs);

    request.once("error", finishReject);
    if (requestBody) request.write(requestBody);
    request.end();
  });
}

function isRedirect(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status);
}

function stripSensitiveRedirectHeaders(
  headers: Record<string, string>,
  originChanged: boolean,
  methodChanged: boolean
): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (
      (originChanged &&
        ["authorization", "cookie", "proxy-authorization"].includes(lower)) ||
      (methodChanged && ["content-length", "content-type"].includes(lower))
    ) {
      continue;
    }
    output[lower] = value;
  }
  return output;
}

export async function safeHttpRequest(
  rawUrl: string | URL,
  options: SafeHttpRequestOptions = {}
): Promise<SafeHttpResponse> {
  const allowedProtocols = options.allowedProtocols ?? ["https:"];
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? 0;
  const redirectMode = options.redirect ?? "error";
  const maxResponseBytes = options.maxResponseBytes ?? 0;
  const bodyLimitMode = options.bodyLimitMode ?? "reject";
  const subject = options.subject ?? "Uzak URL";
  const deadline = Date.now() + timeoutMs;

  let currentUrl: URL;
  try {
    currentUrl = rawUrl instanceof URL ? new URL(rawUrl) : new URL(rawUrl);
  } catch {
    throw new SsrfError(`${subject} geçerli bir URL değil.`);
  }
  let method = options.method ?? "GET";
  let headers = { ...(options.headers ?? {}) };
  let body =
    options.body === undefined
      ? undefined
      : Buffer.isBuffer(options.body)
        ? options.body
        : Buffer.from(options.body);

  for (let redirectCount = 0; ; redirectCount += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new SafeRequestError("Uzak istek zaman aşımına uğradı.");
    }

    const resolved = await resolveSafeUrl(currentUrl, {
      allowedProtocols,
      timeoutMs: Math.min(DEFAULT_DNS_TIMEOUT_MS, remaining),
      subject,
    });
    const response = await requestOnce(resolved.url, resolved.addresses[0], {
      method,
      headers,
      body,
      timeoutMs: Math.max(1, deadline - Date.now()),
      maxResponseBytes,
      bodyLimitMode,
    });

    if (!isRedirect(response.status)) return response;
    if (redirectMode === "error") {
      throw new SsrfError(`${subject} yönlendirme yapamaz.`);
    }

    const locationHeader = response.headers.location;
    const location = Array.isArray(locationHeader)
      ? locationHeader[0]
      : locationHeader;
    if (!location) {
      throw new SafeRequestError("Uzak sunucu geçersiz bir yönlendirme döndürdü.");
    }
    if (redirectCount >= maxRedirects) {
      throw new SafeRequestError("Uzak sunucu çok fazla yönlendirme yaptı.");
    }

    const nextUrl = new URL(location, resolved.url);
    const methodChanged =
      response.status === 303 ||
      ((response.status === 301 || response.status === 302) && method === "POST");
    headers = stripSensitiveRedirectHeaders(
      headers,
      nextUrl.origin !== resolved.url.origin,
      methodChanged
    );
    if (methodChanged) {
      method = "GET";
      body = undefined;
    }
    currentUrl = nextUrl;
  }
}
