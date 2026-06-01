import { Module } from "@nestjs/common";

import { PrismaService } from "../../prisma.service";
import { AffiliateCredentialsController } from "./affiliate-credentials.controller";
import { AffiliateCredentialsService } from "./affiliate-credentials.service";
import { AffiliateLinkRewriterController } from "./affiliate-link-rewriter.controller";
import { AffiliateLinkRewriterService } from "./affiliate-link-rewriter.service";

@Module({
  controllers: [AffiliateCredentialsController, AffiliateLinkRewriterController],
  providers: [
    PrismaService,
    AffiliateCredentialsService,
    AffiliateLinkRewriterService,
  ],
  exports: [AffiliateCredentialsService, AffiliateLinkRewriterService],
})
export class AffiliateModule {}
