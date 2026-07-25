import dns from "node:dns/promises";
import net from "node:net";

/**
 * SSRF koruması: webhook URL'leri HTTPS olmalı ve çözümlendiği IP adresleri
 * iç/özel ağ bloklarında yer almamalıdır.
 */

export class SsrfError extends Error {}

function ipv4ToInt(ip: string): number {
  return ip
    .split(".")
    .reduce((acc, part) => (acc << 8) + Number.parseInt(part, 10), 0) >>> 0;
}

function inCidr(ip: number, base: string, maskBits: number): boolean {
  const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;
  return (ip & mask) === (ipv4ToInt(base) & mask);
}

const BLOCKED_V4_CIDRS: Array<[string, number]> = [
  ["0.0.0.0", 8], // "bu ağ"
  ["10.0.0.0", 8], // RFC1918
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local
  ["172.16.0.0", 12], // RFC1918
  ["192.168.0.0", 16], // RFC1918
];

export function isBlockedIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) {
    const n = ipv4ToInt(ip);
    return BLOCKED_V4_CIDRS.some(([base, bits]) => inCidr(n, base, bits));
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    if (lower.startsWith("fe80:")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
    // IPv4-mapped (::ffff:a.b.c.d)
    const v4 = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (v4) return isBlockedIp(v4[1]);
    return false;
  }
  return true; // IP olarak çözümlenemeyen değerleri engelle
}

/**
 * URL'i doğrular: HTTPS zorunlu, host'un çözümlendiği tüm IP'ler güvenli olmalı.
 * Başarısızlıkta Türkçe mesajlı SsrfError fırlatır.
 */
export async function assertSafeWebhookUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfError("Geçersiz URL biçimi.");
  }

  if (url.protocol !== "https:") {
    throw new SsrfError("Webhook URL'i HTTPS protokolü kullanmalıdır.");
  }

  // IPv6 literal'lerde URL.hostname köşeli parantez içerir
  const hostname = url.hostname.replace(/^\[|\]$/g, "");

  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new SsrfError("Webhook URL'i özel/iç ağ adresine işaret edemez.");
    }
    return url;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new SsrfError("Webhook alan adı DNS üzerinden çözümlenemedi.");
  }

  if (addresses.length === 0) {
    throw new SsrfError("Webhook alan adı için IP kaydı bulunamadı.");
  }

  for (const { address } of addresses) {
    if (isBlockedIp(address)) {
      throw new SsrfError("Webhook URL'i özel/iç ağ adresine çözümleniyor.");
    }
  }

  return url;
}
