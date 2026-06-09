ALTER TABLE "BillingSubscription"
  ALTER COLUMN "plan" TYPE "Plan" USING ("plan"::"Plan"),
  ALTER COLUMN "status" TYPE "SubscriptionStatus"
    USING ("status"::"SubscriptionStatus"),
  ALTER COLUMN "status" SET DEFAULT 'PENDING',
  ADD COLUMN "currentPeriodStart" TIMESTAMP(3),
  ADD COLUMN "currentPeriodEnd" TIMESTAMP(3),
  ADD COLUMN "canceledAt" TIMESTAMP(3);

CREATE INDEX "BillingSubscription_plan_idx"
  ON "BillingSubscription"("plan");
