-- CreateTable
CREATE TABLE "blocked_visitors" (
    "id" UUID NOT NULL,
    "village_id" UUID NOT NULL,
    "phone" TEXT,
    "vehicle_plate" TEXT,
    "reason" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocked_visitors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "blocked_visitors_village_id_phone_idx" ON "blocked_visitors"("village_id", "phone");

-- CreateIndex
CREATE INDEX "blocked_visitors_village_id_vehicle_plate_idx" ON "blocked_visitors"("village_id", "vehicle_plate");

-- AddForeignKey
ALTER TABLE "blocked_visitors" ADD CONSTRAINT "blocked_visitors_village_id_fkey" FOREIGN KEY ("village_id") REFERENCES "villages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_visitors" ADD CONSTRAINT "blocked_visitors_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
