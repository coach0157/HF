-- CreateEnum
CREATE TYPE "maintenance_category" AS ENUM ('electrical', 'plumbing', 'road', 'other');

-- CreateEnum
CREATE TYPE "transport_provider_type" AS ENUM ('motorcycle', 'taxi', 'van', 'other');

-- AlterTable
ALTER TABLE "chat_participants" ADD COLUMN     "last_read_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "chat_rooms" ADD COLUMN     "residents_can_post" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "maintenance_tickets" ADD COLUMN     "ticket_number" TEXT NOT NULL,
DROP COLUMN "category",
ADD COLUMN     "category" "maintenance_category" NOT NULL;

-- CreateTable
CREATE TABLE "maintenance_ticket_counters" (
    "village_id" UUID NOT NULL,
    "last_seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "maintenance_ticket_counters_pkey" PRIMARY KEY ("village_id")
);

-- CreateTable
CREATE TABLE "transport_providers" (
    "id" UUID NOT NULL,
    "village_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "transport_provider_type" NOT NULL,
    "phone" TEXT NOT NULL,
    "service_area" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transport_providers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transport_providers_village_id_is_active_idx" ON "transport_providers"("village_id", "is_active");

-- CreateIndex
CREATE INDEX "transport_providers_village_id_type_idx" ON "transport_providers"("village_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_tickets_village_id_ticket_number_key" ON "maintenance_tickets"("village_id", "ticket_number");

-- AddForeignKey
ALTER TABLE "maintenance_ticket_counters" ADD CONSTRAINT "maintenance_ticket_counters_village_id_fkey" FOREIGN KEY ("village_id") REFERENCES "villages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_providers" ADD CONSTRAINT "transport_providers_village_id_fkey" FOREIGN KEY ("village_id") REFERENCES "villages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

