import { z } from "zod";
import { CURRENCY_CODES } from "@/lib/currency";

const optDate = z
  .union([z.string(), z.literal("")])
  .optional()
  .transform((v) => (v ? v : undefined));

const optStr = (max = 500) =>
  z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

export const PROJECT_STATUS_OPTIONS = [
  { value: "draft", label: "Taslak" },
  { value: "development", label: "Geliştirme" },
  { value: "testing", label: "Test" },
  { value: "live", label: "Canlı" },
  { value: "maintenance", label: "Bakım" },
  { value: "on_hold", label: "Askıda" },
  { value: "completed", label: "Tamamlandı" },
  { value: "archived", label: "Arşivlendi" },
];

export const projectSchema = z
  .object({
    customer_id: z.uuid("Müşteri seçilmelidir."),
    product_id: z
      .union([z.uuid(), z.literal("")])
      .optional()
      .transform((v) => (v ? v : undefined)),
    owner_user_id: z
      .union([z.uuid(), z.literal("")])
      .optional()
      .transform((v) => (v ? v : undefined)),
    name: z.string().trim().min(2, "Proje adı en az 2 karakter olmalıdır.").max(200),
    branch_name: optStr(100),
    description: optStr(2000),
    status: z
      .enum([
        "draft",
        "development",
        "testing",
        "live",
        "maintenance",
        "on_hold",
        "completed",
      ])
      .default("draft"),
    start_date: optDate,
    target_end_date: optDate,
    budget: z
      .union([z.string(), z.number(), z.literal("")])
      .optional()
      .transform((v) => (v === "" || v === undefined ? undefined : Number(v)))
      .refine((v) => v === undefined || (Number.isFinite(v) && v >= 0), {
        message: "Bütçe geçerli bir sayı olmalıdır.",
      }),
    currency: z.enum(CURRENCY_CODES, "Geçersiz para birimi.").default("TRY"),
    /** Boş bırakılırsa TCMB'nin o günkü kuru kullanılır (her gün tazelenir). */
    manual_fx_rate: z
      .union([z.string(), z.number(), z.literal("")])
      .optional()
      .transform((v) => (v === "" || v === undefined ? undefined : Number(v)))
      .refine((v) => v === undefined || (Number.isFinite(v) && v > 0), {
        message: "Kur sıfırdan büyük olmalıdır.",
      }),
    live_url: optStr(300),
    admin_url: optStr(300),
    repository_url: optStr(300),
    // GitHub eşleşmesi (Ayarlar'daki bağlantı üzerinden seçilir)
    github_repo_id: z
      .string()
      .trim()
      .max(30)
      .regex(/^\d*$/, "Geçersiz repo kimliği.")
      .optional()
      .transform((v) => (v ? v : undefined)),
    github_repo_full_name: z
      .union([
        z.string().trim().regex(/^[\w.-]+\/[\w.-]+$/, "Repo adı owner/repo biçiminde olmalıdır."),
        z.literal(""),
      ])
      .optional()
      .transform((v) => (v ? v : undefined)),
    tech_stack: optStr(500),
    notes: optStr(2000),
    // Webhook
    license_webhook_url: z
      .union([z.url("Geçerli bir URL girin."), z.literal("")])
      .optional()
      .transform((v) => (v ? v : undefined)),
    license_webhook_secret: optStr(200),
    // Mevcut bir projeyi aynı repo üzerinden farklı müşteriye satma/kurma kipi
    reuse_existing_project: z.boolean().optional().default(false),
    source_project_id: z
      .union([z.uuid(), z.literal("")])
      .optional()
      .transform((v) => (v ? v : undefined)),
  })
  .refine(
    (data) => !data.reuse_existing_project || data.source_project_id != null,
    {
      message: "Satılacak kaynak proje seçilmelidir.",
      path: ["source_project_id"],
    }
  )
  .refine(
    (data) =>
      !data.license_webhook_url ||
      (data.license_webhook_secret != null &&
        data.license_webhook_secret.length >= 16),
    {
      message: "Webhook adresi girildiğinde en az 16 karakterlik bir secret zorunludur.",
      path: ["license_webhook_secret"],
    }
  )
  .refine(
    (data) =>
      !data.license_webhook_url ||
      data.license_webhook_url.startsWith("https://"),
    {
      message: "Webhook adresi HTTPS protokolü kullanmalıdır.",
      path: ["license_webhook_url"],
    }
  );

export type ProjectInput = z.infer<typeof projectSchema>;
