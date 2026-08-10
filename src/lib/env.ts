type Environment = Readonly<Record<string, string | undefined>>;

const AES_KEY_LENGTHS = new Set([16, 24, 32]);

function value(env: Environment, name: string): string | null {
  const candidate = env[name]?.trim();
  return candidate ? candidate : null;
}

function isUrl(raw: string, protocols?: readonly string[]): boolean {
  try {
    const parsed = new URL(raw);
    return !protocols || protocols.includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Supabase pooler'ının session mode portunu (5432) tanır. Transaction mode
 * (6543) ile karıştırılması sunucusuz dağıtımda EMAXCONNSESSION'a yol açar.
 * Doğrudan veritabanı host'u (db.<ref>.supabase.co) da 5432 kullanır ve
 * sunucusuz runtime için aynı şekilde uygun değildir.
 */
function isSessionModePooler(raw: string): boolean {
  try {
    const url = new URL(raw);
    const port = url.port || "5432";
    if (port !== "5432") return false;
    return /(^|\.)pooler\.supabase\.com$/.test(url.hostname) ||
      /(^|\.)supabase\.co$/.test(url.hostname);
  } catch {
    return false;
  }
}

function isValidServerActionsKey(raw: string): boolean {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) return false;
  try {
    return AES_KEY_LENGTHS.has(Buffer.from(raw, "base64").byteLength);
  } catch {
    return false;
  }
}

/**
 * Üretim ortamının güvenlik açısından zorunlu değişkenlerini değerleri loglamadan
 * denetler. İsteğe bağlı entegrasyonlar yalnız yapılandırıldıklarında doğrulanır.
 */
export function validateEnvironment(
  env: Environment,
  production = env.NODE_ENV === "production"
): string[] {
  const issues: string[] = [];
  const required = (name: string, minLength = 1) => {
    const candidate = value(env, name);
    if (!candidate || candidate.length < minLength) {
      issues.push(`${name} tanımlı ve en az ${minLength} karakter olmalıdır.`);
    }
    return candidate;
  };

  const databaseUrl = required("DATABASE_URL");
  if (
    databaseUrl &&
    !isUrl(databaseUrl, ["postgres:", "postgresql:"])
  ) {
    issues.push("DATABASE_URL geçerli bir PostgreSQL URL'si olmalıdır.");
  } else if (databaseUrl && isSessionModePooler(databaseUrl)) {
    // Supabase pooler'ının 5432 portu session mode'dur: eşzamanlı istemci
    // sayısı pool_size (varsayılan 15) ile sınırlıdır ve sunucusuz dağıtımda
    // her fonksiyon örneği kendi havuzunu açtığı için sınır hızla dolup
    // EMAXCONNSESSION (P2039) verir. Runtime bağlantısı transaction mode
    // (6543) olmalıdır; 5432 yalnız migration/seed için DIRECT_URL'de kullanılır.
    issues.push(
      "DATABASE_URL Supabase session mode portuna (5432) işaret ediyor; " +
        "sunucusuz ortamda transaction mode portu (6543) kullanılmalıdır. " +
        "5432 yalnızca DIRECT_URL için geçerlidir."
    );
  }

  const authSecret = required("NEXTAUTH_SECRET", 32);
  if (authSecret && authSecret.length < 32) {
    issues.push("NEXTAUTH_SECRET yeterince uzun değildir.");
  }

  const pepper = required("APP_PEPPER", 32);
  if (pepper && pepper.length < 32) {
    issues.push("APP_PEPPER yeterince uzun değildir.");
  }

  const encryptionKey = required("ENCRYPTION_KEY", 64);
  if (encryptionKey && !/^[a-fA-F0-9]{64}$/.test(encryptionKey)) {
    issues.push("ENCRYPTION_KEY tam olarak 64 hex karakter olmalıdır.");
  }

  const appUrl = value(env, "APP_URL") ?? value(env, "NEXTAUTH_URL");
  if (!appUrl || !isUrl(appUrl, ["http:", "https:"])) {
    issues.push("APP_URL veya NEXTAUTH_URL geçerli bir HTTP(S) URL olmalıdır.");
  } else if (production && new URL(appUrl).protocol !== "https:") {
    issues.push("Üretimde APP_URL/NEXTAUTH_URL HTTPS kullanmalıdır.");
  }

  if (production) {
    required("CRON_SECRET", 32);

    // Upstash Redis opsiyoneldir: tanımsızsa oran sınırlama ve giriş kilidi
    // süreç içi belleğe düşer (tek instance dağıtım için yeterli, çok
    // instance'lı dağıtımda sayaçlar instance başına ayrışır). Yarım
    // yapılandırma sessizce belleğe düşmesin diye ikisi birlikte istenir.
    const redisUrl = value(env, "UPSTASH_REDIS_REST_URL");
    const redisToken = value(env, "UPSTASH_REDIS_REST_TOKEN");
    if (Boolean(redisUrl) !== Boolean(redisToken)) {
      issues.push(
        "UPSTASH_REDIS_REST_URL ve UPSTASH_REDIS_REST_TOKEN birlikte tanımlanmalıdır."
      );
    }

    // QStash opsiyoneldir: tanımsızsa webhook'lar outbox'ta bekler ve cron
    // yeniden yayınlamayı dener. Tanımlıysa QStash imzalı istek gönderdiği
    // için imza anahtarları olmadan cron uçları isteği doğrulayamaz.
    if (value(env, "QSTASH_TOKEN")) {
      required("QSTASH_CURRENT_SIGNING_KEY");
      required("QSTASH_NEXT_SIGNING_KEY");
    }

    const actionsKey = required("NEXT_SERVER_ACTIONS_ENCRYPTION_KEY");
    if (actionsKey && !isValidServerActionsKey(actionsKey)) {
      issues.push(
        "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY geçerli 16/24/32 baytlık base64 AES anahtarı olmalıdır."
      );
    }

    // E-posta opsiyoneldir: sürücü seçilene kadar doğrulanmaz. Seçildiğinde
    // yarım yapılandırmayla canlıya çıkılmaması için tüm alanları zorunludur.
    const driver = value(env, "EMAIL_DRIVER");
    if (driver && driver !== "smtp" && driver !== "resend") {
      issues.push("EMAIL_DRIVER smtp veya resend olmalıdır.");
    } else if (driver) {
      required("EMAIL_FROM");
      if (driver === "smtp") {
        required("SMTP_HOST");
        required("SMTP_USER");
        required("SMTP_PASS");
      } else {
        required("RESEND_API_KEY");
      }
    }
  }

  return [...new Set(issues)];
}

export function assertEnvironment(
  env: Environment = process.env,
  production = env.NODE_ENV === "production"
): void {
  const issues = validateEnvironment(env, production);
  if (issues.length > 0) {
    throw new Error(
      `Güvenli ortam yapılandırması geçersiz:\n- ${issues.join("\n- ")}`
    );
  }
}

export function requireEnvironmentVariable(
  name: string,
  env: Environment = process.env
): string {
  const candidate = value(env, name);
  if (!candidate) {
    throw new Error(`Zorunlu ortam değişkeni eksik: ${name}`);
  }
  return candidate;
}

export function applicationBaseUrl(env: Environment = process.env): string {
  const raw =
    value(env, "APP_URL") ??
    value(env, "NEXTAUTH_URL") ??
    (env.NODE_ENV === "production" ? null : "http://localhost:3000");
  if (!raw || !isUrl(raw, ["http:", "https:"])) {
    throw new Error("APP_URL/NEXTAUTH_URL geçerli bir HTTP(S) URL olmalıdır.");
  }
  if (env.NODE_ENV === "production" && new URL(raw).protocol !== "https:") {
    throw new Error("Üretimde APP_URL/NEXTAUTH_URL HTTPS kullanmalıdır.");
  }
  return raw.replace(/\/$/, "");
}
