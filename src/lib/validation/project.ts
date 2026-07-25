import { z } from "zod";

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
    currency: z.string().trim().default("TRY"),
    live_url: optStr(300),
    admin_url: optStr(300),
    repository_url: optStr(300),
    tech_stack: optStr(500),
    notes: optStr(2000),
    // Webhook
    license_webhook_url: z
      .union([z.url("Geçerli bir URL girin."), z.literal("")])
      .optional()
      .transform((v) => (v ? v : undefined)),
    license_webhook_secret: optStr(200),
    // Kod üretim kipi
    sell_to_branch: z.boolean().optional().default(false),
    base_project_id: z
      .union([z.uuid(), z.literal("")])
      .optional()
      .transform((v) => (v ? v : undefined)),
  })
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
