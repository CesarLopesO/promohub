import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AppController } from "./app.controller";
import { AffiliateModule } from "./modules/affiliate/affiliate.module";
import { MonitoringModule } from "./modules/monitoring/monitoring.module";
import { MessageRoutesModule } from "./modules/routes/message-routes.module";
import { ProductExtractorModule } from "./products/product-extractor.module";
import { PrismaService } from "./prisma.service";
import { WhatsAppSessionModule } from "./whatsapp/whatsapp-session.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["../../.env", ".env"],
    }),
    AffiliateModule,
    MonitoringModule,
    MessageRoutesModule,
    ProductExtractorModule,
    WhatsAppSessionModule,
  ],
  controllers: [AppController],
  providers: [PrismaService],
})
export class AppModule {}
