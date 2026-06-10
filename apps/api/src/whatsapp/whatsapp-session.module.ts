import { Module } from "@nestjs/common";

import { AffiliateModule } from "../modules/affiliate/affiliate.module";
import { AuthModule } from "../modules/auth/auth.module";
import { PlansModule } from "../modules/plans/plans.module";
import { MessageForwardingService } from "../modules/routes/message-forwarding.service";
import { SettingsModule } from "../modules/settings/settings.module";
import { WorkerNodesModule } from "../modules/workers/worker-nodes.module";
import { QueueModule } from "../queues/queue.module";
import { PrismaService } from "../prisma.service";
import { BaileysPrismaAuthStore } from "./auth/baileys-prisma-auth.store";
import { WhatsAppGroupDiscoveryService } from "./groups/whatsapp-group-discovery.service";
import { WhatsAppInviteService } from "./invites/whatsapp-invite.service";
import { WhatsAppMessagesController } from "./messages/whatsapp-messages.controller";
import { RoutedGroupsCacheService } from "./messages/routed-groups-cache.service";
import { WhatsAppMessagesService } from "./messages/whatsapp-messages.service";
import { WhatsAppSessionCacheService } from "./session/whatsapp-session-cache.service";
import { WhatsAppSessionManager } from "./session/whatsapp-session.manager";
import {
  WhatsAppSessionController,
  WhatsAppSessionsController,
} from "./whatsapp-session.controller";

@Module({
  imports: [
    AffiliateModule,
    AuthModule,
    PlansModule,
    QueueModule,
    SettingsModule,
    WorkerNodesModule,
  ],
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
    RoutedGroupsCacheService,
    WhatsAppMessagesService,
    WhatsAppSessionCacheService,
    WhatsAppSessionManager,
  ],
  exports: [
    WhatsAppSessionManager,
    WhatsAppInviteService,
    MessageForwardingService,
    RoutedGroupsCacheService,
  ],
})
export class WhatsAppSessionModule {}
