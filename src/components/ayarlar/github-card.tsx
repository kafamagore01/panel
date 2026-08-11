"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CircleAlert,
  CircleCheck,
  ExternalLink,
  FolderGit2,
  Loader2,
  RefreshCw,
  Unlink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/form-field";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { GithubMark } from "@/components/icons/github-mark";
import { formatDateTime } from "@/lib/format";
import {
  connectGithubWithToken,
  disconnectGithub,
  fetchGithubRepos,
  verifyGithubConnection,
} from "@/actions/github";
import type { GithubConnectionSummary } from "@/lib/github/connection";

/** OAuth dönüşünde /ayarlar?github=… ile taşınan durum kodları. */
const NOTICES: Record<string, { tone: "success" | "error"; text: string }> = {
  connected: { tone: "success", text: "GitHub hesabı başarıyla bağlandı." },
  cancelled: { tone: "error", text: "GitHub yetkilendirmesi iptal edildi." },
  state_mismatch: {
    tone: "error",
    text: "Güvenlik doğrulaması başarısız oldu (state uyuşmadı). Lütfen tekrar deneyin.",
  },
  failed: {
    tone: "error",
    text: "GitHub bağlantısı kurulamadı. Bilgileri kontrol edip tekrar deneyin.",
  },
  forbidden: {
    tone: "error",
    text: "GitHub bağlantısını yalnızca çalışma alanı sahibi yönetebilir.",
  },
  oauth_disabled: {
    tone: "error",
    text: "OAuth App yapılandırılmamış. Personal Access Token ile bağlanabilirsiniz.",
  },
};

/** Token oluşturma sayfası, gerekli kapsamlar önceden işaretli. */
const NEW_TOKEN_URL =
  "https://github.com/settings/tokens/new?scopes=repo,read:org&description=Operasyon%20Merkezi%20Paneli";

