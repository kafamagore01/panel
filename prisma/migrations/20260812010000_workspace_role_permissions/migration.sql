CREATE TABLE "workspace_role_permissions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "permissions" JSONB NOT NULL,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_role_permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_role_permissions_workspace_id_role_key"
ON "workspace_role_permissions"("workspace_id", "role");

CREATE INDEX "workspace_role_permissions_workspace_id_idx"
ON "workspace_role_permissions"("workspace_id");

CREATE INDEX "workspace_role_permissions_updated_by_user_id_idx"
ON "workspace_role_permissions"("updated_by_user_id");

ALTER TABLE "workspace_role_permissions"
ADD CONSTRAINT "workspace_role_permissions_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workspace_role_permissions"
ADD CONSTRAINT "workspace_role_permissions_updated_by_user_id_fkey"
FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
