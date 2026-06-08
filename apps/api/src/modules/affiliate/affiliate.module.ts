import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { PrismaService } from "../../prisma.service";
import { AffiliateCredentialsController } from "./affiliate-credentials.controller";
import { AffiliateCredentialsService } from "./affiliate-credentials.service";
import { AffiliateLinkRewriterController } from "./affiliate-link-rewriter.controller";
import { AffiliateLinkRewriterService } from "./affiliate-link-rewriter.service";
import { MercadoLivreAffiliateProvider } from "./providers/mercadolivre.provider";
import { MercadoLivreLinkGeneratorService } from "./services/mercadolivre-link-generator.service";
import { AffiliateGeneratorConfigService } from "./services/affiliate-generator-config.service";

@Module({
  imports: [AuthModule],
  controllers: [AffiliateCredentialsController, AffiliateLinkRewriterController],
  providers: [
    PrismaService,
    AffiliateCredentialsService,
    AffiliateLinkRewriterService,
    AffiliateGeneratorConfigService,
    MercadoLivreAffiliateProvider,
    MercadoLivreLinkGeneratorService,
  ],
  exports: [
    AffiliateCredentialsService,
    AffiliateGeneratorConfigService,
    AffiliateLinkRewriterService,
  ],
})
export class AffiliateModule {}
