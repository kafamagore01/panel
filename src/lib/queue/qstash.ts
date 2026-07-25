import { Client } from "@upstash/qstash";

/**
 * QStash istemcisi. Token tanımlı değilse null döner ve kuyruk kayıtları
 * "pending" durumunda bekler (yerel geliştirme). Üretimde token zorunludur.
 */

let client: Client | null | undefined;

export function getQStash(): Client | null {
  if (client === undefined) {
    const token = process.env.QSTASH_TOKEN;
    client = token ? new Client({ token }) : null;
  }
  return client;
}

export function appBaseUrl(): string {
  return (
    process.env.APP_URL ??
    process.env.NEXTAUTH_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}
