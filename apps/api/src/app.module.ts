import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AppController } from "./app.controller";
import { AdminModule } from "./modules/admin/admin.module";
import { AffiliateModule } from "./modules/affiliate/affiliate.module";
import { AuthModule } from "./modules/auth/auth.module";
import { BillingModule } from "./modules/billing/billing.module";
import { MonitoringModule } from "./modules/monitoring/monitoring.module";
import { MessageRoutesModule } from "./modules/routes/message-routes.module";
import { ProductExtractorModule } from "./products/product-extractor.module";
import { PrismaService } from "./prisma.service";
import { WhatsAppSessionModule } from "./whatsapp/whatsapp-session.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["apps/api/.env", ".env"],
    }),
    AdminModule,
    AuthModule,
    AffiliateModule,
    BillingModule,
    MonitoringModule,
    MessageRoutesModule,
    ProductExtractorModule,
    WhatsAppSessionModule,
  ],
  controllers: [AppController],
  providers: [PrismaService],
})
export class AppModule {}
