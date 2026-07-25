import {
  PageHeaderSkeleton,
  KpiRowSkeleton,
  PanelCardSkeleton,
} from "@/components/page-skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <KpiRowSkeleton count={4} />
      <div className="grid gap-6 lg:grid-cols-2">
        <PanelCardSkeleton />
        <PanelCardSkeleton />
      </div>
    </div>
  );
}
