"use client";

import { icons, type LucideProps } from "lucide-react";

/** İsimle lucide ikonu render eder (navigasyon vb. için). */
export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const LucideIcon = icons[name as keyof typeof icons];
  if (!LucideIcon) return null;
  return <LucideIcon {...props} />;
}
