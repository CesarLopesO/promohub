CREATE TABLE "PlanPriceOverride" (
  "plan" TEXT NOT NULL,
  "priceCents" INTEGER NOT NULL,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PlanPriceOverride_pkey" PRIMARY KEY ("plan")
);
