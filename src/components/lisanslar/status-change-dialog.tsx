"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "@/components/form-field";
import { changeLicenseStatus } from "@/actions/licenses";
import { LICENSE_STATUS_OPTIONS } from "@/lib/validation/license";
import { useRouter } from "next/navigation";

export function StatusChangeDialog({
  open,
  onOpenChange,
  licenseId,
  currentStatus,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  licenseId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const res = await changeLicenseStatus({ license_id: licenseId, status, reason });
      if (res.success) {
        toast.success(res.message ?? "Güncellendi.");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lisans Durumu Değiştir</DialogTitle>
          <DialogDescription>Yeni durumu seçin ve isteğe bağlı bir açıklama girin.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Durum">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LICENSE_STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Açıklama (opsiyonel)">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Vazgeç</Button>
          <Button onClick={submit} disabled={isPending} className="bg-[#5267ff] hover:bg-[#4254e1]">
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Güncelle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
