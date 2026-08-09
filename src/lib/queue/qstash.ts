import { Client } from "@upstash/qstash";
import { applicationBaseUrl } from "@/lib/env";

/**
 * QStash istemcisi. Token tanımlı değilse null döner: webhook outbox kayıtları
 * "pending" durumunda bekler ve reconciliation cron'u yeniden yayınlamayı
 * dener. Webhook teslimi isteniyorsa token tanımlanmalıdır.
 */

let client: Client | null | undefined;

export function getQStash(): Client | null {
  if (client === undefined) {
    const token = process.env.QSTASH_TOKEN;
    client = token
      ? new Client({
          token,
          retry: { retries: 1, backoff: () => 100 },
        })
      : null;
  }
  return client;
}

export function appBaseUrl(): string {
  return applicationBaseUrl();
}
