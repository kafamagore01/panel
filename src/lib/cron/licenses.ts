import { prisma } from "@/lib/db/prisma";

/**
 * Lisans durum senkronizasyonu:
 *  - Süresi dolmuş ama ek süre içindekiler → grace
 *  - Ek süresi de dolmuş / ek süresi olmayanlar → expired (auto_suspend ise suspended)
 *  - Gecikmiş faturaların işaretlenmesi ayrı ele alınır
 */
export async function runLicenseCron(): Promise<{
  toGrace: number;
  toExpired: number;
  toSuspended: number;
  overdueInvoices: number;
}> {
  const now = new Date();

  // 1) active → grace (expires geçti, grace penceresi devam ediyor)
  const toGrace = await prisma.license.updateMany({
    where: {
      status: "active",
      expires_at: { lt: now },
      grace_ends_at: { gte: now },
    },
    data: { status: "grace" },
  });

  // 2) grace/active → expired (ek süre yok veya bitti), auto_suspend kapalı
  const toExpired = await prisma.license.updateMany({
    where: {
      status: { in: ["active", "grace"] },
      expires_at: { lt: now },
      auto_suspend: false,
      OR: [{ grace_ends_at: null }, { grace_ends_at: { lt: now } }],
    },
    data: { status: "expired" },
  });

  // 3) auto_suspend açık ve süresi/ek süresi dolmuşlar → suspended
  const toSuspended = await prisma.license.updateMany({
    where: {
      status: { in: ["active", "grace"] },
      expires_at: { lt: now },
      auto_suspend: true,
      OR: [{ grace_ends_at: null }, { grace_ends_at: { lt: now } }],
    },
    data: { status: "suspended" },
  });

  // 4) Vadesi geçmiş faturaları işaretle
  const overdue = await prisma.invoice.updateMany({
    where: {
      status: { in: ["issued", "partial"] },
      due_on: { lt: now },
      balance_due: { gt: 0 },
    },
    data: { status: "overdue" },
  });

  return {
    toGrace: toGrace.count,
    toExpired: toExpired.count,
    toSuspended: toSuspended.count,
    overdueInvoices: overdue.count,
  };
}
