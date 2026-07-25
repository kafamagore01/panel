import { prisma } from "@/lib/db/prisma";

/**
 * Başarısız lisans doğrulamalarını `license_events` tablosuna `validation_failed`
 * olarak yazar. Yalnızca lisansın bulunduğu (anahtarın doğru olduğu) hatalar
 * kaydedilir; bilinmeyen anahtarlar iz bırakmaz.
 *
 * Aynı lisans için art arda gelen aynı sebepli hatalar THROTTLE_MS penceresinde
 * tek kayda indirgenir — böylece hatalı yapılandırılmış bir istemci olay
 * geçmişini şişiremez. Kayıt hatası doğrulama yanıtını asla etkilemez.
 */

const THROTTLE_MS = 60_000;

export async function recordValidationFailure(
  licenseId: string,
  reason: string
): Promise<void> {
  try {
    const recent = await prisma.licenseEvent.findFirst({
      where: {
        license_id: licenseId,
        type: "validation_failed",
        reason,
        occurred_at: { gt: new Date(Date.now() - THROTTLE_MS) },
      },
      select: { id: true },
    });
    if (recent) return;

    await prisma.licenseEvent.create({
      data: { license_id: licenseId, type: "validation_failed", reason },
    });
  } catch (error) {
    console.error("Doğrulama hatası kaydedilemedi:", error);
  }
}
