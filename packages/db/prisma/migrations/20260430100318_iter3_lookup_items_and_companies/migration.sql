-- CreateEnum
CREATE TYPE "LookupItemType" AS ENUM ('document_type', 'asset_class', 'transaction_category', 'company_type', 'property_status', 'property_purpose', 'ownership_type', 'mortgage_type', 'mortgage_payment_status');

-- CreateTable
CREATE TABLE "lookup_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "LookupItemType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lookup_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "company_type_id" UUID,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "county" TEXT,
    "post_code" TEXT,
    "country" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lookup_items_type_is_active_sort_order_idx" ON "lookup_items"("type", "is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "lookup_items_type_name_key" ON "lookup_items"("type", "name");

-- CreateIndex
CREATE UNIQUE INDEX "companies_name_key" ON "companies"("name");

-- CreateIndex
CREATE INDEX "companies_is_active_idx" ON "companies"("is_active");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_company_type_id_fkey" FOREIGN KEY ("company_type_id") REFERENCES "lookup_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
