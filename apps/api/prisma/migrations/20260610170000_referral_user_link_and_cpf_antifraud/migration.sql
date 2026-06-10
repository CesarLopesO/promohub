ALTER TYPE "ReferralStatus" ADD VALUE 'NEEDS_REVIEW';

ALTER TABLE "User"
ADD COLUMN "cpfCnpjHash" TEXT,
ADD COLUMN "referredByUserId" TEXT;

ALTER TABLE "Referral"
ADD COLUMN "antifraudReason" TEXT;

UPDATE "User" AS referred
SET "referredByUserId" = referral."referrerUserId"
FROM "Referral" AS referral
WHERE referral."referredUserId" = referred."id"
  AND referral."referrerUserId" <> referred."id"
  AND referred."referredByUserId" IS NULL;

UPDATE "User"
SET "cpfCnpj" = CASE
  WHEN length(regexp_replace("cpfCnpj", '\D', '', 'g')) = 11
    THEN '***.***.***-' || right(regexp_replace("cpfCnpj", '\D', '', 'g'), 2)
  WHEN length(regexp_replace("cpfCnpj", '\D', '', 'g')) = 14
    THEN '**.***.***/****-' || right(regexp_replace("cpfCnpj", '\D', '', 'g'), 2)
  ELSE NULL
END
WHERE "cpfCnpj" IS NOT NULL;

CREATE INDEX "User_referredByUserId_idx" ON "User"("referredByUserId");
CREATE INDEX "User_cpfCnpjHash_idx" ON "User"("cpfCnpjHash");

ALTER TABLE "User"
ADD CONSTRAINT "User_referredByUserId_fkey"
FOREIGN KEY ("referredByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
