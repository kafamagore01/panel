"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/lib/navigation";

const STORAGE_KEY = "panel:sidebar-collapsed";

export function SidebarNav({
  items,
  workspaceName,
}: {
  items: NavItem[];
  workspaceName: string;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // localStorage yalnızca istemcide erişilebilir; mount sonrası tercihi uygula
    const stored = localStorage.getItem(STORAGE_KEY) === "1";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    setCollapsed(stored);
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col shrink-0 bg-sidebar text-sidebar-foreground transition-[width] duration-200",
        mounted && collapsed ? "w-[76px]" : "w-64"
      )}
    >
      <div className="flex items-center gap-3 px-4 py-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#5267ff] text-base font-extrabold text-white">
          PT
        </span>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold text-white">
              {workspaceName}
            </p>
            <p className="truncate text-xs text-sidebar-foreground/60">
              Operasyon Merkezi
            </p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={cn(
                "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-white"
                  : "text-sidebar-foreground/80 hover:bg-white/5 hover:text-white"
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-6 -translate-y-1/2 w-1 rounded-r bg-[#5267ff]" />
              )}
              <Icon name={item.icon} className="h-5 w-5 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={toggle}
        className="m-3 flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-sidebar-foreground/70 hover:bg-white/5 hover:text-white"
      >
        {collapsed ? (
          <PanelLeft className="h-4 w-4" />
        ) : (
          <>
            <PanelLeftClose className="h-4 w-4" />
            Menüyü Daralt
          </>
        )}
      </button>
    </aside>
  );
}
