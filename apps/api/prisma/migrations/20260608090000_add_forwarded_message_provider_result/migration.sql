ALTER TABLE "ForwardedMessage" ADD COLUMN "sentProviderMessageId" TEXT;

ALTER TABLE "ForwardedMessage" ADD COLUMN "sentProviderRaw" JSONB;
