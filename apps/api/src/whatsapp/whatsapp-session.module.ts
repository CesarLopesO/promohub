import { Module } from "@nestjs/common";

import { AffiliateModule } from "../modules/affiliate/affiliate.module";
import { MessageForwardingService } from "../modules/routes/message-forwarding.service";
import { PrismaService } from "../prisma.service";
import { BaileysPrismaAuthStore } from "./auth/baileys-prisma-auth.store";
import { WhatsAppGroupDiscoveryService } from "./groups/whatsapp-group-discovery.service";
import { WhatsAppMessagesController } from "./messages/whatsapp-messages.controller";
import { WhatsAppMessagesService } from "./messages/whatsapp-messages.service";
import { WhatsAppSessionCacheService } from "./session/whatsapp-session-cache.service";
import { WhatsAppSessionManager } from "./session/whatsapp-session.manager";
import { WhatsAppSessionController } from "./whatsapp-session.controller";

@Module({
  imports: [AffiliateModule],
  controllers: [WhatsAppSessionController, WhatsAppMessagesController],
  providers: [
    PrismaService,
    BaileysPrismaAuthStore,
    WhatsAppGroupDiscoveryService,
    MessageForwardingService,
    WhatsAppMessagesService,
    WhatsAppSessionCacheService,
    WhatsAppSessionManager,
  ],
  exports: [WhatsAppSessionManager, MessageForwardingService],
})
export class WhatsAppSessionModule {}
