import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AffiliateLinkRewriterController } from "./affiliate-link-rewriter.controller";
import { Marketplace } from "./helpers/detect-marketplace";

describe("AffiliateLinkRewriterController", () => {
  it("returns the Mercado Livre test result without session credentials", async () => {
    const controller = new AffiliateLinkRewriterController({
      testMercadoLivreForUser: async () => ({
        marketplace: Marketplace.MERCADO_LIVRE,
        originalUrl: "https://meli.la/2BCJSYh",
        rewrittenUrl: "https://meli.la/affiliate-real",
        resolvedUrl:
          "https://produto.mercadolivre.com.br/MLB-123456789-produto",
        itemId: "MLB123456789",
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
      resolvedUrl:
        "https://produto.mercadolivre.com.br/MLB-123456789-produto",
      itemId: "MLB123456789",
      affiliateUrl: "https://meli.la/affiliate-real",
      changed: true,
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
      await controller.testMercadoLivre(
        { url: "https://meli.la/2BCJSYh" },
        { user: { id: "test-user" } } as never,
      ),
      {
        marketplace: "mercado_livre",
        mode: "real",
        originalUrl: "https://meli.la/2BCJSYh",
        changed: false,
        reason: "MERCADO_LIVRE_GENERATOR_URL_MISSING",
        message: "Gerador real do Mercado Livre ainda não configurado.",
      },
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
