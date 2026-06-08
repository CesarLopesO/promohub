import { Body, Controller, Param, Post, Req, UseGuards } from "@nestjs/common";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { Marketplace } from "./helpers/detect-marketplace";
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
import { TestMercadoLivreLinkDto } from "./dto/test-mercadolivre-link.dto";
import { TestMercadoLivreRawDto } from "./dto/test-mercadolivre-raw.dto";

@UseGuards(JwtAuthGuard)
@Controller("affiliate")
export class AffiliateLinkRewriterController {
  constructor(private readonly rewriterService: AffiliateLinkRewriterService) {}

  @Post("rewrite")
  rewrite(
    @Body() body: RewriteAffiliateLinkDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<AffiliateRewriteResult> {
    return this.rewriterService.rewriteUrlForUser(req.user.id, body.url);
  }

  @Post("rewrite/batch")
  rewriteBatch(
    @Body() body: RewriteAffiliateLinksBatchDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<AffiliateRewriteResult[]> {
    return this.rewriterService.rewriteUrlsForUser(req.user.id, body.urls);
  }

  @Post("test/mercado-livre")
  async testMercadoLivre(
    @Body() body: TestMercadoLivreLinkDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const result = await this.rewriterService.testMercadoLivreForUser(
      req.user.id,
      body.url,
    );

    return {
      marketplace: Marketplace.MERCADO_LIVRE,
      mode: result.mode ?? "real",
      originalUrl: result.originalUrl,
      ...(result.resolvedUrl ? { resolvedUrl: result.resolvedUrl } : {}),
      ...(result.itemId ? { itemId: result.itemId } : {}),
      ...(result.changed && result.affiliateUrl
        ? { affiliateUrl: result.affiliateUrl }
        : {}),
      changed: result.changed,
      reason: result.reason ?? null,
      ...(result.warning ? { warning: result.warning } : {}),
      ...this.readMercadoLivreMessage(result.reason),
      ...(result.error &&
      ![
        "MERCADO_LIVRE_GENERATOR_URL_MISSING",
        "MERCADO_LIVRE_SESSION_INVALID",
      ].includes(result.reason ?? "")
        ? { error: result.error }
        : {}),
    };
  }

  @Post("test/raw")
  testRaw(
    @Body() body: TestMercadoLivreRawDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.rewriterService.testMercadoLivreRawForUser(
      req.user.id,
      body.url,
      body.payload,
    );
  }

  @Post("rewrite-message/:messageId")
  rewriteMessage(
    @Param("messageId") messageId: string,
    @Body() _body: RewriteCapturedMessageDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<AffiliateMessageRewritePreview> {
    return this.rewriterService.rewriteMessageForUser(req.user.id, messageId);
  }

  private readMercadoLivreMessage(reason?: string): { message?: string } {
    switch (reason) {
      case "MERCADO_LIVRE_GENERATOR_URL_MISSING":
        return {
          message: "Gerador real do Mercado Livre ainda não configurado.",
        };
      case "MISSING_MERCADO_LIVRE_SESSION":
        return {
          message: "Cadastre seu SSID do Mercado Livre.",
        };
      case "MERCADO_LIVRE_SESSION_INVALID":
        return {
          message:
            "SSID inválido ou expirado. Gere um novo cookie no navegador.",
        };
      case "MERCADO_LIVRE_DISABLED":
        return {
          message: "Geração de links Mercado Livre está desativada.",
        };
      default:
        return {};
    }
  }
}
