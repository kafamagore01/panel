import crypto from "node:crypto";

/**
 * Lisans anahtarı üretimi ve HMAC-SHA256 hash'leme.
 * Biçim: PT- + 4 blok x 5 karakter (A-Z, 0-9). Ör: PT-A8F2K-9L3MN-Q7P1R-X4T8V
 */

const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export const LICENSE_KEY_PREFIX = "PT";

export const LICENSE_KEY_REGEX =
  /^PT-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/;

export function generateLicenseKey(): string {
  const blocks: string[] = [];
  for (let b = 0; b < 4; b++) {
    let block = "";
    for (let i = 0; i < 5; i++) {
      block += CHARSET[crypto.randomInt(CHARSET.length)];
    }
    blocks.push(block);
  }
  return `${LICENSE_KEY_PREFIX}-${blocks.join("-")}`;
}

/** Anahtar yalnızca bu hash ile veritabanında aranır (APP_PEPPER ile HMAC-SHA256). */
export function hashLicenseKey(licenseKey: string): string {
  const pepper = process.env.APP_PEPPER;
  if (!pepper || pepper.length < 32) {
    throw new Error("APP_PEPPER tanımlı değil veya 32 karakterden kısa.");
  }
  return crypto.createHmac("sha256", pepper).update(licenseKey).digest("hex");
}
