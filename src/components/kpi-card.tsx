import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export function KpiCard({
  title,
  value,
  icon,
  hint,
  tone = "default",
}: {
  title: string;
  value: ReactNode;
  icon?: string;
  hint?: string;
  tone?: "default" | "primary" | "danger" | "success";
}) {
  const toneClass = {
    default: "bg-slate-100 text-slate-600",
    primary: "bg-[#5267ff]/10 text-[#5267ff]",
    danger: "bg-rose-50 text-rose-600",
    success: "bg-emerald-50 text-emerald-600",
  }[tone];

  return (
    <div className="rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-extrabold text-[#141821]">{value}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {icon && (
          <span
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl",
              toneClass
            )}
          >
            <Icon name={icon} className="h-5 w-5" />
          </span>
        )}
      </div>
    </div>
  );
}
