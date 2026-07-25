type PgConfig = {
  connectionString: string;
  ssl?: { rejectUnauthorized: boolean };
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
};

/**
 * Prisma'ya ait olup node-postgres'in anlamadığı bağlantı dizesi parametreleri.
 * URL'de kalırlarsa sunucuya gereksiz startup parametresi olarak gidebilirler.
 */
const PRISMA_ONLY_PARAMS = [
  "sslmode",
  "uselibpqcompat",
  "pgbouncer",
  "connection_limit",
  "pool_timeout",
];

/**
 * Sunucusuz (Vercel) ortamda her fonksiyon örneği kendi havuzunu açar; örnek
 * başına düşük tutulmazsa Supabase pooler'ın istemci sınırı (session mode'da
 * pool_size: 15) hızla dolar ve `EMAXCONNSESSION` alınır.
 */
const DEFAULT_POOL_MAX = 3;

function poolLimits() {
  const configured = Number(process.env.DB_POOL_MAX);
  const max =
    Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : DEFAULT_POOL_MAX;
  return {
    max,
    // Boşta kalan bağlantı hızla bırakılsın: sunucusuz örnekler kısa ömürlüdür.
    idleTimeoutMillis: 10_000,
    // Havuz doluysa süresiz beklemek yerine hata ver.
    connectionTimeoutMillis: 10_000,
  };
}

/**
 * PrismaPg (node-postgres) için bağlantı yapılandırması üretir.
 *
 * Neden özel: pg-connection-string v2, URL'deki `sslmode=require`'ı `verify-full`
 * (tam sertifika doğrulaması) olarak yorumlar. Supabase pooler'ının sertifika
 * zinciri self-signed göründüğünden bu doğrulama başarısız olur. Bu yüzden
 * `sslmode`/`uselibpqcompat` parametrelerini dizeden ayıklayıp TLS'i açıkça
 * (rejectUnauthorized: false ile) kontrol ederiz. `sslmode=disable` ise TLS kapatılır.
 */
export function buildPgConfig(rawUrl: string): PgConfig {
  const limits = poolLimits();
  if (!rawUrl) return { connectionString: rawUrl, ...limits };
  try {
    const url = new URL(rawUrl);
    const sslmode = url.searchParams.get("sslmode");
    for (const param of PRISMA_ONLY_PARAMS) url.searchParams.delete(param);
    const connectionString = url.toString();
    if (sslmode === "disable") {
      return { connectionString, ...limits };
    }
    return { connectionString, ssl: { rejectUnauthorized: false }, ...limits };
  } catch {
    // URL ayrıştırılamazsa dizeyi olduğu gibi geçir
    return { connectionString: rawUrl, ...limits };
  }
}
