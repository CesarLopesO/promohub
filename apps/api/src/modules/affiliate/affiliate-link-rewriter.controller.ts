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
import { DebugMercadoLivreSocialDto } from "./dto/debug-mercadolivre-social.dto";
import { TestAmazonLinkDto } from "./dto/test-amazon-link.dto";

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
      ...(result.attemptedPayloadUrl
        ? { attemptedPayloadUrl: result.attemptedPayloadUrl }
        : {}),
      ...(result.itemId ? { itemId: result.itemId } : {}),
      ...(result.originalItemId
        ? { originalItemId: result.originalItemId }
        : {}),
      ...(result.generatedItemId
        ? { generatedItemId: result.generatedItemId }
        : {}),
      sameProduct: result.sameProduct ?? false,
      canForward: result.canForward ?? false,
      ...(result.originProductUrl
        ? { originProductUrl: result.originProductUrl }
        : {}),
      ...(result.mainProductUrl
        ? { mainProductUrl: result.mainProductUrl }
        : {}),
      ...(result.mainProductSource
        ? { mainProductSource: result.mainProductSource }
        : {}),
      ...(result.mainProductPath
        ? { mainProductPath: result.mainProductPath }
        : {}),
      ...(result.strategy ? { strategy: result.strategy } : {}),
      ...(result.finalProductUrl
        ? { finalProductUrl: result.finalProductUrl }
        : {}),
      originConfidence: result.originConfidence ?? "none",
      ...(result.generationAttempts
        ? { generationAttempts: result.generationAttempts }
        : {}),
      ...(result.socialDebug ? { socialDebug: result.socialDebug } : {}),
      ...(result.socialCandidates
        ? { socialCandidates: result.socialCandidates }
        : {}),
      candidates: result.candidates ?? result.socialCandidates ?? [],
      ...(result.selectedCandidate
        ? { selectedCandidate: result.selectedCandidate }
        : {}),
      ...(result.score !== undefined ? { score: result.score } : {}),
      candidatesCount: result.candidatesCount ?? result.candidates?.length ?? 0,
      ambiguous: result.ambiguous ?? false,
      ...(result.selectedCandidateReason
        ? { selectedCandidateReason: result.selectedCandidateReason }
        : {}),
      offerKeywords: result.offerKeywords ?? [],
      cacheHit: result.cacheHit ?? false,
      ...(result.matchReason ? { matchReason: result.matchReason } : {}),
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

  @Post("test/amazon")
  async testAmazon(
    @Body() body: TestAmazonLinkDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const result = await this.rewriterService.testAmazonForUser(
      req.user.id,
      body.url,
    );

    return {
      marketplace: Marketplace.AMAZON,
      originalUrl: result.originalUrl,
      resolvedUrl: result.resolvedUrl ?? result.originalUrl,
      affiliateUrl: result.rewrittenUrl,
      tag: result.tag ?? null,
      changed: result.changed,
      reason: result.reason ?? null,
    };
  }

  @Post("debug/mercado-livre-social")
  debugMercadoLivreSocial(
    @Body() body: DebugMercadoLivreSocialDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.rewriterService.debugMercadoLivreSocialForUser(
      req.user.id,
      body.url,
    );
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
      case "MERCADO_LIVRE_ITEM_MISMATCH":
        return {
          message: "O link gerado não corresponde ao produto original.",
        };
      case "MERCADO_LIVRE_PRODUCT_NOT_FOUND":
        return {
          message:
            "Não foi possível identificar com confiança o produto principal da página social.",
        };
      default:
        return {};
    }
  }
}
