ALTER TABLE "ForwardedMessage"
ADD COLUMN "reason" TEXT;

CREATE INDEX "ForwardedMessage_reason_idx"
ON "ForwardedMessage"("reason");
