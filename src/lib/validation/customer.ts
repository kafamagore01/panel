import { z } from "zod";

const optionalString = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => (v === "" ? undefined : v));

export const customerSchema = z.object({
  type: z.enum(["company", "individual"]),
  customer_kind: z.enum(["headquarters", "branch"]).default("headquarters"),
  parent_customer_id: z
    .union([z.uuid("Geçerli bir ana merkez seçin."), z.literal("")])
    .optional()
    .transform((v) => (v ? v : undefined)),
  branch_name: z
    .string()
    .trim()
    .max(100, "Şube adı en fazla 100 karakter olabilir.")
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  legal_name: z.string().trim().max(200),
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
}).superRefine((value, ctx) => {
  if (value.customer_kind === "headquarters") {
    if (value.legal_name.length < 2) {
      ctx.addIssue({
        code: "custom",
        path: ["legal_name"],
        message: "Unvan en az 2 karakter olmalıdır.",
      });
    }
    return;
  }

  if (value.type !== "company") {
    ctx.addIssue({
      code: "custom",
      path: ["customer_kind"],
      message: "Yalnızca kurumsal müşteriler şube olabilir.",
    });
  }
  if (!value.parent_customer_id) {
    ctx.addIssue({
      code: "custom",
      path: ["parent_customer_id"],
      message: "Ana merkez seçin.",
    });
  }
  if (!value.branch_name || value.branch_name.length < 2) {
    ctx.addIssue({
      code: "custom",
      path: ["branch_name"],
      message: "Şube adı en az 2 karakter olmalıdır.",
    });
  }
});

export type CustomerInput = z.infer<typeof customerSchema>;

export const CUSTOMER_STATUS_OPTIONS = [
  { value: "lead", label: "Aday" },
  { value: "active", label: "Aktif" },
  { value: "suspended", label: "Askıda" },
  { value: "archived", label: "Arşivlendi" },
] as const;
