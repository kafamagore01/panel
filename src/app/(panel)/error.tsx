"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Panel sayfalarının hata sınırı. Sayfa render'ında oluşan hatalar (ör.
 * veritabanına ulaşılamaması) burada yakalanır; yönlendirme yapılmaz çünkü
 * /giris'e atmak kalıntı çerezle sonsuz döngü üretir.
 */
export default function PanelError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md rounded-[22px] border border-slate-200/80 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-extrabold text-[#141821]">
          Bir Sorun Oluştu
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sayfa yüklenirken beklenmeyen bir hata oluştu. Sorun sürerse birkaç
          dakika sonra tekrar deneyin.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            Hata kodu: {error.digest}
          </p>
        ) : null}
        <Button className="mt-6" onClick={reset}>
          Tekrar dene
        </Button>
      </div>
    </div>
  );
}
