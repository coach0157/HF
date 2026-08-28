-- AlterTable
ALTER TABLE "announcements" ADD COLUMN     "target_zone" TEXT;

-- CreateTable
CREATE TABLE "announcement_targets" (
    "id" UUID NOT NULL,
    "village_id" UUID NOT NULL,
    "announcement_id" UUID NOT NULL,
    "house_id" UUID NOT NULL,

    CONSTRAINT "announcement_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "village_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "village_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" UUID,
    "metadata" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "announcement_targets_village_id_idx" ON "announcement_targets"("village_id");

-- CreateIndex
CREATE UNIQUE INDEX "announcement_targets_announcement_id_house_id_key" ON "announcement_targets"("announcement_id", "house_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_village_id_user_id_idx" ON "refresh_tokens"("village_id", "user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_hash_idx" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "audit_logs_village_id_created_at_idx" ON "audit_logs"("village_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_village_id_resource_type_resource_id_idx" ON "audit_logs"("village_id", "resource_type", "resource_id");

-- AddForeignKey
ALTER TABLE "announcement_targets" ADD CONSTRAINT "announcement_targets_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_targets" ADD CONSTRAINT "announcement_targets_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_village_id_fkey" FOREIGN KEY ("village_id") REFERENCES "villages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_village_id_fkey" FOREIGN KEY ("village_id") REFERENCES "villages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security for the three tables introduced by this migration.
-- Mirrors apps/backend/prisma/sql/rls-policies.sql (kept in sync there as
-- the source of truth for a fresh-database bootstrap) — see
-- docs/ARCHITECTURE.md for the full pattern explanation. `audit_logs` was
-- defined in schema.prisma by SA but never actually migrated or RLS-enabled
-- until this migration; `refresh_tokens` and `announcement_targets` are new
-- Dev-agent schema additions (Epic 1 refresh-token storage, Epic 3
-- HOUSE-scope announcement targeting).
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['announcement_targets', 'refresh_tokens', 'audit_logs']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);

    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (village_id = current_setting(''app.current_village_id'', true)::uuid)
         WITH CHECK (village_id = current_setting(''app.current_village_id'', true)::uuid);',
      t
    );
  END LOOP;
END $$;
