CREATE TABLE "BillingSubscription" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "plan" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'asaas',
  "providerCustomerId" TEXT,
  "providerSubscriptionId" TEXT,
  "providerPaymentId" TEXT,
  "status" TEXT NOT NULL,
  "checkoutUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BillingSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingWebhookEvent" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BillingWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingWebhookEvent_eventId_key"
  ON "BillingWebhookEvent"("eventId");

CREATE INDEX "BillingSubscription_userId_idx"
  ON "BillingSubscription"("userId");
CREATE INDEX "BillingSubscription_provider_idx"
  ON "BillingSubscription"("provider");
CREATE INDEX "BillingSubscription_status_idx"
  ON "BillingSubscription"("status");
CREATE INDEX "BillingSubscription_providerCustomerId_idx"
  ON "BillingSubscription"("providerCustomerId");
CREATE INDEX "BillingSubscription_providerSubscriptionId_idx"
  ON "BillingSubscription"("providerSubscriptionId");
CREATE INDEX "BillingSubscription_providerPaymentId_idx"
  ON "BillingSubscription"("providerPaymentId");

CREATE INDEX "BillingWebhookEvent_provider_idx"
  ON "BillingWebhookEvent"("provider");
CREATE INDEX "BillingWebhookEvent_eventType_idx"
  ON "BillingWebhookEvent"("eventType");
CREATE INDEX "BillingWebhookEvent_processedAt_idx"
  ON "BillingWebhookEvent"("processedAt");

ALTER TABLE "BillingSubscription"
  ADD CONSTRAINT "BillingSubscription_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
