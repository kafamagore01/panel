import { z } from "zod";

export const LICENSE_STATUS_OPTIONS = [
  { value: "pending", label: "Beklemede" },
  { value: "active", label: "Aktif" },
  { value: "grace", label: "Ek Süre" },
  { value: "expired", label: "Süresi Doldu" },
  { value: "suspended", label: "Askıda" },
  { value: "revoked", label: "İptal Edildi" },
];

const optDate = z
  .union([z.string(), z.literal("")])
  .optional()
  .transform((v) => (v ? v : undefined));

export const createLicenseSchema = z.object({
  project_id: z.uuid("Proje seçilmelidir."),
  product_name: z.string().trim().min(2, "Ürün adı zorunludur.").max(150),
  starts_at: optDate,
  expires_at: optDate,
  grace_days: z
    .union([z.string(), z.number(), z.literal("")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? 0 : Number(v)))
    .refine((v) => Number.isFinite(v) && v >= 0 && v <= 365, {
      message: "Ek süre 0-365 gün arasında olmalıdır.",
    }),
  activation_limit: z
    .union([z.string(), z.number()])
    .transform((v) => Number(v))
    .refine((v) => Number.isInteger(v) && v >= 1 && v <= 10000, {
      message: "Aktivasyon limiti 1-10000 arasında olmalıdır.",
    }),
  auto_suspend: z.boolean().optional().default(false),
  features: z.string().trim().max(500).optional().transform((v) => (v ? v : undefined)),
});

export type CreateLicenseInput = z.infer<typeof createLicenseSchema>;

export const changeStatusSchema = z.object({
  license_id: z.uuid(),
  status: z.enum(["pending", "active", "grace", "expired", "suspended", "revoked"]),
  reason: z.string().trim().max(300).optional(),
});

export const licenseDomainSchema = z.object({
  license_id: z.uuid(),
  domain: z.string().trim().min(3, "Domain zorunludur.").max(253),
  environment: z.enum(["production", "staging", "local"]).default("production"),
  is_primary: z.boolean().optional().default(false),
});
