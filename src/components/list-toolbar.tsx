"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type StatusFilterOption = { value: string; label: string };

/** Arama + durum filtresi. searchParams'ı günceller, sayfayı 1'e döndürür. */
export function ListToolbar({
  statusOptions,
  searchPlaceholder = "Ara...",
}: {
  statusOptions?: readonly StatusFilterOption[];
  searchPlaceholder?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [term, setTerm] = useState(searchParams.get("arama") ?? "");

  const updateParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      params.delete("sayfa");
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`);
      });
    },
    [pathname, router, searchParams]
  );

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <form
        className="relative flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          updateParams((p) => {
            if (term) p.set("arama", term);
            else p.delete("arama");
          });
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={searchPlaceholder}
          className="bg-white pl-9"
          aria-label="Ara"
        />
      </form>

      {statusOptions && statusOptions.length > 0 && (
        <Select
          value={searchParams.get("durum") ?? "all"}
          onValueChange={(value) =>
            updateParams((p) => {
              if (value === "all") p.delete("durum");
              else p.set("durum", value);
            })
          }
        >
          <SelectTrigger className="w-full bg-white sm:w-48" aria-label="Durum filtresi">
            <SelectValue placeholder="Durum" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm Durumlar</SelectItem>
            {statusOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {isPending && (
        <span className="text-xs text-muted-foreground">Yükleniyor…</span>
      )}
    </div>
  );
}
