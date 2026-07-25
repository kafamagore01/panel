import { z } from "zod";

export const productSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Kod en az 2 karakter olmalıdır.")
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/, "Kod yalnızca harf, rakam, tire ve alt çizgi içerebilir."),
  name: z.string().trim().min(2, "Ad en az 2 karakter olmalıdır.").max(150),
  description: z.string().trim().max(2000).optional().transform((v) => (v ? v : undefined)),
  repository_url: z.string().trim().max(300).optional().transform((v) => (v ? v : undefined)),
  customer_id: z
    .union([z.uuid(), z.literal("")])
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export type ProductInput = z.infer<typeof productSchema>;
