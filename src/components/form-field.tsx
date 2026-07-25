import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

/** Etiket + alan + hata mesajı sarmalayıcı — tüm modül formlarında kullanılır. */
export function Field({
  label,
  error,
  required,
  hint,
  children,
}: {
  label: string;
  error?: string[];
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-rose-600">{error[0]}</p>}
    </div>
  );
}
