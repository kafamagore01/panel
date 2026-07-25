import { z } from "zod";

const optionalString = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => (v === "" ? undefined : v));

export const customerSchema = z.object({
  type: z.enum(["company", "individual"]),
  legal_name: z.string().trim().min(2, "Unvan en az 2 karakter olmalıdır.").max(200),
  trade_name: optionalString,
  tax_number: optionalString,
  tax_office: optionalString,
  email: z
    .union([z.email("Geçerli bir e-posta girin."), z.literal("")])
    .optional()
    .transform((v) => (v ? v : undefined)),
  phone: optionalString,
  website_url: optionalString,
  billing_address: z.string().trim().max(1000).optional().transform((v) => (v === "" ? undefined : v)),
  status: z.enum(["lead", "active", "suspended", "archived"]).default("lead"),
  notes: z.string().trim().max(2000).optional().transform((v) => (v === "" ? undefined : v)),
});

export type CustomerInput = z.infer<typeof customerSchema>;

export const CUSTOMER_STATUS_OPTIONS = [
  { value: "lead", label: "Aday" },
  { value: "active", label: "Aktif" },
  { value: "suspended", label: "Askıda" },
  { value: "archived", label: "Arşivlendi" },
];
