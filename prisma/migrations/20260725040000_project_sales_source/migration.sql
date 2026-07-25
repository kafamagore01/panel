-- AlterTable
ALTER TABLE "projects" ADD COLUMN "source_project_id" UUID;

-- CreateIndex
CREATE INDEX "projects_source_project_id_idx" ON "projects"("source_project_id");

-- AddForeignKey
ALTER TABLE "projects"
ADD CONSTRAINT "projects_source_project_id_fkey"
FOREIGN KEY ("source_project_id") REFERENCES "projects"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
