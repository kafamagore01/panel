import Link from "next/link";
import { Building2, ChevronsUpDown } from "lucide-react";

/** Üst barda aktif çalışma alanı adı; tıklayınca ekip/workspace sayfasına gider. */
export function WorkspaceBadge({ name }: { name: string }) {
  return (
    <Link
      href="/ekip"
      className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-[#141821] transition-colors hover:border-[#5267ff]/40"
    >
      <Building2 className="h-4 w-4 text-[#5267ff]" />
      <span className="max-w-[160px] truncate">{name}</span>
      <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
    </Link>
  );
}
