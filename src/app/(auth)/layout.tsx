export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f5f7] p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#5267ff] text-xl font-extrabold text-white">
            PT
          </span>
          <div>
            <h1 className="text-xl font-extrabold text-[#141821]">Operasyon Merkezi</h1>
            <p className="text-sm text-muted-foreground">Çok kiracılı yönetim paneli</p>
          </div>
        </div>
        <div className="rounded-[22px] border border-slate-200/80 bg-white p-8 shadow-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
