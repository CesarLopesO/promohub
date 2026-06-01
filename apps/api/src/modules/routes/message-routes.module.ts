import { Module } from "@nestjs/common";

import { AffiliateModule } from "../affiliate/affiliate.module";
import { PrismaService } from "../../prisma.service";
import { WhatsAppSessionModule } from "../../whatsapp/whatsapp-session.module";
import { MessageRoutesController } from "./message-routes.controller";
import { MessageRoutesService } from "./message-routes.service";

@Module({
  imports: [AffiliateModule, WhatsAppSessionModule],
  controllers: [MessageRoutesController],
  providers: [PrismaService, MessageRoutesService],
  exports: [MessageRoutesService],
})
export class MessageRoutesModule {}
