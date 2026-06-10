import { Module } from "@nestjs/common";

import { AffiliateModule } from "../affiliate/affiliate.module";
import { AuthModule } from "../auth/auth.module";
import { PlansModule } from "../plans/plans.module";
import { PrismaService } from "../../prisma.service";
import { WhatsAppSessionModule } from "../../whatsapp/whatsapp-session.module";
import { MessageRoutesController } from "./message-routes.controller";
import { MessageRoutesService } from "./message-routes.service";
import { SettingsModule } from "../settings/settings.module";

@Module({
  imports: [
    AffiliateModule,
    AuthModule,
    PlansModule,
    SettingsModule,
    WhatsAppSessionModule,
  ],
  controllers: [MessageRoutesController],
  providers: [PrismaService, MessageRoutesService],
  exports: [MessageRoutesService],
})
export class MessageRoutesModule {}
