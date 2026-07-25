import { z } from "zod";

export const DOMAIN_STATUS_OPTIONS = [
  { value: "active", label: "Aktif" },
  { value: "expired", label: "Süresi Doldu" },
  { value: "transferred", label: "Devredildi" },
  { value: "cancelled", label: "Bırakıldı" },
];

/** Kayıt durumuna ek olarak süreye göre süzen sanal filtreler (?durum=). */
export const DOMAIN_EXPIRY_FILTERS = {
  expiring: "expiring",
  overdue: "overdue",
} as const;

export const DOMAIN_FILTER_OPTIONS = [
  ...DOMAIN_STATUS_OPTIONS,
  { value: DOMAIN_EXPIRY_FILTERS.expiring, label: "30 Gün İçinde Bitiyor" },
  { value: DOMAIN_EXPIRY_FILTERS.overdue, label: "Süresi Geçmiş" },
];

const optStr = (max = 300) =>
  z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

const optDate = z
  .union([z.string(), z.literal("")])
  .optional()
  .transform((v) => (v ? v : undefined));

const optUuid = z
  .union([z.uuid(), z.literal(""), z.literal("none")])
  .optional()
  .transform((v) => (v && v !== "none" ? v : undefined));

const optAmount = z
  .union([z.string(), z.number(), z.literal("")])
  .optional()
  .transform((v) => (v === "" || v === undefined ? undefined : Number(v)))
  .refine((v) => v === undefined || (Number.isFinite(v) && v >= 0), {
    message: "Geçerli bir tutar girin.",
  });

export const domainSchema = z.object({
  name: z.string().trim().min(3, "Alan adı zorunludur.").max(253),
  registrar: optStr(120),
  registrar_url: optStr(300),
  customer_id: optUuid,
  project_id: optUuid,
  status: z.enum(["active", "expired", "transferred", "cancelled"]).default("active"),
  registered_at: optDate,
  expires_at: optDate,
  ssl_expires_at: optDate,
  auto_renew: z
    .union([z.boolean(), z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => (typeof v === "string" ? v === "true" : (v ?? true))),
  nameservers: optStr(500),
  annual_cost: optAmount,
  currency: z.string().trim().default("TRY"),
  notes: optStr(1000),
});

export type DomainInput = z.infer<typeof domainSchema>;

/** Lisans domainini envantere aktarırken kullanılır. */
export const importLicenseDomainSchema = z.object({
  license_domain_id: z.uuid(),
});
