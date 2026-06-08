import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AffiliateLinkRewriterController } from "./affiliate-link-rewriter.controller";
import { Marketplace } from "./helpers/detect-marketplace";

describe("AffiliateLinkRewriterController", () => {
  it("returns Amazon test diagnostics", async () => {
    const controller = new AffiliateLinkRewriterController({
      testAmazonForUser: async () => ({
        originalUrl:
          "https://www.amazon.com.br/dp/6555165766?&ref_=as_li_ss_tl",
        rewrittenUrl:
          "https://www.amazon.com.br/dp/6555165766?ref_=as_li_ss_tl&tag=descontai770f-20",
        marketplace: Marketplace.AMAZON,
        resolvedUrl:
          "https://www.amazon.com.br/dp/6555165766?&ref_=as_li_ss_tl",
        tag: "descontai770f-20",
        changed: true,
        canForward: true,
      }),
    } as never);

    assert.deepEqual(
      await controller.testAmazon(
        {
          url: "https://www.amazon.com.br/dp/6555165766?&ref_=as_li_ss_tl",
        },
        { user: { id: "test-user" } } as never,
      ),
      {
        marketplace: Marketplace.AMAZON,
        originalUrl:
          "https://www.amazon.com.br/dp/6555165766?&ref_=as_li_ss_tl",
        resolvedUrl:
          "https://www.amazon.com.br/dp/6555165766?&ref_=as_li_ss_tl",
        affiliateUrl:
          "https://www.amazon.com.br/dp/6555165766?ref_=as_li_ss_tl&tag=descontai770f-20",
        tag: "descontai770f-20",
        changed: true,
        reason: null,
      },
    );
  });

  it("returns Mercado Livre social diagnostics", async () => {
    const controller = new AffiliateLinkRewriterController({
      debugMercadoLivreSocialForUser: async () => ({
        resolvedUrl:
          "https://www.mercadolivre.com.br/social/creator/lists/list-id",
        generationAttempts: [
          {
            url: "https://www.mercadolivre.com.br/social/creator/lists/list-id",
            success: false,
            status: 400,
          },
        ],
        candidates: [
          {
            source: "canonical" as const,
            url: "https://produto.mercadolivre.com.br/MLB-123456789-produto-_JM",
            itemId: "MLB123456789",
            score: 40,
          },
        ],
      }),
    } as never);

    const result = await controller.debugMercadoLivreSocial(
      { url: "https://meli.la/social" },
      { user: { id: "test-user" } } as never,
    );

    assert.equal(result.generationAttempts[0]?.status, 400);
    assert.equal(result.candidates[0]?.itemId, "MLB123456789");
  });

  it("returns the Mercado Livre test result without session credentials", async () => {
    const controller = new AffiliateLinkRewriterController({
      testMercadoLivreForUser: async () => ({
        marketplace: Marketplace.MERCADO_LIVRE,
        originalUrl: "https://meli.la/2BCJSYh",
        rewrittenUrl: "https://meli.la/affiliate-real",
        resolvedUrl:
          "https://produto.mercadolivre.com.br/MLB-123456789-produto",
        itemId: "MLB123456789",
        originalItemId: "MLB123456789",
        strategy: "pdp_filters_item_id" as const,
        generatedItemId: "MLB123456789",
        sameProduct: true,
        canForward: true,
        affiliateUrl: "https://meli.la/affiliate-real",
        changed: true,
      }),
    } as never);
    const result = await controller.testMercadoLivre(
      { url: "https://meli.la/2BCJSYh" },
      { user: { id: "test-user" } } as never,
    );

    assert.deepEqual(result, {
      marketplace: "mercado_livre",
      mode: "real",
      originalUrl: "https://meli.la/2BCJSYh",
      resolvedUrl: "https://produto.mercadolivre.com.br/MLB-123456789-produto",
      itemId: "MLB123456789",
      originalItemId: "MLB123456789",
      strategy: "pdp_filters_item_id",
      generatedItemId: "MLB123456789",
      sameProduct: true,
      canForward: true,
      cacheHit: false,
      candidates: [],
      candidatesCount: 0,
      ambiguous: false,
      offerKeywords: [],
      affiliateUrl: "https://meli.la/affiliate-real",
      changed: true,
      originConfidence: "none",
      reason: null,
    });
    assert.equal(JSON.stringify(result).includes("ssid"), false);
    assert.equal(JSON.stringify(result).includes("sessionToken"), false);
  });

  it("returns an actionable message when the generator URL is missing", async () => {
    const controller = new AffiliateLinkRewriterController({
      testMercadoLivreForUser: async () => ({
        marketplace: Marketplace.MERCADO_LIVRE,
        originalUrl: "https://meli.la/2BCJSYh",
        rewrittenUrl: "https://meli.la/2BCJSYh",
        changed: false,
        mode: "real",
        reason: "MERCADO_LIVRE_GENERATOR_URL_MISSING",
        error: "MERCADO_LIVRE_GENERATOR_URL_MISSING",
      }),
    } as never);

    assert.deepEqual(
      await controller.testMercadoLivre({ url: "https://meli.la/2BCJSYh" }, {
        user: { id: "test-user" },
      } as never),
      {
        marketplace: "mercado_livre",
        mode: "real",
        originalUrl: "https://meli.la/2BCJSYh",
        sameProduct: false,
        canForward: false,
        cacheHit: false,
        candidates: [],
        candidatesCount: 0,
        ambiguous: false,
        offerKeywords: [],
        changed: false,
        originConfidence: "none",
        reason: "MERCADO_LIVRE_GENERATOR_URL_MISSING",
        message: "Gerador real do Mercado Livre ainda não configurado.",
      },
    );
  });

  it("returns ranked social candidate diagnostics", async () => {
    const candidate = {
      source: "cta" as const,
      url: "https://produto.mercadolivre.com.br/MLB-123456789-produto-_JM",
      itemId: "MLB123456789",
      score: 100,
      title: "Produto principal",
    };
    const controller = new AffiliateLinkRewriterController({
      testMercadoLivreForUser: async () => ({
        marketplace: Marketplace.MERCADO_LIVRE,
        originalUrl: "https://meli.la/social",
        rewrittenUrl: "https://meli.la/new",
        resolvedUrl:
          "https://www.mercadolivre.com.br/social/creator/lists/list-id",
        originProductUrl:
          "https://produto.mercadolivre.com.br/MLB-123456789-produto-_JM",
        socialCandidates: [candidate],
        selectedCandidate: candidate,
        originalItemId: "MLB123456789",
        generatedItemId: "MLB123456789",
        sameProduct: true,
        canForward: true,
        affiliateUrl: "https://meli.la/new",
        changed: true,
      }),
    } as never);

    const result = await controller.testMercadoLivre(
      { url: "https://meli.la/social" },
      { user: { id: "test-user" } } as never,
    );

    assert.equal(result.selectedCandidate?.score, 100);
    assert.equal(result.socialCandidates?.[0]?.source, "cta");
    assert.equal(
      result.originProductUrl,
      "https://produto.mercadolivre.com.br/MLB-123456789-produto-_JM",
    );
  });

  it("returns legacy mode and its commission warning", async () => {
    const controller = new AffiliateLinkRewriterController({
      testMercadoLivreForUser: async () => ({
        marketplace: Marketplace.MERCADO_LIVRE,
        mode: "legacy",
        originalUrl: "https://meli.la/2BCJSYh",
        rewrittenUrl: "https://meli.la/2BCJSYh?aff_id=loce6396673",
        affiliateUrl: "https://meli.la/2BCJSYh?aff_id=loce6396673",
        changed: true,
        warning: "Modo legado não garante comissão.",
      }),
    } as never);

    const result = await controller.testMercadoLivre(
      { url: "https://meli.la/2BCJSYh" },
      { user: { id: "test-user" } } as never,
    );

    assert.equal(result.mode, "legacy");
    assert.equal(result.changed, true);
    assert.equal(result.warning, "Modo legado não garante comissão.");
  });

  it("forwards the authenticated user to the raw diagnostic service", async () => {
    let receivedUserId = "";
    let receivedUrl = "";
    const controller = new AffiliateLinkRewriterController({
      testMercadoLivreRawForUser: async (
        userId: string,
        url: string,
        payload: unknown,
      ) => {
        receivedUserId = userId;
        receivedUrl = url;
        assert.deepEqual(payload, { url: "custom" });

        return {
          status: 200,
          requestHeaders: {},
          requestBody: payload,
          responseHeaders: { "content-type": "application/json" },
          body: { shortUrl: "https://meli.la/generated" },
        };
      },
    } as never);

    const result = await controller.testRaw(
      {
        url: "https://meli.la/2BCJSYh",
        payload: { url: "custom" },
      },
      { user: { id: "test-user" } } as never,
    );

    assert.equal(receivedUserId, "test-user");
    assert.equal(receivedUrl, "https://meli.la/2BCJSYh");
    assert.equal(result.status, 200);
  });
});
