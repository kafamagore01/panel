import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * loading.tsx dosyalarında kullanılan ortak iskelet parçaları.
 * Gerçek bileşenlerle aynı ölçüleri kullanır; böylece içerik geldiğinde
 * layout kayması (CLS) oluşmaz.
 */

/** PageHeader iskeleti. */
export function PageHeaderSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-8 w-64 max-w-full" />
      <Skeleton className="h-4 w-80 max-w-full" />
    </div>
  );
}

/** KpiCard satırı iskeleti. */
export function KpiRowSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4",
        count >= 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"
      )}
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-sm"
        >
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-20" />
            </div>
            <Skeleton className="h-10 w-10 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** ListToolbar iskeleti (arama alanı + opsiyonel durum filtresi). */
export function ToolbarSkeleton({ withFilter = true }: { withFilter?: boolean }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Skeleton className="h-9 flex-1" />
      {withFilter && <Skeleton className="h-9 w-full sm:w-48" />}
    </div>
  );
}

/** Beyaz kart içinde tablo iskeleti. */
export function TableSkeleton({
  rows = 6,
  columns = 5,
  withAction = true,
}: {
  rows?: number;
  columns?: number;
  withAction?: boolean;
}) {
  return (
    <div className="space-y-3">
      {withAction && (
        <div className="flex justify-end">
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
      )}
      <div className="overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-sm">
        <div className="border-b border-slate-200/80 px-4 py-3">
          <div className="flex items-center gap-4">
            {Array.from({ length: columns }, (_, i) => (
              <Skeleton key={i} className="h-3.5 flex-1" />
            ))}
          </div>
        </div>
        {Array.from({ length: rows }, (_, r) => (
          <div
            key={r}
            className="border-b border-slate-200/80 px-4 py-4 last:border-0"
          >
            <div className="flex items-center gap-4">
              {Array.from({ length: columns }, (_, c) => (
                <Skeleton
                  key={c}
                  className={cn("h-4 flex-1", c === 0 && "max-w-[220px]")}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** PaginationBar iskeleti. */
export function PaginationSkeleton() {
  return (
    <div className="flex items-center justify-between px-1 py-2">
      <Skeleton className="h-4 w-48" />
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-24 rounded-md" />
        <Skeleton className="h-8 w-24 rounded-md" />
      </div>
    </div>
  );
}

/** Genel amaçlı beyaz kart iskeleti. */
export function CardSkeleton({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "space-y-4 rounded-[22px] border border-slate-200/80 bg-white p-6 shadow-sm",
        className
      )}
    >
      <Skeleton className="h-5 w-44" />
      <div className="space-y-3">
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton
            key={i}
            className={cn("h-4 w-full", i === lines - 1 && "w-2/3")}
          />
        ))}
      </div>
    </div>
  );
}

/** Kart başlığı + tablo içeren panel iskeleti (dashboard blokları için). */
export function PanelCardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="rounded-[22px] border border-slate-200/80 bg-white shadow-sm">
      <div className="flex items-center justify-between p-5">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-12" />
      </div>
      <div className="px-5 pb-5">
        <div className="space-y-3">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
