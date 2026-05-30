import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AppController } from "./app.controller";
import { ProductExtractorModule } from "./products/product-extractor.module";
import { PrismaService } from "./prisma.service";
import { WhatsAppSessionModule } from "./whatsapp/whatsapp-session.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["../../.env", ".env"],
    }),
    ProductExtractorModule,
    WhatsAppSessionModule,
  ],
  controllers: [AppController],
  providers: [PrismaService],
})
export class AppModule {}
