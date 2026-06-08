import { Module } from "@nestjs/common";

import { AffiliateModule } from "../modules/affiliate/affiliate.module";
import { AuthModule } from "../modules/auth/auth.module";
import { PlansModule } from "../modules/plans/plans.module";
import { MessageForwardingService } from "../modules/routes/message-forwarding.service";
import { PrismaService } from "../prisma.service";
import { BaileysPrismaAuthStore } from "./auth/baileys-prisma-auth.store";
import { WhatsAppGroupDiscoveryService } from "./groups/whatsapp-group-discovery.service";
import { WhatsAppInviteService } from "./invites/whatsapp-invite.service";
import { WhatsAppMessagesController } from "./messages/whatsapp-messages.controller";
import { WhatsAppMessagesService } from "./messages/whatsapp-messages.service";
import { WhatsAppSessionCacheService } from "./session/whatsapp-session-cache.service";
import { WhatsAppSessionManager } from "./session/whatsapp-session.manager";
import {
  WhatsAppSessionController,
  WhatsAppSessionsController,
} from "./whatsapp-session.controller";

@Module({
  imports: [AffiliateModule, AuthModule, PlansModule],
  controllers: [
    WhatsAppSessionController,
    WhatsAppSessionsController,
    WhatsAppMessagesController,
  ],
  providers: [
    PrismaService,
    BaileysPrismaAuthStore,
    WhatsAppGroupDiscoveryService,
    WhatsAppInviteService,
    MessageForwardingService,
    WhatsAppMessagesService,
    WhatsAppSessionCacheService,
    WhatsAppSessionManager,
  ],
  exports: [
    WhatsAppSessionManager,
    WhatsAppInviteService,
    MessageForwardingService,
  ],
})
export class WhatsAppSessionModule {}
