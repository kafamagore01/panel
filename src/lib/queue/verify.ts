import { Receiver } from "@upstash/qstash";

/**
 * QStash imza doğrulaması. İmza anahtarları tanımlı değilse (yerel geliştirme),
 * CRON_SECRET Authorization header'ı ile alternatif doğrulama yapılır.
 */
export async function verifyQStashRequest(
  signature: string | null,
  body: string,
  authHeader: string | null
): Promise<boolean> {
  const current = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const next = process.env.QSTASH_NEXT_SIGNING_KEY;

  if (current && next && signature) {
    try {
      const receiver = new Receiver({
        currentSigningKey: current,
        nextSigningKey: next,
      });
      return await receiver.verify({ signature, body });
    } catch {
      return false;
    }
  }

  // İmza anahtarı yoksa CRON_SECRET ile koru
  const secret = process.env.CRON_SECRET;
  if (secret && authHeader === `Bearer ${secret}`) return true;

  return false;
}

/** Cron endpoint'leri için: QStash imzası VEYA CRON_SECRET kabul edilir. */
export async function authorizeCron(
  signature: string | null,
  body: string,
  authHeader: string | null
): Promise<boolean> {
  return verifyQStashRequest(signature, body, authHeader);
}
