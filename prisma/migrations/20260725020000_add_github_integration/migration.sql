-- CreateEnum
CREATE TYPE "GithubAuthType" AS ENUM ('oauth', 'pat');

-- CreateTable
CREATE TABLE "github_connections" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "auth_type" "GithubAuthType" NOT NULL DEFAULT 'pat',
    "access_token" TEXT NOT NULL,
    "scopes" TEXT,
    "account_login" TEXT NOT NULL,
    "account_name" TEXT,
    "account_type" TEXT,
    "account_avatar_url" TEXT,
    "connected_by" UUID,
    "last_verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "github_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "github_connections_workspace_id_key" ON "github_connections"("workspace_id");

-- AddForeignKey
ALTER TABLE "github_connections" ADD CONSTRAINT "github_connections_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_connections" ADD CONSTRAINT "github_connections_connected_by_fkey" FOREIGN KEY ("connected_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "github_repo_id" TEXT,
ADD COLUMN     "github_repo_full_name" TEXT;

-- CreateIndex
CREATE INDEX "projects_workspace_id_github_repo_full_name_idx" ON "projects"("workspace_id", "github_repo_full_name");
