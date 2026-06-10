CREATE TYPE "ReferralStatus" AS ENUM (
  'PENDING_SIGNUP',
  'PENDING_PAYMENT',
  'PENDING_WAITING_PERIOD',
  'ELIGIBLE',
  'PAID',
  'REJECTED'
);

CREATE TABLE "ReferralCode" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReferralCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Referral" (
  "id" TEXT NOT NULL,
  "referrerUserId" TEXT NOT NULL,
  "referredUserId" TEXT NOT NULL,
  "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "rewardCents" INTEGER NOT NULL DEFAULT 3000,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paymentConfirmedAt" TIMESTAMP(3),
  "eligibleAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "notes" TEXT,

  CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReferralCode_userId_key" ON "ReferralCode"("userId");
CREATE UNIQUE INDEX "ReferralCode_code_key" ON "ReferralCode"("code");
CREATE UNIQUE INDEX "Referral_referredUserId_key" ON "Referral"("referredUserId");
CREATE INDEX "Referral_referrerUserId_idx" ON "Referral"("referrerUserId");
CREATE INDEX "Referral_status_idx" ON "Referral"("status");
CREATE INDEX "Referral_eligibleAt_idx" ON "Referral"("eligibleAt");

ALTER TABLE "ReferralCode"
ADD CONSTRAINT "ReferralCode_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Referral"
ADD CONSTRAINT "Referral_referrerUserId_fkey"
FOREIGN KEY ("referrerUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Referral"
ADD CONSTRAINT "Referral_referredUserId_fkey"
FOREIGN KEY ("referredUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
