import { LunaraScene } from "@/components/auth/lunara-scene";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <LunaraScene>{children}</LunaraScene>;
}
