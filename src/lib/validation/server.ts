import { z } from "zod";

export const SERVER_STATUS_OPTIONS = [
  { value: "active", label: "Aktif" },
  { value: "maintenance", label: "Bakım" },
  { value: "suspended", label: "Askıda" },
  { value: "terminated", label: "Sonlandırıldı" },
];

const optStr = (max = 300) =>
  z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

const optInt = z
  .union([z.string(), z.number(), z.literal("")])
  .optional()
  .transform((v) => (v === "" || v === undefined ? undefined : Number(v)))
  .refine((v) => v === undefined || (Number.isInteger(v) && v >= 0), {
    message: "Geçerli bir sayı girin.",
  });

export const serverSchema = z.object({
  name: z.string().trim().min(2, "Sunucu adı zorunludur.").max(150),
  provider: optStr(100),
  external_ref: optStr(150),
  type: z.enum(["vds", "vps", "hosting", "dedicated", "cloud"]).default("vps"),
  hostname: optStr(253),
  primary_ip: optStr(45),
  region: optStr(100),
  operating_system: optStr(100),
  cpu_cores: optInt,
  ram_mb: optInt,
  disk_gb: optInt,
  management_url: optStr(300),
  ssh_port: z
    .union([z.string(), z.number(), z.literal("")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? 22 : Number(v)))
    .refine((v) => Number.isInteger(v) && v >= 1 && v <= 65535, {
      message: "SSH portu 1-65535 arasında olmalıdır.",
    }),
  ssh_user: optStr(100),
  status: z.enum(["active", "maintenance", "suspended", "terminated"]).default("active"),
  renewal_at: z
    .union([z.string(), z.literal("")])
    .optional()
    .transform((v) => (v ? v : undefined)),
  monthly_cost: z
    .union([z.string(), z.number(), z.literal("")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : Number(v)))
    .refine((v) => v === undefined || (Number.isFinite(v) && v >= 0), {
      message: "Geçerli bir tutar girin.",
    }),
  currency: z.string().trim().default("TRY"),
});

export type ServerInput = z.infer<typeof serverSchema>;

export const projectServerSchema = z.object({
  server_id: z.uuid(),
  project_id: z.uuid(),
  role: z.string().trim().max(100).optional(),
  environment: z.string().trim().max(50).optional(),
  is_primary: z.boolean().optional().default(false),
});