export function GithubCard({
  connection,
  oauthEnabled,
  canManage,
  notice,
}: {
  connection: GithubConnectionSummary | null;
  oauthEnabled: boolean;
  /** Çalışma alanına özel settings.update yetkisi. */
  canManage: boolean;
  notice?: string;
}) {
  const alert = notice ? NOTICES[notice] : undefined;

  return (
    <div className="rounded-[22px] border border-slate-200/80 bg-white p-6 shadow-sm lg:col-span-2">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#141821] text-white">
          <GithubMark className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-extrabold text-[#141821]">GitHub Bağlantısı</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Çalışma alanına bağlanan hesap; proje eklerken repo hızlı seçimi ve
            canlı repo takibi bu bağlantı üzerinden çalışır.
          </p>
        </div>
      </div>

      {alert && (
        <p
          className={`mt-4 flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
            alert.tone === "success"
              ? "bg-emerald-50 text-emerald-800"
              : "bg-rose-50 text-rose-800"
          }`}
        >
          {alert.tone === "success" ? (
            <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          {alert.text}
        </p>
      )}

      <div className="mt-4">
        {connection ? (
          <ConnectedState connection={connection} canManage={canManage} />
        ) : (
          <DisconnectedState oauthEnabled={oauthEnabled} canManage={canManage} />
        )}
      </div>
    </div>
  );
}

// ─── Bağlı durum ─────────────────────────────────────────────────────────────

function ConnectedState({
  connection,
  canManage,
}: {
  connection: GithubConnectionSummary;
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function verify() {
    startTransition(async () => {
      const res = await verifyGithubConnection();
      if (res.success) {
        toast.success(res.message ?? "Doğrulandı.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        {connection.account_avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- uzak avatar, optimize edilmesine gerek yok
          <img
            src={connection.account_avatar_url}
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 rounded-full border border-slate-200"
          />
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#141821] text-white">
            <GithubMark className="h-5 w-5" />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`https://github.com/${connection.account_login}`}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-[#141821] hover:text-[#5267ff]"
            >
              @{connection.account_login}
            </Link>
            <Badge variant="secondary">
              {connection.auth_type === "oauth" ? "OAuth App" : "Access Token"}
            </Badge>
            {connection.account_type === "Organization" && (
              <Badge variant="outline">Organizasyon</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {connection.account_name ?? "Ad belirtilmemiş"}
            {connection.connected_by_name
              ? ` · ${connection.connected_by_name} tarafından bağlandı`
              : ""}
          </p>
        </div>

        <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Bağlı
        </span>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Kapsamlar</dt>
          <dd className="font-mono text-xs text-[#141821]">
            {connection.scopes.length > 0 ? connection.scopes.join(", ") : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Son Doğrulama</dt>
          <dd className="text-[#141821]">
            {formatDateTime(connection.last_verified_at)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Bağlanma Tarihi</dt>
          <dd className="text-[#141821]">
            {formatDateTime(connection.connected_at)}
          </dd>
        </div>
      </dl>

      <RepoAccessSummary enabled={canManage} />

      {canManage && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={verify} disabled={isPending}>
            {isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-4 w-4" />
            )}
            Bağlantıyı Doğrula
          </Button>
          <ConfirmDialog
            trigger={
              <Button variant="outline" className="text-rose-600 hover:text-rose-700">
                <Unlink className="mr-1 h-4 w-4" />
                Bağlantıyı Kaldır
              </Button>
            }
            title="GitHub Bağlantısını Kaldır"
            description={`@${connection.account_login} hesabının erişimi kaldırılacak. Projelere kayıtlı repo eşleşmeleri silinmez, yalnızca canlı veri çekimi durur.`}
            confirmLabel="Kaldır"
            destructive
            action={disconnectGithub}
          />
        </div>
      )}
    </div>
  );
}

/** Token'ın kaç repoya eriştiğini gösterir — bağlantının çalıştığının kanıtı. */
function RepoAccessSummary({ enabled }: { enabled: boolean }) {
  const [state, setState] = useState<
    { status: "loading" } | { status: "ok"; count: number } | { status: "error"; message: string }
  >({ status: "loading" });

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    fetchGithubRepos().then((res) => {
      if (!active) return;
      setState(
        res.success
          ? { status: "ok", count: res.data.length }
          : { status: "error", message: res.error }
      );
    });
    return () => {
      active = false;
    };
  }, [enabled]);

  if (!enabled) return null;

  if (state.status === "loading") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Erişilebilir repolar okunuyor…
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        {state.message}
      </p>
    );
  }

  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <FolderGit2 className="h-4 w-4 text-[#5267ff]" />
      <span className="font-semibold text-[#141821]">{state.count}</span>
      repoya erişim var. Proje formunda hızlı seçim listesinde görünürler.
    </p>
  );
}

// ─── Bağlı olmayan durum ─────────────────────────────────────────────────────

function DisconnectedState({
  oauthEnabled,
  canManage,
}: {
  oauthEnabled: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  if (!canManage) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-muted-foreground">
        Bu çalışma alanında GitHub bağlantısı kurulmamış. Bağlantıyı yalnızca
        çalışma alanı sahibi (Owner) kurabilir.
      </p>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    startTransition(async () => {
      const res = await connectGithubWithToken({ token });
      if (res.success) {
        toast.success(res.message ?? "Bağlandı.");
        setToken("");
        router.refresh();
      } else {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      {oauthEnabled ? (
        <Button asChild className="bg-[#141821] hover:bg-[#2a2f3d]">
          <a href="/api/github/connect">
            <GithubMark className="mr-2 h-4 w-4" />
            GitHub ile Bağlan
          </a>
        </Button>
      ) : (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
          OAuth ile tek tıkla bağlanmak için ortam değişkenlerine{" "}
          <code className="font-mono">GITHUB_CLIENT_ID</code> ve{" "}
          <code className="font-mono">GITHUB_CLIENT_SECRET</code> tanımlayın.
          Bu değerler olmadan yalnızca token ile bağlanılır.
        </p>
      )}

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-xs font-semibold uppercase text-muted-foreground">
          {oauthEnabled ? "veya" : "Token ile bağlan"}
        </span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <form onSubmit={submit} className="space-y-3">
        <Field
          label="Personal Access Token"
          error={errors.token}
          hint="Gerekli kapsamlar: repo (özel repolar için) ve read:org. Token şifrelenerek saklanır, hiçbir ekranda tekrar gösterilmez."
          required
        >
          <Input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ghp_… veya github_pat_…"
            autoComplete="off"
            required
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            disabled={isPending}
            className="bg-[#5267ff] hover:bg-[#4254e1]"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Bağla
          </Button>
          <Link
            href={NEW_TOKEN_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-sm text-[#5267ff] hover:underline"
          >
            Token oluştur
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </form>
    </div>
  );
}
