import { Skeleton } from "@/components/ui/skeleton";
import {
  PageHeaderSkeleton,
  KpiRowSkeleton,
  TableSkeleton,
} from "@/components/page-skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <KpiRowSkeleton count={3} />
      <div className="space-y-4">
        {/* TabsList iskeleti */}
        <Skeleton className="h-9 w-72 rounded-lg" />
        <TableSkeleton columns={5} />
      </div>
    </div>
  );
}
