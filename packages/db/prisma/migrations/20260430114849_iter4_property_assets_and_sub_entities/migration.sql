-- CreateTable
CREATE TABLE "property_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "custom_alias" TEXT,
    "asset_class_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "managed_by_user_id" UUID,
    "managed_by_company_id" UUID,
    "ownership_type_id" UUID NOT NULL,
    "address_line1" TEXT NOT NULL,
    "address_line2" TEXT,
    "city" TEXT NOT NULL,
    "county" TEXT,
    "post_code" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "property_status_id" UUID NOT NULL,
    "property_purpose_id" UUID NOT NULL,
    "description" TEXT,
    "purchase_date" TIMESTAMP(3),
    "purchase_price" DECIMAL(14,2),
    "is_financed" BOOLEAN,
    "deposit_paid" DECIMAL(14,2),
    "duties_taxes" DECIMAL(14,2),
    "legal_fees" DECIMAL(14,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "property_assets_pkey" PRIMARY KEY ("id")
);

-- Related issue: https://github.com/socx/asset-manager/issues/40
-- Story: ITER-4-005 · Database Schema — Iteration 4

-- CreateTable
CREATE TABLE "valuation_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "asset_id" UUID NOT NULL,
    "valuation_date" TIMESTAMP(3) NOT NULL,
    "valuation_amount" DECIMAL(14,2) NOT NULL,
    "valuation_method" TEXT NOT NULL,
    "valued_by" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "valuation_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mortgage_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "asset_id" UUID NOT NULL,
    "lender" TEXT NOT NULL,
    "product_name" TEXT,
    "mortgage_type_id" UUID NOT NULL,
    "loan_amount" DECIMAL(14,2) NOT NULL,
    "interest_rate" DECIMAL(7,4),
    "term_years" INTEGER,
    "payment_status_id" UUID NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "settled_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mortgage_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shareholding_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "asset_id" UUID NOT NULL,
    "shareholder_name" TEXT NOT NULL,
    "ownership_percent" DECIMAL(5,2) NOT NULL,
    "profit_percent" DECIMAL(5,2) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shareholding_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "asset_id" UUID NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "category_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "property_assets_code_key" ON "property_assets"("code");

-- CreateIndex
CREATE UNIQUE INDEX "property_assets_custom_alias_key" ON "property_assets"("custom_alias");

-- CreateIndex
CREATE INDEX "property_assets_owner_id_idx" ON "property_assets"("owner_id");

-- CreateIndex
CREATE INDEX "property_assets_managed_by_user_id_idx" ON "property_assets"("managed_by_user_id");

-- CreateIndex
CREATE INDEX "property_assets_deleted_at_idx" ON "property_assets"("deleted_at");

-- CreateIndex
CREATE INDEX "property_assets_post_code_idx" ON "property_assets"("post_code");

-- CreateIndex
CREATE INDEX "valuation_entries_asset_id_valuation_date_idx" ON "valuation_entries"("asset_id", "valuation_date");

-- CreateIndex
CREATE INDEX "mortgage_entries_asset_id_settled_at_idx" ON "mortgage_entries"("asset_id", "settled_at");

-- CreateIndex
CREATE INDEX "shareholding_entries_asset_id_idx" ON "shareholding_entries"("asset_id");

-- CreateIndex
CREATE INDEX "transaction_entries_asset_id_date_idx" ON "transaction_entries"("asset_id", "date");

-- AddForeignKey
ALTER TABLE "property_assets" ADD CONSTRAINT "property_assets_asset_class_id_fkey" FOREIGN KEY ("asset_class_id") REFERENCES "lookup_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_assets" ADD CONSTRAINT "property_assets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_assets" ADD CONSTRAINT "property_assets_managed_by_user_id_fkey" FOREIGN KEY ("managed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_assets" ADD CONSTRAINT "property_assets_managed_by_company_id_fkey" FOREIGN KEY ("managed_by_company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_assets" ADD CONSTRAINT "property_assets_ownership_type_id_fkey" FOREIGN KEY ("ownership_type_id") REFERENCES "lookup_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_assets" ADD CONSTRAINT "property_assets_property_status_id_fkey" FOREIGN KEY ("property_status_id") REFERENCES "lookup_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_assets" ADD CONSTRAINT "property_assets_property_purpose_id_fkey" FOREIGN KEY ("property_purpose_id") REFERENCES "lookup_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "valuation_entries" ADD CONSTRAINT "valuation_entries_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "property_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mortgage_entries" ADD CONSTRAINT "mortgage_entries_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "property_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mortgage_entries" ADD CONSTRAINT "mortgage_entries_mortgage_type_id_fkey" FOREIGN KEY ("mortgage_type_id") REFERENCES "lookup_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mortgage_entries" ADD CONSTRAINT "mortgage_entries_payment_status_id_fkey" FOREIGN KEY ("payment_status_id") REFERENCES "lookup_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shareholding_entries" ADD CONSTRAINT "shareholding_entries_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "property_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_entries" ADD CONSTRAINT "transaction_entries_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "property_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_entries" ADD CONSTRAINT "transaction_entries_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "lookup_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
