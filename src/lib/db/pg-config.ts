type PgConfig = {
  connectionString: string;
  ssl?: { rejectUnauthorized: boolean };
};

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
  if (!rawUrl) return { connectionString: rawUrl };
  try {
    const url = new URL(rawUrl);
    const sslmode = url.searchParams.get("sslmode");
    url.searchParams.delete("sslmode");
    url.searchParams.delete("uselibpqcompat");
    const connectionString = url.toString();
    if (sslmode === "disable") {
      return { connectionString };
    }
    return { connectionString, ssl: { rejectUnauthorized: false } };
  } catch {
    // URL ayrıştırılamazsa dizeyi olduğu gibi geçir
    return { connectionString: rawUrl };
  }
}
