import { Module } from "@nestjs/common";

import { PrismaService } from "../prisma.service";
import { BaileysPrismaAuthStore } from "./auth/baileys-prisma-auth.store";
import { WhatsAppSessionCacheService } from "./session/whatsapp-session-cache.service";
import { WhatsAppSessionManager } from "./session/whatsapp-session.manager";
import { WhatsAppSessionController } from "./whatsapp-session.controller";

@Module({
  controllers: [WhatsAppSessionController],
  providers: [
    PrismaService,
    BaileysPrismaAuthStore,
    WhatsAppSessionCacheService,
    WhatsAppSessionManager,
  ],
  exports: [WhatsAppSessionManager],
})
export class WhatsAppSessionModule {}
