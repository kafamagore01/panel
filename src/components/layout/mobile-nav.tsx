"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/lib/navigation";

export function MobileNav({
  items,
  workspaceName,
}: {
  items: NavItem[];
  workspaceName: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Menü">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 border-0 bg-sidebar p-0 text-sidebar-foreground">
        <SheetTitle className="sr-only">Gezinme Menüsü</SheetTitle>
        <div className="flex items-center gap-3 px-4 py-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#5267ff] text-base font-extrabold text-white">
            PT
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold text-white">
              {workspaceName}
            </p>
            <p className="text-xs text-sidebar-foreground/60">Operasyon Merkezi</p>
          </div>
        </div>
        <nav className="space-y-1 px-3 py-2">
          {items.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
                  active
                    ? "bg-sidebar-accent text-white"
                    : "text-sidebar-foreground/80 hover:bg-white/5 hover:text-white"
                )}
              >
                <Icon name={item.icon} className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
