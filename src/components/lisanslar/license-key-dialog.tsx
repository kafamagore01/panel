"use client";

import { useState } from "react";
import { Copy, Check, TriangleAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** Lisans anahtarını tek seferlik gösteren modal ("Şimdi Kaydet" uyarısıyla). */
export function LicenseKeyDialog({
  licenseKey,
  onClose,
}: {
  licenseKey: string | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!licenseKey) return;
    await navigator.clipboard.writeText(licenseKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open={Boolean(licenseKey)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lisans Anahtarı</DialogTitle>
          <DialogDescription>
            Bu anahtar yalnızca şimdi gösterilecek. Güvenli bir yere kaydedin.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Pencereyi kapattıktan sonra anahtar tekrar gösterilemez.</span>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <code className="flex-1 break-all font-mono text-sm font-semibold text-[#141821]">
            {licenseKey}
          </code>
          <Button size="sm" variant="outline" onClick={copy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>

        <DialogFooter>
          <Button onClick={onClose} className="bg-[#5267ff] hover:bg-[#4254e1]">
            Kaydettim, Kapat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
