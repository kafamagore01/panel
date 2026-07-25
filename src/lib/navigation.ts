import type { PermissionAction } from "@/lib/auth/permissions";

export type NavItem = {
  href: string;
  label: string;
  icon: string; // lucide-react ikon adı
  /** Bu öğeyi görmek için gereken izin; "module.view" herkese açıktır */
  requires?: PermissionAction;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Genel Bakış", icon: "LayoutDashboard" },
  { href: "/musteriler", label: "Müşteriler", icon: "Users" },
  { href: "/projeler", label: "Projeler", icon: "FolderKanban" },
  { href: "/lisanslar", label: "Lisanslar", icon: "KeyRound" },
  { href: "/sunucular", label: "Sunucular", icon: "Server" },
  { href: "/domainler", label: "Domainler", icon: "Globe" },
  { href: "/finans", label: "Finans", icon: "Wallet", requires: "finance.manage" },
  { href: "/ekip", label: "Ekip", icon: "UserCog" },
  { href: "/ayarlar", label: "Ayarlar", icon: "Settings" },
  {
    href: "/sistem-guncelleme",
    label: "Sistem Özellikleri",
    icon: "RefreshCw",
    requires: "system.manage",
  },
];
