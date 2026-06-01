ALTER TABLE "ForwardedMessage" ADD COLUMN "sentMessageType" TEXT;

ALTER TABLE "ForwardedMessage" ADD COLUMN "mediaForwarded" BOOLEAN NOT NULL DEFAULT false;
