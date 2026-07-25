import { z } from "zod";
import { CURRENCY_CODES } from "@/lib/currency";
import { calculateDueDays } from "@/lib/finance";

export const INVOICE_STATUS_OPTIONS = [
  { value: "issued", label: "Düzenlendi" },
  { value: "partial", label: "Kısmi" },
  { value: "paid", label: "Ödendi" },
  { value: "overdue", label: "Gecikmiş" },
  { value: "void", label: "İptal" },
];

/** Elle girilen sabit kur; boşsa TCMB günlük kuru kullanılır. */
const manualFxRate = z
  .union([z.string(), z.number(), z.literal("")])
  .optional()
  .transform((v) => (v === "" || v === undefined ? undefined : Number(v)))
  .refine((v) => v === undefined || (Number.isFinite(v) && v > 0), {
    message: "Kur sıfırdan büyük olmalıdır.",
  });

const optUuid = z
  .union([z.uuid(), z.literal("")])
  .optional()
  .transform((v) => (v ? v : undefined));

export const invoiceSchema = z
  .object({
    customer_id: z.uuid("Müşteri seçilmelidir."),
    project_id: optUuid,
    description: z.string().trim().max(500).optional().transform((v) => (v ? v : undefined)),
    subtotal: z
      .union([z.string(), z.number()])
      .transform((v) => Number(v))
      .refine((v) => Number.isFinite(v) && v > 0, { message: "Tutar 0'dan büyük olmalıdır." }),
    tax_rate: z
      .union([z.string(), z.number(), z.literal("")])
      .optional()
      .transform((v) => (v === "" || v === undefined ? 20 : Number(v)))
      .refine((v) => Number.isFinite(v) && v >= 0 && v <= 100, {
        message: "KDV oranı 0-100 arasında olmalıdır.",
      }),
    currency: z.enum(CURRENCY_CODES, "Geçersiz para birimi.").default("TRY"),
    /** Boş bırakılırsa TCMB'nin o günkü kuru kullanılır (her gün tazelenir). */
    manual_fx_rate: manualFxRate,
    issued_on: z.string().min(1, "Düzenleme tarihi zorunludur."),
    payment_on: z.string().min(1, "Ödeme tarihi zorunludur."),
    period_start: z.union([z.string(), z.literal("")]).optional().transform((v) => (v ? v : undefined)),
    period_end: z.union([z.string(), z.literal("")]).optional().transform((v) => (v ? v : undefined)),
    notes: z.string().trim().max(1000).optional().transform((v) => (v ? v : undefined)),
  })
  .superRefine((data, ctx) => {
    const dueDays = calculateDueDays(data.issued_on, data.payment_on);

    if (dueDays === null) {
      ctx.addIssue({
        code: "custom",
        path: ["payment_on"],
        message: "Geçerli bir ödeme tarihi seçilmelidir.",
      });
    } else if (dueDays < 0) {
      ctx.addIssue({
        code: "custom",
        path: ["payment_on"],
        message: "Ödeme tarihi düzenleme tarihinden önce olamaz.",
      });
    } else if (dueDays > 365) {
      ctx.addIssue({
        code: "custom",
        path: ["payment_on"],
        message: "Ödeme tarihi en fazla 365 gün sonrası olabilir.",
      });
    }
  });

export type InvoiceInput = z.infer<typeof invoiceSchema>;

export const paymentSchema = z.object({
  invoice_id: z.uuid("Fatura seçilmelidir."),
  amount: z
    .union([z.string(), z.number()])
    .transform((v) => Number(v))
    .refine((v) => Number.isFinite(v) && v > 0, { message: "Tutar 0'dan büyük olmalıdır." }),
  paid_on: z.string().min(1, "Ödeme tarihi zorunludur."),
  method: z.enum(["bank_transfer", "cash", "credit_card", "other"]).default("bank_transfer"),
  reference: z.string().trim().max(150).optional().transform((v) => (v ? v : undefined)),
  idempotency_key: z.uuid("Idempotency anahtarı geçersiz."),
});

export type PaymentInput = z.infer<typeof paymentSchema>;

export const scheduleSchema = z.object({
  customer_id: z.uuid("Müşteri seçilmelidir."),
  project_id: optUuid,
  title: z.string().trim().min(2, "Başlık zorunludur.").max(200),
  amount: z
    .union([z.string(), z.number()])
    .transform((v) => Number(v))
    .refine((v) => Number.isFinite(v) && v > 0, { message: "Tutar 0'dan büyük olmalıdır." }),
  tax_rate: z
    .union([z.string(), z.number(), z.literal("")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? 20 : Number(v))),
  currency: z.enum(CURRENCY_CODES, "Geçersiz para birimi.").default("TRY"),
  /** Boş bırakılırsa TCMB'nin o günkü kuru kullanılır (her gün tazelenir). */
  manual_fx_rate: manualFxRate,
  interval_unit: z.enum(["month", "year"]).default("month"),
  interval_count: z
    .union([z.string(), z.number(), z.literal("")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? 1 : Number(v)))
    .refine((v) => Number.isInteger(v) && v >= 1, { message: "Aralık en az 1 olmalıdır." }),
  starts_on: z.string().min(1, "Başlangıç tarihi zorunludur."),
  ends_on: z.union([z.string(), z.literal("")]).optional().transform((v) => (v ? v : undefined)),
  due_days: z
    .union([z.string(), z.number(), z.literal("")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? 7 : Number(v))),
});

export type ScheduleInput = z.infer<typeof scheduleSchema>;
