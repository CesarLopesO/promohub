CREATE TYPE "Plan" AS ENUM ('FREE', 'BASIC', 'PRO');

CREATE TYPE "SubscriptionStatus" AS ENUM (
  'NONE',
  'PENDING',
  'ACTIVE',
  'PAST_DUE',
  'CANCELED'
);

ALTER TABLE "User" ADD COLUMN "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'NONE';

ALTER TABLE "User"
  ALTER COLUMN "plan" DROP DEFAULT,
  ALTER COLUMN "plan" TYPE "Plan" USING (
    CASE
      WHEN "plan" IN ('FREE', 'BASIC', 'PRO') THEN "plan"::"Plan"
      ELSE 'FREE'::"Plan"
    END
  ),
  ALTER COLUMN "plan" SET DEFAULT 'FREE';

CREATE TABLE "Subscription" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "plan" "Plan" NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
  "provider" TEXT,
  "providerSubscriptionId" TEXT,
  "checkoutUrl" TEXT,
  "currentPeriodStart" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");
CREATE INDEX "Subscription_plan_idx" ON "Subscription"("plan");
CREATE INDEX "Subscription_providerSubscriptionId_idx" ON "Subscription"("providerSubscriptionId");

ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
