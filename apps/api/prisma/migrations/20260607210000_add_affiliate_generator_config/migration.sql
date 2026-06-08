CREATE TABLE "AffiliateGeneratorConfig" (
    "id" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "headers" JSONB,
    "bodyTemplate" JSONB,
    "responsePath" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateGeneratorConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AffiliateGeneratorConfig_marketplace_key"
ON "AffiliateGeneratorConfig"("marketplace");

CREATE INDEX "AffiliateGeneratorConfig_isActive_idx"
ON "AffiliateGeneratorConfig"("isActive");
