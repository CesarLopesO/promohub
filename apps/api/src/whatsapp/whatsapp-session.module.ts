import { Module } from "@nestjs/common";

import { PrismaService } from "../prisma.service";
import { BaileysPrismaAuthStore } from "./auth/baileys-prisma-auth.store";
import { WhatsAppGroupDiscoveryService } from "./groups/whatsapp-group-discovery.service";
import { WhatsAppSessionCacheService } from "./session/whatsapp-session-cache.service";
import { WhatsAppSessionManager } from "./session/whatsapp-session.manager";
import { WhatsAppSessionController } from "./whatsapp-session.controller";

@Module({
  controllers: [WhatsAppSessionController],
  providers: [
    PrismaService,
    BaileysPrismaAuthStore,
    WhatsAppGroupDiscoveryService,
    WhatsAppSessionCacheService,
    WhatsAppSessionManager,
  ],
  exports: [WhatsAppSessionManager],
})
export class WhatsAppSessionModule {}
