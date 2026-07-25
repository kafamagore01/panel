import type { MembershipRole } from "@/generated/prisma/client";

/** Üyelik rollerinin arayüzde gösterilen Türkçe karşılıkları. */
export const ROLE_LABELS: Record<MembershipRole, string> = {
  owner: "Sahip",
  admin: "Yönetici",
  technical: "Teknik",
  finance: "Finans",
  viewer: "İzleyici",
};

/** Bilinmeyen bir rol gelirse ham değerini döndürür. */
export function roleLabel(role: string | null): string {
  if (!role) return "";
  return ROLE_LABELS[role as MembershipRole] ?? role;
}
