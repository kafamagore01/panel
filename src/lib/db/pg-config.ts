type PgConfig = {
  connectionString: string;
  ssl?: { rejectUnauthorized: true; ca?: string };
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
    // Bağlantı kurmak TCP + TLS + Postgres kimlik doğrulaması demek: birkaç
    // gidiş-dönüş. Fluid compute'ta fonksiyon örneği istekler arasında yaşadığı
    // için havuzu erken boşaltmak yerine sıcak tutmak sayfa başına bu maliyeti
    // ortadan kaldırır.
    idleTimeoutMillis: 60_000,
    // Havuz doluysa süresiz beklemek yerine hata ver.
    connectionTimeoutMillis: 10_000,
  };
}

/**
 * PrismaPg (node-postgres) için bağlantı yapılandırması üretir.
 *
 * `sslmode`/Prisma parametrelerini bağlantı dizesinden ayıklayıp TLS'i açıkça
 * yönetir. Uzak hedeflerde sertifika ve hostname doğrulaması varsayılan olarak
 * zorunludur. Özel CA gerekiyorsa PEM sertifikası DB_SSL_CA_BASE64 ile verilir.
 */
export function buildPgConfig(
  rawUrl: string,
  env: Readonly<Record<string, string | undefined>> = process.env
): PgConfig {
  const limits = poolLimits();
  if (!rawUrl.trim()) {
    throw new Error("DATABASE_URL/DIRECT_URL tanımlı olmalıdır.");
  }
  try {
    const url = new URL(rawUrl);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) {
      throw new Error("Veritabanı bağlantı dizesi PostgreSQL URL'si olmalıdır.");
    }
    const sslmode = url.searchParams.get("sslmode");
    for (const param of PRISMA_ONLY_PARAMS) url.searchParams.delete(param);
    const connectionString = url.toString();

    if (sslmode === "disable") {
      if (env.NODE_ENV === "production") {
        throw new Error("Üretimde PostgreSQL TLS devre dışı bırakılamaz.");
      }
      return { connectionString, ...limits };
    }

    const isLocal =
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname) && !sslmode;
    if (isLocal) return { connectionString, ...limits };

    const caBase64 = env.DB_SSL_CA_BASE64?.trim();
    let ca: string | undefined;
    if (caBase64) {
      ca = Buffer.from(caBase64, "base64").toString("utf8");
      if (!ca.includes("-----BEGIN CERTIFICATE-----")) {
        throw new Error("DB_SSL_CA_BASE64 geçerli bir PEM sertifikası değildir.");
      }
    }

    return {
      connectionString,
      ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
      ...limits,
    };
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("Veritabanı bağlantı dizesi ayrıştırılamadı.");
  }
}
