/**
 * Süreç içi (in-memory) kısa ömürlü cache.
 *
 * GitHub verisi kalıcı olarak saklanmaz; her sayfa açılışında canlı okunur.
 * Bu cache yalnızca aynı istek dalgasındaki tekrarları ve oran limiti baskısını
 * azaltmak içindir. Anahtar her zaman workspace id ile başlar — kiracılar
 * arasında paylaşım olmaz. Sunucusuz ortamda instance başına yaşar.
 */

type Entry = { value: unknown; expiresAt: number };

/** Bellek sızıntısına karşı üst sınır; aşılınca en eski kayıtlar düşer. */
const MAX_ENTRIES = 500;

const store = new Map<string, Entry>();

function evictIfNeeded(): void {
  if (store.size <= MAX_ENTRIES) return;
  const overflow = store.size - MAX_ENTRIES;
  let removed = 0;
  for (const key of store.keys()) {
    store.delete(key);
    if (++removed >= overflow) break;
  }
}

/** `loader` sonucunu `ttlMs` boyunca saklar. Hatalar cache'lenmez. */
export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) return hit.value as T;

  const value = await loader();
  store.set(key, { value, expiresAt: now + ttlMs });
  evictIfNeeded();
  return value;
}

/** Bir çalışma alanına ait tüm kayıtları düşürür (bağlantı değişince). */
export function invalidateWorkspace(workspaceId: string): void {
  const prefix = `${workspaceId}:`;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
