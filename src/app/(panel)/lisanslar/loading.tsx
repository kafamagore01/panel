import {
  PageHeaderSkeleton,
  KpiRowSkeleton,
  ToolbarSkeleton,
  TableSkeleton,
  PaginationSkeleton,
} from "@/components/page-skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <KpiRowSkeleton count={3} />
      <ToolbarSkeleton />
      <TableSkeleton columns={5} />
      <PaginationSkeleton />
    </div>
  );
}
