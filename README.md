# Operasyon Merkezi — Çok Kiracılı SaaS Yönetim Paneli

Next.js (App Router) + TypeScript + Prisma + PostgreSQL üzerine kurulu, tip güvenli,
çok kiracılı (multi-tenant) SaaS operasyon paneli. Müşteri, proje, lisans, sunucu ve
finans yönetimi; HMAC + AES-256-GCM tabanlı lisans altyapısı; genel lisans doğrulama
API'si; RBAC ve denetim izi (audit log) içerir. Tüm arayüz Türkçedir.

## Teknoloji Yığını

- **Framework:** Next.js 16 (App Router, RSC, Server Actions) + React 19 + TypeScript (strict)
- **Veritabanı:** PostgreSQL + Prisma (adapter-pg ile)
- **Auth:** Auth.js v5 — Credentials + veritabanı oturumu (database session, JWT yok)
- **UI:** Tailwind CSS v4 + shadcn/ui + Lucide + Manrope
- **Form:** React Hook Form pattern + Zod (client + server çift doğrulama)
- **Kuyruk/Cron:** Upstash QStash + Redis (rate limit)
- **E-posta:** Nodemailer (SMTP) / Resend soyutlaması

## Kurulum

### 1. Bağımlılıklar

```bash
npm install
```

### 2. Ortam değişkenleri

`.env.example` dosyasını `.env` olarak kopyalayın ve doldurun:

```bash
cp .env.example .env
```

Zorunlu değişkenler:

| Değişken | Açıklama |
|---|---|
| `DATABASE_URL` | PostgreSQL bağlantı adresi |
| `NEXTAUTH_SECRET` | Oturum imzalama anahtarı |
| `APP_PEPPER` | Lisans HMAC-SHA256 pepper (min 32 karakter) |
| `ENCRYPTION_KEY` | AES-256-GCM anahtarı (64 hex karakter = 32 byte) |

Anahtar üretimi:

```bash
# NEXTAUTH_SECRET / APP_PEPPER
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
# ENCRYPTION_KEY (64 hex)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

İsteğe bağlı (üretim): `UPSTASH_REDIS_*`, `QSTASH_*`, `EMAIL_DRIVER` + SMTP/Resend,
`CRON_SECRET`, `APP_URL`, `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET`.

### 3. Veritabanı

```bash
npm run db:migrate      # migration'ları uygula (prisma migrate deploy)
npm run db:seed         # varsayılan workspace + owner kullanıcı
```

Seed varsayılan giriş bilgileri (`SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` ile
değiştirilebilir):

```
E-posta : owner@panel.local
Parola  : Owner123!
```

> İlk girişten sonra parolayı mutlaka değiştirin.

### 4. Geliştirme

```bash
npm run dev
```

`http://localhost:3000` → otomatik `/giris` sayfasına yönlendirir.

## Mimarî Notları

- **Kiracı izolasyonu:** `getTenantDb()` ([src/lib/db/tenant.ts](src/lib/db/tenant.ts))
  Prisma `$extends` ile tüm okuma sorgularına `{ workspace_id, deleted_at: null }`
  filtresini otomatik ekler; yazma işlemlerinde workspace_id zorlanır.
- **RBAC:** `requirePermission()` ([src/lib/auth/permissions.ts](src/lib/auth/permissions.ts))
  her Server Action girişinde çalışır; yetkisiz erişimde güvenlik günlüğü yazılır.
- **Denetim izi:** `writeAudit()` ([src/lib/audit.ts](src/lib/audit.ts)) hassas alanları
  `[REDACTED]` maskeler.
- **Lisans kriptografisi:** anahtar yalnızca HMAC-SHA256 (`key_hash`) ile aranır; düz
  anahtar ve webhook secret AES-256-GCM (`iv:ciphertext:authTag`) ile şifreli saklanır.

## GitHub Entegrasyonu

Çalışma alanı başına **tek** GitHub bağlantısı tutulur (`github_connections`); token
AES-256-GCM ile şifreli saklanır ve hiçbir zaman istemciye gönderilmez. Bağlantıyı
yalnızca **Owner** (`system.manage`) kurar veya kaldırır.

**Bağlanma — Ayarlar → GitHub Bağlantısı**

1. *OAuth App:* `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` tanımlıysa "GitHub ile
   Bağlan" butonu görünür. GitHub'da OAuth App oluştururken callback adresi
   `<APP_URL>/api/github/callback` olmalıdır. Akış CSRF `state` çerezi ile korunur.
2. *Personal Access Token:* Kurulum gerektirmez. Gereken kapsamlar: `repo`
   (özel repolar için) ve `read:org`.

**Kullanım**

- Proje formunda **hızlı repo seçimi**: aranabilir liste (`GET /user/repos`), seçimde
  repo URL, proje adı, branch, açıklama ve dil alanları otomatik dolar.
- Proje kaydında yalnızca eşleşme saklanır: `github_repo_id` + `github_repo_full_name`.
- Repo istatistikleri **veritabanına yazılmaz**; varsayılan dal, son commit, açık issue
  ve yıldız sayısı her sayfa açılışında GitHub'dan canlı okunur
  ([src/lib/github/repos.ts](src/lib/github/repos.ts)). Oran limitini korumak için
  süreç içi kısa ömürlü cache kullanılır (repo listesi 120 sn, repo durumu 60 sn) —
  yanıtlar Next.js data cache'ine yazılmaz, böylece kiracılar arası sızma olmaz.
- Bağlantı kaldırıldığında projelerdeki repo eşleşmeleri silinmez, yalnızca canlı veri
  çekimi durur.

## Genel Lisans Doğrulama API'si

```
POST /api/v1/licenses/validate
Content-Type: application/json

{ "license_key": "PT-XXXXX-XXXXX-XXXXX-XXXXX", "domain": "musteri.com",
  "instance_id": "abc-123", "app_version": "1.0.0" }
```

IP başına dakikada 60 istek; DB transaction + row lock ile çalışır. Yanıt kodları:
`200` geçerli, `403` domain_mismatch/suspended/revoked/not_started/expired/activation_limit_exceeded,
`404` not_found, `422` invalid_domain, `429` rate_limited.

## Zamanlanmış Görevler (QStash Schedules)

Üretimde aşağıdaki endpoint'leri QStash Schedule veya `Authorization: Bearer $CRON_SECRET`
ile günlük tetikleyin:

- `POST /api/cron/billing` — vadesi gelen planlardan otomatik fatura üretimi
- `POST /api/cron/licenses` — lisans durum senkronizasyonu + gecikmiş fatura işaretleme

## Komutlar

| Komut | Açıklama |
|---|---|
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` | Üretim derlemesi |
| `npm run db:migrate` | Migration uygula |
| `npm run db:seed` | Seed verisi |
| `npm run db:studio` | Prisma Studio |
