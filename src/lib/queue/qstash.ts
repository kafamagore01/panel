import { Client } from "@upstash/qstash";
import { applicationBaseUrl } from "@/lib/env";

/**
 * QStash istemcisi. Token tanımlı değilse null döner ve kuyruk kayıtları
 * "pending" durumunda bekler (yerel geliştirme). Üretimde token zorunludur.
 */

let client: Client | null | undefined;

export function getQStash(): Client | null {
  if (client === undefined) {
    const token = process.env.QSTASH_TOKEN;
    if (!token && process.env.NODE_ENV === "production") {
      throw new Error("Üretimde QSTASH_TOKEN zorunludur.");
    }
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
