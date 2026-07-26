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
    required("UPSTASH_REDIS_REST_URL");
    required("UPSTASH_REDIS_REST_TOKEN");
    required("QSTASH_TOKEN");
    required("QSTASH_CURRENT_SIGNING_KEY");
    required("QSTASH_NEXT_SIGNING_KEY");
    required("CRON_SECRET", 32);

    const actionsKey = required("NEXT_SERVER_ACTIONS_ENCRYPTION_KEY");
    if (actionsKey && !isValidServerActionsKey(actionsKey)) {
      issues.push(
        "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY geçerli 16/24/32 baytlık base64 AES anahtarı olmalıdır."
      );
    }

    const driver = value(env, "EMAIL_DRIVER");
    if (driver !== "smtp" && driver !== "resend") {
      issues.push("EMAIL_DRIVER üretimde smtp veya resend olmalıdır.");
    }
    required("EMAIL_FROM");
    if (driver === "smtp") {
      required("SMTP_HOST");
      required("SMTP_USER");
      required("SMTP_PASS");
    } else if (driver === "resend") {
      required("RESEND_API_KEY");
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
