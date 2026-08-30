-- CreateTable
CREATE TABLE "patrol_logs" (
    "id" UUID NOT NULL,
    "village_id" UUID NOT NULL,
    "guard_user_id" UUID NOT NULL,
    "photo_url" TEXT NOT NULL,
    "note" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patrol_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "patrol_logs_village_id_created_at_idx" ON "patrol_logs"("village_id", "created_at");

-- AddForeignKey
ALTER TABLE "patrol_logs" ADD CONSTRAINT "patrol_logs_village_id_fkey" FOREIGN KEY ("village_id") REFERENCES "villages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_logs" ADD CONSTRAINT "patrol_logs_guard_user_id_fkey" FOREIGN KEY ("guard_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
