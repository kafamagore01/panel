import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { getEffectivePermissions, hasPermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/page-header";
import { formatDateTime } from "@/lib/format";
import { getGithubAppVersion } from "@/lib/github/repos";
import { Package, GitBranch, GitCommitHorizontal, Clock } from "lucide-react";

export const metadata = { title: "Sistem Özellikleri · Operasyon Merkezi" };

export default async function SystemUpdatePage() {
  const ctx = await getAuthContext();
  if (!ctx?.workspaceId || !ctx.role) redirect("/yetkisiz");
  const permissions = await getEffectivePermissions(ctx.workspaceId, ctx.role);
  if (!hasPermission(ctx.role, "system.view", permissions)) {
    redirect("/yetkisiz");
  }

  // Deployment bilgileri build sırasında sabitlenir; ortak sürüm GitHub'dan canlı okunur.
  const deployedVersion = process.env.APP_VERSION ?? "0.0.0";
  const commitSha = process.env.APP_COMMIT_SHA ?? "";
  const commitRef = process.env.APP_COMMIT_REF ?? "";
  const buildTime = process.env.APP_BUILD_TIME ?? "";
  const repoFullName = process.env.APP_REPO_FULL_NAME ?? "";
  const repoUrl = process.env.APP_REPO_URL ?? "";
  const githubVersion = repoFullName
    ? await getGithubAppVersion(
        ctx.workspaceId,
        repoFullName,
        deployedVersion
      ).catch((error) => {
        console.error("GitHub uygulama sürümü okunamadı:", error);
        return null;
      })
    : null;
  const version = githubVersion?.version ?? deployedVersion;

  const shortSha = commitSha ? commitSha.slice(0, 7) : "—";
  const commitLabel = commitRef ? `${shortSha} · ${commitRef}` : shortSha;

  return (
    <div className="space-y-6">
      <PageHeader title="Sistem Özellikleri" description="Sürüm bilgisi ve çalışma ortamı." />

      <div className="grid gap-4 sm:grid-cols-2">
        <InfoCard
          icon={<Package className="h-5 w-5" />}
          iconClass="bg-[#5267ff]/10 text-[#5267ff]"
          label="GitHub Sürümü"
          value={
            githubVersion ? (
              <a
                href={`${githubVersion.html_url}/commits/${githubVersion.branch}`}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-dotted underline-offset-4 hover:text-[#5267ff]"
                title={`${githubVersion.branch} dalında ${githubVersion.commit_count} commit`}
              >
                v{version}
              </a>
            ) : (
              `v${version}`
            )
          }
          hint={githubVersion ? "GitHub’dan canlı" : "Derleme sürümü (GitHub erişimi yok)"}
        />

        <InfoCard
          icon={<GitCommitHorizontal className="h-5 w-5" />}
          iconClass="bg-amber-50 text-amber-600"
          label="Dağıtılan Sürüm"
          value={
            commitSha && repoUrl ? (
              <a
                href={`${repoUrl}/commit/${commitSha}`}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-dotted underline-offset-4 hover:text-[#5267ff]"
              >
                {commitLabel}
              </a>
            ) : (
              commitLabel
            )
          }
        />

        <InfoCard
          icon={<Clock className="h-5 w-5" />}
          iconClass="bg-violet-50 text-violet-600"
          label="Son Derleme"
          value={buildTime ? formatDateTime(buildTime) : "—"}
        />

        <InfoCard
          icon={<GitBranch className="h-5 w-5" />}
          iconClass="bg-emerald-50 text-emerald-600"
          label="Çalışma Ortamı"
          value={`Node ${process.version}`}
        />
      </div>
    </div>
  );
}

function InfoCard({
  icon,
  iconClass,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  iconClass: string;
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-[22px] border border-slate-200/80 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconClass}`}>{icon}</span>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="truncate text-xl font-extrabold text-[#141821]">{value}</p>
          {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
      </div>
    </div>
  );
}
