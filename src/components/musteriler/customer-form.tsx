"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createCustomer, updateCustomer } from "@/actions/customers";
import { Field } from "@/components/form-field";
import { useRouter } from "next/navigation";
import { buildBranchLegalName } from "@/lib/customer-name";

export type CustomerParentOption = {
  id: string;
  label: string;
};

export type CustomerFormValues = {
  id?: string;
  type: string;
  customer_kind: "headquarters" | "branch";
  parent_customer_id: string;
  branch_name: string;
  legal_name: string;
  trade_name: string;
  tax_number: string;
  tax_office: string;
  email: string;
  phone: string;
  website_url: string;
  billing_address: string;
  status: string;
  notes: string;
};

const EMPTY: CustomerFormValues = {
  type: "company",
  customer_kind: "headquarters",
  parent_customer_id: "",
  branch_name: "",
  legal_name: "",
  trade_name: "",
  tax_number: "",
  tax_office: "",
  email: "",
  phone: "",
  website_url: "",
  billing_address: "",
  status: "lead",
  notes: "",
};

export function CustomerForm({
  initial,
  parentOptions,
  onDone,
}: {
  initial?: Partial<CustomerFormValues>;
  parentOptions: CustomerParentOption[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState<CustomerFormValues>({ ...EMPTY, ...initial });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();
  const availableParentOptions = parentOptions.filter(
    (option) => option.id !== initial?.id
  );
  const selectedParent = availableParentOptions.find(
    (option) => option.id === values.parent_customer_id
  );
  const isBranch = values.customer_kind === "branch";
  const branchLegalName =
    isBranch && selectedParent
      ? buildBranchLegalName(selectedParent.label, values.branch_name)
      : "";

  function set<K extends keyof CustomerFormValues>(key: K, value: CustomerFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function onTypeChange(type: string) {
    setValues((prev) => ({
      ...prev,
      type,
      ...(type === "individual"
        ? {
            customer_kind: "headquarters" as const,
            parent_customer_id: "",
            branch_name: "",
          }
        : {}),
    }));
  }

  function onCustomerKindChange(customerKind: "headquarters" | "branch") {
    setValues((prev) => ({
      ...prev,
      customer_kind: customerKind,
      parent_customer_id:
        customerKind === "branch" ? prev.parent_customer_id : "",
      branch_name: customerKind === "branch" ? prev.branch_name : "",
    }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    const payload = {
      ...values,
      legal_name: isBranch ? branchLegalName : values.legal_name,
    };
    startTransition(async () => {
      const res = initial?.id
        ? await updateCustomer(initial.id, payload)
        : await createCustomer(payload);
      if (res.success) {
        toast.success(res.message ?? "Kaydedildi.");
        onDone();
        router.refresh();
      } else {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        toast.error(res.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 pt-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Tür" error={errors.type}>
          <Select value={values.type} onValueChange={onTypeChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="company">Kurumsal</SelectItem>
              <SelectItem value="individual">Bireysel</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Durum" error={errors.status}>
          <Select value={values.status} onValueChange={(v) => set("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="lead">Aday</SelectItem>
              <SelectItem value="active">Aktif</SelectItem>
              <SelectItem value="suspended">Askıda</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field
        label="Müşteri Yapısı"
        error={errors.customer_kind}
        hint={
          values.type === "individual"
            ? "Şube bağlantısı yalnızca kurumsal müşterilerde kullanılabilir."
            : undefined
        }
      >
        <Select
          value={values.customer_kind}
          onValueChange={(value) =>
            onCustomerKindChange(value as "headquarters" | "branch")
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="headquarters">Ana Merkez</SelectItem>
            <SelectItem value="branch" disabled={values.type !== "company"}>
              Şube
            </SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {isBranch ? (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Ana Merkez"
              error={errors.parent_customer_id}
              required
            >
              <Select
                value={values.parent_customer_id || undefined}
                onValueChange={(value) => set("parent_customer_id", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Ana merkez seçin" />
                </SelectTrigger>
                <SelectContent>
                  {availableParentOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label="Şube Adı"
              error={errors.branch_name}
              hint="Yalnızca şehir veya şube adını yazın."
              required
            >
              <Input
                value={values.branch_name}
                onChange={(e) => set("branch_name", e.target.value)}
                placeholder="Karaman"
                required
              />
            </Field>
          </div>

          <Field label="Otomatik Unvan">
            <Input
              value={branchLegalName}
              placeholder="Ana merkez ve şube adı seçildiğinde oluşur."
              readOnly
              className="bg-slate-50 font-medium"
              aria-live="polite"
            />
          </Field>
        </>
      ) : (
        <Field
          label={values.type === "company" ? "Unvan" : "Ad Soyad"}
          error={errors.legal_name}
          required
        >
          <Input
            value={values.legal_name}
            onChange={(e) => set("legal_name", e.target.value)}
            required
          />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Marka / Ticari Ad" error={errors.trade_name}>
          <Input value={values.trade_name} onChange={(e) => set("trade_name", e.target.value)} />
        </Field>
        <Field label="Web Sitesi" error={errors.website_url}>
          <Input value={values.website_url} onChange={(e) => set("website_url", e.target.value)} placeholder="https://" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Vergi No / TCKN" error={errors.tax_number}>
          <Input value={values.tax_number} onChange={(e) => set("tax_number", e.target.value)} />
        </Field>
        <Field label="Vergi Dairesi" error={errors.tax_office}>
          <Input value={values.tax_office} onChange={(e) => set("tax_office", e.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="E-posta" error={errors.email}>
          <Input type="email" value={values.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Telefon" error={errors.phone}>
          <Input value={values.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
      </div>

      <Field label="Fatura Adresi" error={errors.billing_address}>
        <Textarea value={values.billing_address} onChange={(e) => set("billing_address", e.target.value)} rows={2} />
      </Field>

      <Field label="Notlar" error={errors.notes}>
        <Textarea value={values.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={isPending}>
          Vazgeç
        </Button>
        <Button type="submit" disabled={isPending} className="bg-[#5267ff] hover:bg-[#4254e1]">
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {initial?.id ? "Güncelle" : "Oluştur"}
        </Button>
      </div>
    </form>
  );
}
