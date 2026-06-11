CREATE TYPE "BillingPaymentMethod" AS ENUM (
  'FLEXIBLE',
  'CREDIT_CARD_RECURRING'
);

ALTER TABLE "BillingSubscription"
ADD COLUMN "paymentMethod" "BillingPaymentMethod" NOT NULL DEFAULT 'FLEXIBLE';
