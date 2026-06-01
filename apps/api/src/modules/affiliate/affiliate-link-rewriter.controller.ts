import { Body, Controller, Param, Post } from "@nestjs/common";

import {
  AffiliateMessageRewritePreview,
  AffiliateLinkRewriterService,
  AffiliateRewriteResult,
} from "./affiliate-link-rewriter.service";
import {
  RewriteCapturedMessageDto,
  RewriteAffiliateLinkDto,
  RewriteAffiliateLinksBatchDto,
} from "./dto/rewrite-affiliate-link.dto";

@Controller("affiliate")
export class AffiliateLinkRewriterController {
  constructor(private readonly rewriterService: AffiliateLinkRewriterService) {}

  @Post("rewrite")
  rewrite(@Body() body: RewriteAffiliateLinkDto): Promise<AffiliateRewriteResult> {
    return this.rewriterService.rewriteUrlForUser(body.userId, body.url);
  }

  @Post("rewrite/batch")
  rewriteBatch(
    @Body() body: RewriteAffiliateLinksBatchDto,
  ): Promise<AffiliateRewriteResult[]> {
    return this.rewriterService.rewriteUrlsForUser(body.userId, body.urls);
  }

  @Post("rewrite-message/:messageId")
  rewriteMessage(
    @Param("messageId") messageId: string,
    @Body() body: RewriteCapturedMessageDto,
  ): Promise<AffiliateMessageRewritePreview> {
    return this.rewriterService.rewriteMessageForUser(body.userId, messageId);
  }
}
