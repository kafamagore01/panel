"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Building2, Check, ChevronsUpDown, Loader2, Users } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { switchWorkspace } from "@/actions/team";
import { roleLabel } from "@/lib/roles";

export type WorkspaceOption = { id: string; name: string; role: string };

/**
 * Üst bardaki çalışma alanı seçici. Aktif alanı gösterir; menüden başka bir
 * alana geçilebilir veya ekip sayfasına gidilebilir.
 */
export function WorkspaceBadge({
  workspaces,
  currentId,
  currentName,
}: {
  workspaces: WorkspaceOption[];
  currentId: string;
  currentName: string;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSelect(id: string) {
    if (id === currentId || isPending) return;
    setPendingId(id);
    startTransition(async () => {
      const res = await switchWorkspace(id);
      setPendingId(null);
      if (res.success) {
        toast.success(res.message ?? "Çalışma alanı değiştirildi.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Çalışma alanını değiştir"
        className="flex items-center gap-2 rounded-[12px] border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-[#141821] outline-none transition-colors hover:border-[#5267ff]/40 data-[state=open]:border-[#5267ff]/60"
      >
        <Building2 className="h-4 w-4 shrink-0 text-[#5267ff]" />
        <span className="max-w-[160px] truncate">{currentName}</span>
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64 rounded-[14px]">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          Çalışma Alanları
        </DropdownMenuLabel>
        {workspaces.map((ws) => (
          <DropdownMenuItem
            key={ws.id}
            onSelect={() => onSelect(ws.id)}
            disabled={isPending}
            className="gap-2"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-foreground">{ws.name}</p>
              <p className="text-xs text-muted-foreground">{roleLabel(ws.role)}</p>
            </div>
            {pendingId === ws.id ? (
              <Loader2 className="h-4 w-4 animate-spin text-[#5267ff]" />
            ) : (
              ws.id === currentId && <Check className="h-4 w-4 text-[#5267ff]" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/ekip">
            <Users className="mr-2 h-4 w-4" />
            Çalışma Alanlarını Yönet
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
