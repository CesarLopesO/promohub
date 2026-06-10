import { Module } from "@nestjs/common";

import { WhatsAppCommandProducer } from "./whatsapp-command-producer";

@Module({
  providers: [WhatsAppCommandProducer],
  exports: [WhatsAppCommandProducer],
})
export class QueueModule {}
