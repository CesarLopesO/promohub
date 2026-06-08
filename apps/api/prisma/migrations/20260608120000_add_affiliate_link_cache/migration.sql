CREATE TABLE "AffiliateLinkCache" (
    "id" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "resolvedUrl" TEXT,
    "originalUrlHash" TEXT NOT NULL,
    "affiliateUrl" TEXT NOT NULL,
    "itemId" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "AffiliateLinkCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AffiliateLinkCache_originalUrlHash_key"
ON "AffiliateLinkCache"("originalUrlHash");

CREATE INDEX "AffiliateLinkCache_marketplace_idx"
ON "AffiliateLinkCache"("marketplace");

CREATE INDEX "AffiliateLinkCache_expiresAt_idx"
ON "AffiliateLinkCache"("expiresAt");
