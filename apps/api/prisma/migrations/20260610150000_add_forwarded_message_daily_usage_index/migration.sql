CREATE INDEX "ForwardedMessage_userId_status_sentAt_idx"
ON "ForwardedMessage"("userId", "status", "sentAt");
