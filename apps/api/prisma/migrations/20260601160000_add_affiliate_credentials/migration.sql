ALTER TABLE "WhatsAppMessage" ADD COLUMN "marketplaces" JSONB;

CREATE TABLE "AffiliateCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "affiliateId" TEXT,
    "apiKey" TEXT,
    "apiSecret" TEXT,
    "trackingId" TEXT,
    "metadata" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AffiliateCredential_userId_marketplace_key" ON "AffiliateCredential"("userId", "marketplace");

CREATE INDEX "AffiliateCredential_userId_idx" ON "AffiliateCredential"("userId");

CREATE INDEX "AffiliateCredential_marketplace_idx" ON "AffiliateCredential"("marketplace");
