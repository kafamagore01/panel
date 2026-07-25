"use client";

import { useState, useEffect, useTransition } from "react";
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
import { recordPayment } from "@/actions/finance";
import { formatMoney } from "@/lib/format";
import { useRouter } from "next/navigation";

export function PaymentDialog({
  open,
  onOpenChange,
  invoiceId,
  invoiceNo,
  balanceDue,
  currency,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  invoiceId: string;
  invoiceNo: string;
  balanceDue: number;
  currency: string;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState(balanceDue.toFixed(2));
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  // Mükerrer ödeme engeli için idempotency anahtarı diyalog açılışında üretilir
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    // Diyalog her açılışında yeni idempotency anahtarı ve varsayılan tutar
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIdempotencyKey(crypto.randomUUID());
      setAmount(balanceDue.toFixed(2));
      setErrors({});
    }
  }, [open, balanceDue]);

  function submit() {
    setErrors({});
    startTransition(async () => {
      const res = await recordPayment({
        invoice_id: invoiceId,
        amount,
        paid_on: paidOn,
        method,
        reference,
        idempotency_key: idempotencyKey,
      });
      if (res.success) {
        toast.success(res.message ?? "Ödeme kaydedildi.");
        onOpenChange(false);
        router.refresh();
      } else {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ödeme Kaydet</DialogTitle>
          <DialogDescription>
            {invoiceNo} · Kalan bakiye: {formatMoney(balanceDue, currency)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Tutar" error={errors.amount} required>
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Ödeme Tarihi" error={errors.paid_on} required>
              <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
            </Field>
            <Field label="Yöntem">
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Havale/EFT</SelectItem>
                  <SelectItem value="cash">Nakit</SelectItem>
                  <SelectItem value="credit_card">Kredi Kartı</SelectItem>
                  <SelectItem value="other">Diğer</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Referans (opsiyonel)">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Dekont no, açıklama..." />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Vazgeç</Button>
          <Button onClick={submit} disabled={isPending} className="bg-[#5267ff] hover:bg-[#4254e1]">
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
