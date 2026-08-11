"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Package, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormDrawer } from "@/components/form-drawer";
import { Field } from "@/components/form-field";
import { createProduct, deleteProduct, updateProduct } from "@/actions/products";
import { useRouter } from "next/navigation";

export type CatalogProduct = {
  id: string;
  code: string;
  name: string;
  repository_url: string | null;
  project_count: number;
};

export function ProductCatalog({
  open,
  onOpenChange,
  products,
  canCreate,
  canUpdate,
  canDelete,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  products: CatalogProduct[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [repo, setRepo] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  function add() {
    setErrors({});
    startTransition(async () => {
      const res = editingId
        ? await updateProduct(editingId, { code, name, repository_url: repo })
        : await createProduct({ code, name, repository_url: repo });
      if (res.success) {
        toast.success(res.message ?? "Eklendi.");
        setCode("");
        setName("");
        setRepo("");
        setEditingId(null);
        router.refresh();
      } else {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        toast.error(res.error);
      }
    });
  }

  function edit(product: CatalogProduct) {
    setEditingId(product.id);
    setCode(product.code);
    setName(product.name);
    setRepo(product.repository_url ?? "");
    setErrors({});
  }

  function cancelEdit() {
    setEditingId(null);
    setCode("");
    setName("");
    setRepo("");
    setErrors({});
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteProduct(id);
      if (res.success) {
        toast.success(res.message ?? "Silindi.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Ürün Kataloğu"
      description="Projelerde otomatik form doldurma için kullanılan ürün şablonları."
    >
      <div className="space-y-4 pt-4">
        {(canCreate || editingId) && <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Kod" error={errors.code} required>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="MHSB" />
            </Field>
            <Field label="Ad" error={errors.name} required>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Muhasebe Portalı" />
            </Field>
          </div>
          <Field label="Repo URL" error={errors.repository_url}>
            <Input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="https://github.com/..." />
          </Field>
          <div className="flex gap-2">
          <Button onClick={add} disabled={isPending || !code || !name} className="flex-1 bg-[#5267ff] hover:bg-[#4254e1]">
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            {editingId ? "Ürünü Güncelle" : "Kataloğa Ekle"}
          </Button>
          {editingId && <Button variant="outline" size="icon" onClick={cancelEdit} disabled={isPending}>
            <X className="h-4 w-4" />
          </Button>}
          </div>
        </div>}

        <div className="space-y-2">
          {products.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
              <Package className="h-8 w-8 text-slate-300" />
              Henüz ürün eklenmedi.
            </div>
          ) : (
            products.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
                <div>
                  <p className="text-sm font-semibold text-[#141821]">
                    <span className="font-mono text-xs text-[#5267ff]">{p.code}</span> · {p.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{p.project_count} projede kullanılıyor</p>
                </div>
                <div className="flex items-center gap-1">
                {canUpdate && <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => edit(p)}
                  disabled={isPending}
                  title="Düzenle"
                >
                  <Pencil className="h-4 w-4" />
                </Button>}
                {canDelete && <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(p.id)}
                  disabled={isPending || p.project_count > 0}
                  className="text-rose-600 disabled:opacity-30"
                  title={p.project_count > 0 ? "Kullanımdaki ürün silinemez" : "Sil"}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </FormDrawer>
  );
}
