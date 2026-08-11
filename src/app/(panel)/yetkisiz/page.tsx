import Link from "next/link";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Yetkisiz Erişim · Operasyon Merkezi" };

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-md rounded-[22px] border border-slate-200/80 bg-white p-8 text-center shadow-sm">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
          <ShieldX className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-xl font-extrabold text-[#141821]">Bu alan için yetkiniz yok</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Erişim için çalışma alanı yöneticinizden ilgili görüntüleme yetkisini isteyin.
        </p>
        <Button asChild className="mt-5 bg-[#5267ff] hover:bg-[#4254e1]">
          <Link href="/profil">Profile Git</Link>
        </Button>
      </div>
    </div>
  );
}
