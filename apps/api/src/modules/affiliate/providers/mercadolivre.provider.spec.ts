import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { ConfigService } from "@nestjs/config";
import type { AffiliateCredential } from "@prisma/client";
import axios from "axios";

import { MercadoLivreLinkGeneratorService } from "../services/mercadolivre-link-generator.service";
import { MercadoLivreAffiliateProvider } from "./mercadolivre.provider";

const originalFetch = globalThis.fetch;
const originalPost = axios.post;
const originalGet = axios.get;

function makeCredential(metadata: object | null): AffiliateCredential {
  return {
    id: "ml-credential",
    userId: "test-user",
    marketplace: "mercado_livre",
    affiliateId: "loce6396673",
    trackingId: null,
    storeSlug: null,
    apiKey: null,
    apiSecret: null,
    metadata,
    isActive: true,
    createdAt: new Date("2026-06-01T12:00:00.000Z"),
    updatedAt: new Date("2026-06-01T12:00:00.000Z"),
  };
}

function makeProvider(generatorUrl?: string) {
  const config = new ConfigService({
    MERCADO_LIVRE_AFFILIATE_GENERATOR_URL: generatorUrl,
  });

  return new MercadoLivreAffiliateProvider(
    new MercadoLivreLinkGeneratorService(config),
  );
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  axios.post = originalPost;
  axios.get = originalGet;
  delete process.env.MERCADO_LIVRE_MODE;
});

describe("MercadoLivreAffiliateProvider", () => {
  it("resolves meli.la redirects and extracts the item id", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), init });

      if (init?.method === "HEAD") {
        const response = new Response(null, {
          status: 200,
          headers: {},
        });
        Object.defineProperty(response, "url", {
          value: "https://produto.mercadolivre.com.br/MLB-123456789-produto",
        });

        return response;
      }

      return new Response(null, { status: 200 });
    };
    let generatorBody: unknown;
    axios.post = (async (_url, body, config) => {
      generatorBody = body;

      return {
        status: 200,
        statusText: "OK",
        config: config as never,
        headers: {},
        data: { short_url: "https://meli.la/affiliate-real" },
      };
    }) as typeof axios.post;
    const provider = makeProvider("https://generator.example/link");
    const result = await provider.rewriteLink(
      "https://meli.la/2BCJSYh",
      makeCredential({ ssid: "secret-session" }),
    );

    assert.equal(
      result.resolvedUrl,
      "https://produto.mercadolivre.com.br/MLB-123456789-produto",
    );
    assert.equal(result.itemId, "MLB123456789");
    assert.equal(result.originalItemId, "MLB123456789");
    assert.equal(result.generatedItemId, undefined);
    assert.equal(result.sameProduct, undefined);
    assert.equal(result.canForward, true);
    assert.equal(result.rewrittenUrl, "https://meli.la/affiliate-real");
    assert.deepEqual(generatorBody, {
      tag: "loce6396673",
      url: "https://produto.mercadolivre.com.br/MLB-123456789-produto",
    });
  });

  it("uses pdp_filters item_id and ignores CTA product URLs", async () => {
    const socialUrl =
      "https://www.mercadolivre.com.br/social/creator/lists/list-id";
    const wrongProductUrl =
      "https://produto.mercadolivre.com.br/MLB-111111111-whey-chocolate-_JM";
    const itemId = "MLB6419900846";
    const matchedProductUrl =
      "https://produto.mercadolivre.com.br/MLB6419900846-_JM";
    globalThis.fetch = async (_url, init) => {
      if (init?.method === "HEAD") {
        const response = new Response(null, { status: 200 });
        Object.defineProperty(response, "url", { value: socialUrl });
        return response;
      }

      return new Response(null, { status: 200 });
    };
    axios.get = (async (_url, config) => ({
      status: 200,
      statusText: "OK",
      config: config as never,
      headers: {},
      data: `
        <section class="carousel recommendations">
          <a href="${wrongProductUrl}">Comprar</a>
        </section>
        <section class="main-product">
          <a class="primary cta" href="${wrongProductUrl}">Ir para produto</a>
        </section>
        <script>
          window.navigationUrl = "/produto/up/MLBU3823122087?pdp_filters=item_id%3A${itemId}";
        </script>
      `,
    })) as typeof axios.get;
    const payloadUrls: string[] = [];
    axios.post = (async (_url, body, config) => {
      payloadUrls.push((body as { url: string }).url);

      return {
        status: 200,
        statusText: "OK",
        config: config as never,
        headers: {},
        data: { short_url: "https://meli.la/new-affiliate-link" },
      };
    }) as typeof axios.post;
    const result = await makeProvider().rewriteLink(
      "https://meli.la/social-link",
      makeCredential({ ssid: "secret-session" }),
    );

    assert.deepEqual(payloadUrls, [matchedProductUrl]);
    assert.equal(result.changed, true);
    assert.equal(result.canForward, true);
    assert.equal(result.rewrittenUrl, "https://meli.la/new-affiliate-link");
    assert.equal(result.attemptedPayloadUrl, matchedProductUrl);
    assert.equal(result.mainProductUrl, matchedProductUrl);
    assert.equal(result.mainProductSource, "pdp_filters_item_id");
    assert.equal(result.strategy, "pdp_filters_item_id");
    assert.equal(result.itemId, itemId);
    assert.equal(result.socialDebug?.pdpItemId, itemId);
    assert.equal(result.resolvedUrl, socialUrl);
  });

  it("selects show_product inside recommendation_data without blocking it", () => {
    const showProductUrl =
      "https://produto.mercadolivre.com.br/MLB-1886834300-camisa-brasil-_JM";
    const result = makeProvider().extractMainProductFromSocialPage(
      `<script type="application/json">
        {
          "appProps": {
            "pageProps": {
              "data": {
                "components": [{
                  "recommendation_data": {
                    "recommendation_info": {
                      "polycards": [{
                        "components": [{
                          "action_links": [{
                            "id": "show_product",
                            "text": "Ir para produto",
                            "url": "${showProductUrl}"
                          }]
                        }]
                      }]
                    }
                  }
                }]
              }
            }
          }
        }
      </script>`,
      "https://www.mercadolivre.com.br/social/creator/lists/list-id",
    );

    assert.equal(result.productUrl, showProductUrl);
    assert.equal(result.source, "primary_show_product_action");
    assert.equal(result.strategy, "show_product_action");
    assert.equal(result.selectedCandidateReason, "SHOW_PRODUCT_ACTION");
    assert.equal(
      result.selectedCandidate?.source,
      "primary_show_product_action",
    );
    assert.equal(result.selectedCandidate?.score, 10000);
    assert.equal(result.selectedCandidate?.rejectedReason, undefined);
    assert.match(
      result.selectedCandidate?.path ?? "",
      /recommendation_data.*polycards.*action_links.*url/,
    );
  });

  it("show_product wins over pdp_filters and other product URLs", () => {
    const showProductUrl =
      "https://produto.mercadolivre.com.br/MLB-1886834300-primary-_JM";
    const result = makeProvider().extractMainProductFromSocialPage(
      `<script type="application/json">
        {
          "recommendation_data": {
            "action_links": [{
              "id": "show_product",
              "url": "${showProductUrl}"
            }],
            "products": [{
              "url": "https://produto.mercadolivre.com.br/MLB-999999999-other-_JM"
            }],
            "navigation": "/up/MLBU1?pdp_filters=item_id%3AMLB6419900846"
          }
        }
      </script>`,
      "https://www.mercadolivre.com.br/social/creator/lists/list-id",
    );

    assert.equal(result.productUrl, showProductUrl);
    assert.equal(result.selectedCandidateReason, "SHOW_PRODUCT_ACTION");
  });

  it("resolves the show_product final URL before generating the short URL", async () => {
    const originalUrl = "https://meli.la/social-show-product";
    const socialUrl =
      "https://www.mercadolivre.com.br/social/creator/lists/list-id";
    const selectedUrl =
      "https://produto.mercadolivre.com.br/MLB-1886834300-selected-_JM";
    const finalUrl =
      "https://produto.mercadolivre.com.br/MLB-1886834300-final-_JM";
    globalThis.fetch = async (url) => {
      const response = new Response(null, { status: 200 });
      Object.defineProperty(response, "url", {
        value: String(url) === originalUrl ? socialUrl : finalUrl,
      });
      return response;
    };
    axios.get = (async (_url, config) => ({
      status: 200,
      statusText: "OK",
      config: config as never,
      headers: {},
      data: `<script type="application/json">{
        "action_links": [{
          "id": "show_product",
          "text": "Ir para produto",
          "url": "${selectedUrl}"
        }]
      }</script>`,
    })) as typeof axios.get;
    let generatedFrom = "";
    axios.post = (async (_url, body, config) => {
      generatedFrom = (body as { url: string }).url;
      return {
        status: 200,
        statusText: "OK",
        config: config as never,
        headers: {},
        data: { short_url: "https://meli.la/from-show-product" },
      };
    }) as typeof axios.post;

    const result = await makeProvider().rewriteLink(
      originalUrl,
      makeCredential({ ssid: "secret-session" }),
    );

    assert.equal(generatedFrom, finalUrl);
    assert.equal(result.finalProductUrl, finalUrl);
    assert.equal(result.mainProductUrl, selectedUrl);
    assert.equal(result.selectedCandidate?.url, selectedUrl);
    assert.equal(result.selectedCandidateReason, "SHOW_PRODUCT_ACTION");
    assert.equal(result.rewrittenUrl, "https://meli.la/from-show-product");
  });

  it("converts a social page from an unencoded pdp_filters item_id", async () => {
    const originalUrl = "https://meli.la/social-link";
    const socialUrl =
      "https://www.mercadolivre.com.br/social/creator/lists/list-id";
    const itemId = "MLB5943120120";
    const productUrl = "https://produto.mercadolivre.com.br/MLB5943120120-_JM";
    globalThis.fetch = async () => {
      const response = new Response(null, { status: 200 });
      Object.defineProperty(response, "url", { value: socialUrl });
      return response;
    };
    axios.get = (async (_url, config) => ({
      status: 200,
      statusText: "OK",
      config: config as never,
      headers: {},
      data: `<script>window.target = "/up/MLBU123?pdp_filters=item_id:${itemId}&source=social";</script>`,
    })) as typeof axios.get;
    const payloadUrls: string[] = [];
    axios.post = (async (_url, body, config) => {
      payloadUrls.push((body as { url: string }).url);
      return {
        status: 200,
        statusText: "OK",
        config: config as never,
        headers: {},
        data: { short_url: "https://meli.la/from-cta" },
      };
    }) as typeof axios.post;

    const result = await makeProvider().rewriteLink(
      originalUrl,
      makeCredential({ ssid: "secret-session" }),
      { originalMessageText: "Kit Produto Premium" },
    );

    assert.deepEqual(payloadUrls, [productUrl]);
    assert.equal(result.changed, true);
    assert.equal(result.canForward, true);
    assert.equal(result.rewrittenUrl, "https://meli.la/from-cta");
    assert.equal(result.originProductUrl, productUrl);
    assert.equal(result.mainProductUrl, productUrl);
    assert.equal(result.mainProductSource, "pdp_filters_item_id");
    assert.equal(result.strategy, "pdp_filters_item_id");
    assert.equal(result.itemId, itemId);
    assert.equal(result.attemptedPayloadUrl, productUrl);
  });

  it("extracts only pdp_filters and ignores visible product CTAs", () => {
    const primaryUrl =
      "https://produto.mercadolivre.com.br/MLB-123456789-primary-_JM";
    const itemId = "MLB987654321";
    const result = makeProvider().extractMainProductFromSocialPage(
      `
        <main>
          <a href="${primaryUrl}">Ir para produto</a>
        </main>
        <script>window.href = "/up/MLBU1?pdp_filters=item_id%3A${itemId}";</script>
      `,
      "https://www.mercadolivre.com.br/social/creator/lists/list-id",
    );

    assert.equal(
      result.productUrl,
      "https://produto.mercadolivre.com.br/MLB987654321-_JM",
    );
    assert.equal(result.itemId, itemId);
    assert.equal(result.source, "pdp_filters_item_id");
    assert.equal(result.strategy, "pdp_filters_item_id");
  });

  it("uses a common structured candidate as text-match fallback", async () => {
    const originalUrl = "https://meli.la/social-json";
    const socialUrl =
      "https://www.mercadolivre.com.br/social/creator/lists/json-id";
    const productUrl =
      "https://produto.mercadolivre.com.br/MLB-777777777-fone-bluetooth-_JM";
    globalThis.fetch = async () => {
      const response = new Response(null, { status: 200 });
      Object.defineProperty(response, "url", { value: socialUrl });
      return response;
    };
    axios.get = (async (_url, config) => ({
      status: 200,
      statusText: "OK",
      config: config as never,
      headers: {},
      data: `<script>window.__PRELOADED_STATE__ = {"product":{"title":"Fone Bluetooth","productUrl":"${productUrl}"}}</script>`,
    })) as typeof axios.get;
    const payloadUrls: string[] = [];
    axios.post = (async (_url, body, config) => {
      payloadUrls.push((body as { url: string }).url);
      return {
        status: 200,
        statusText: "OK",
        config: config as never,
        headers: {},
        data: { short_url: "https://meli.la/from-json" },
      };
    }) as typeof axios.post;

    const result = await makeProvider().rewriteLink(
      originalUrl,
      makeCredential({ ssid: "secret-session" }),
      { originalMessageText: "Fone Bluetooth" },
    );

    assert.equal(result.changed, true);
    assert.equal(result.mainProductUrl, productUrl);
    assert.equal(result.mainProductSource, "candidate_fallback");
    assert.equal(result.strategy, "candidate_fallback");
    assert.equal(result.selectedCandidateReason, "TEXT_SIMILARITY_MATCH");
    assert.deepEqual(payloadUrls, [productUrl]);
    assert.equal(result.socialDebug?.urlsFound[0]?.url, productUrl);
  });

  it("keeps primaryAction.url only as debug without pdp_filters", () => {
    const productUrl =
      "https://produto.mercadolivre.com.br/MLB-700000001-primary-_JM";
    const result = makeProvider().extractMainProductFromSocialPage(
      `<script>window.__PRELOADED_STATE__ = {
        "page": {"primaryAction": {"url": "${productUrl}"}}
      };</script>`,
      "https://www.mercadolivre.com.br/social/creator/lists/list-id",
    );

    assert.equal(result.productUrl, null);
    assert.equal(result.source, "none");
    assert.equal(result.reason, "MERCADO_LIVRE_PRODUCT_NOT_FOUND");
  });

  it("does not use cta.url from a parseable JSON script", () => {
    const productUrl =
      "https://www.mercadolivre.com.br/MLB-700000002-product-_JM";
    const result = makeProvider().extractMainProductFromSocialPage(
      `<script type="application/json">{"cta":{"url":"${productUrl}"}}</script>`,
      "https://www.mercadolivre.com.br/social/creator/lists/list-id",
    );

    assert.equal(result.productUrl, null);
    assert.equal(result.reason, "MERCADO_LIVRE_PRODUCT_NOT_FOUND");
  });

  it("does not select structured primary or recommendation product URLs", () => {
    const primaryUrl =
      "https://produto.mercadolivre.com.br/MLB-700000003-primary-_JM";
    const recommendationUrl =
      "https://produto.mercadolivre.com.br/MLB-700000004-recommendation-_JM";
    const result = makeProvider().extractMainProductFromSocialPage(
      `<script>window.__STATE__ = {
        "recommendations": [{"item":{"url":"${recommendationUrl}"}}],
        "primaryProduct": {"permalink":"${primaryUrl}"}
      };</script>`,
      "https://www.mercadolivre.com.br/social/creator/lists/list-id",
    );

    assert.equal(result.productUrl, null);
    assert.equal(result.reason, "MERCADO_LIVRE_PRODUCT_NOT_FOUND");
  });

  it("does not select a page containing only recommendations", () => {
    const result = makeProvider().extractMainProductFromSocialPage(
      `<script>window.__STATE__ = {
        "recommendations": [{
          "item": {
            "url": "https://produto.mercadolivre.com.br/MLB-700000005-recommendation-_JM"
          }
        }]
      };</script>`,
      "https://www.mercadolivre.com.br/social/creator/lists/list-id",
    );

    assert.equal(result.productUrl, null);
    assert.equal(result.source, "none");
    assert.equal(result.reason, "MERCADO_LIVRE_PRODUCT_NOT_FOUND");
  });

  it("does not use a cta deeplink without pdp_filters", () => {
    const productUrl =
      "https://produto.mercadolivre.com.br/MLB-700000006-deeplink-_JM";
    const deeplink = `meli://webview?url=${encodeURIComponent(productUrl)}`;
    const result = makeProvider().extractMainProductFromSocialPage(
      `<script type="application/json">{"cta":{"deeplink":"${deeplink}"}}</script>`,
      "https://www.mercadolivre.com.br/social/creator/lists/list-id",
    );

    assert.equal(result.productUrl, null);
    assert.equal(result.reason, "MERCADO_LIVRE_PRODUCT_NOT_FOUND");
  });

  it("returns product not found after resolved and original generation fail", async () => {
    const originalUrl = "https://meli.la/social-link";
    const resolvedUrl =
      "https://www.mercadolivre.com.br/social/creator/lists/list-id";
    globalThis.fetch = async () => {
      const response = new Response(null, { status: 200 });
      Object.defineProperty(response, "url", { value: resolvedUrl });
      return response;
    };
    axios.get = (async (_url, config) => ({
      status: 200,
      statusText: "OK",
      config: config as never,
      headers: {},
      data: "<html></html>",
    })) as typeof axios.get;
    let generatorCalls = 0;
    axios.post = (async (_url, _body, config) => {
      generatorCalls += 1;
      return {
        status: 400,
        statusText: "Bad Request",
        config: config as never,
        headers: {},
        data: {},
      };
    }) as typeof axios.post;

    const result = await makeProvider().rewriteLink(
      originalUrl,
      makeCredential({ ssid: "secret-session" }),
    );

    assert.equal(generatorCalls, 0);
    assert.equal(result.attemptedPayloadUrl, undefined);
    assert.equal(result.changed, false);
    assert.equal(result.canForward, false);
    assert.equal(result.reason, "MERCADO_LIVRE_PRODUCT_NOT_FOUND");
    assert.equal(result.mainProductSource, "none");
    assert.equal(result.socialDebug?.status, 200);
    assert.equal(result.socialDebug?.htmlLength, 13);
    assert.equal(result.socialDebug?.scriptCount, 0);
    assert.deepEqual(result.socialDebug?.candidateKeysFound, []);
    assert.equal(result.socialDebug?.hasPreloadedState, false);
    assert.equal(result.socialDebug?.hasMelidata, false);
    assert.equal(result.socialDebug?.hasNextData, false);
    assert.deepEqual(result.socialDebug?.urlsFound, []);
    assert.deepEqual(result.socialDebug?.endpointsFound, []);
  });

  it("rejects a CTA inside a Para voce recommendation section", async () => {
    const socialUrl =
      "https://www.mercadolivre.com.br/social/creator/lists/list-id";
    globalThis.fetch = async (_url, init) => {
      const response = new Response(null, { status: 200 });

      if (init?.method === "HEAD") {
        Object.defineProperty(response, "url", { value: socialUrl });
      }

      return response;
    };
    axios.get = (async (_url, config) => ({
      status: 200,
      statusText: "OK",
      config: config as never,
      headers: {},
      data: `
        <html><body>
          <section class="para-voce recommendations">
            <h2>Para você</h2>
            <a class="reco" href="https://produto.mercadolivre.com.br/MLB-111111111-recommended-_JM">
              Ir para produto
            </a>
          </section>
        </body></html>
      `,
    })) as typeof axios.get;
    let generatorCalls = 0;
    axios.post = (async (_url, _body, config) => {
      generatorCalls += 1;
      return {
        status: 200,
        statusText: "OK",
        config: config as never,
        headers: {},
        data: { short_url: "https://meli.la/from-sponsored-candidate" },
      };
    }) as typeof axios.post;

    const result = await makeProvider().rewriteLink(
      "https://meli.la/social-link",
      makeCredential({ ssid: "secret-session" }),
    );

    assert.equal(result.changed, false);
    assert.equal(result.canForward, false);
    assert.equal(result.reason, "MERCADO_LIVRE_PRODUCT_NOT_FOUND");
    assert.equal(result.mainProductSource, "none");
    assert.equal(generatorCalls, 0);
  });

  it("does not use ordinary product links when the primary CTA is absent", async () => {
    const originalUrl = "https://meli.la/ambiguous";
    const socialUrl =
      "https://www.mercadolivre.com.br/social/creator/lists/ambiguous";
    globalThis.fetch = async () => {
      const response = new Response(null, { status: 200 });
      Object.defineProperty(response, "url", { value: socialUrl });
      return response;
    };
    axios.get = (async (_url, config) => ({
      status: 200,
      statusText: "OK",
      config: config as never,
      headers: {},
      data: `
        <section class="main-product">
          <a href="https://produto.mercadolivre.com.br/MLB-111111111-one-_JM">Detalhes</a>
        </section>
        <section class="mais-vendidos carousel">
          <a href="https://produto.mercadolivre.com.br/MLB-222222222-two-_JM">Comprar</a>
        </section>
      `,
    })) as typeof axios.get;
    let generatorCalls = 0;
    axios.post = (async (_url, _body, config) => {
      generatorCalls += 1;
      return {
        status: 200,
        statusText: "OK",
        config: config as never,
        headers: {},
        data: { short_url: "https://meli.la/from-first-candidate" },
      };
    }) as typeof axios.post;

    const result = await makeProvider().rewriteLink(
      originalUrl,
      makeCredential({ ssid: "secret-session" }),
    );

    assert.equal(result.changed, false);
    assert.equal(result.canForward, false);
    assert.equal(result.reason, "MERCADO_LIVRE_PRODUCT_NOT_FOUND");
    assert.equal(result.mainProductSource, "none");
    assert.equal(result.generationAttempts?.length, 0);
    assert.equal(generatorCalls, 0);
  });

  it("extracts candidate title from anchor attributes", () => {
    const candidates = makeProvider().extractSocialCandidates(
      `
        <a class="primary cta"
           title="Fone Bluetooth Premium"
           href="https://produto.mercadolivre.com.br/MLB-333333333-fone-_JM">
          Comprar
        </a>
      `,
      "https://www.mercadolivre.com.br/social/creator/lists/list-id",
    );

    assert.equal(candidates[0]?.score, 40);
    assert.equal(candidates[0]?.title, "Fone Bluetooth Premium");
  });

  it("rejects a candidate with only one matching keyword", async () => {
    const productOne =
      "https://produto.mercadolivre.com.br/MLB-111111111-one-_JM";
    const productTwo =
      "https://produto.mercadolivre.com.br/MLB-222222222-two-_JM";
    axios.get = (async (_url, config) => ({
      status: 200,
      statusText: "OK",
      config: config as never,
      headers: {},
      data: `<script>window.__PRELOADED_STATE__ = {
        "products": [
          {"title":"Creatina Max Titanium","productUrl":"${productOne}"},
          {"title":"Whey Chocolate Premium","productUrl":"${productTwo}"}
        ]
      }</script>`,
    })) as typeof axios.get;

    const result = await makeProvider().extractProductFromSocialPage(
      "https://www.mercadolivre.com.br/social/creator/lists/list-id",
      "Creatina 600g Soldiers",
      "secret-session",
    );

    assert.equal(result.selectedCandidate, undefined);
    assert.deepEqual(result.candidates[0]?.matchedKeywords, ["creatina"]);
    assert.match(
      result.candidates[0]?.rejectedReason ?? "",
      /KEYWORDS_BELOW_2/,
    );
    assert.equal(result.ambiguous, true);
  });

  it("selects a strong title match despite a close second candidate", async () => {
    const matchedProduct =
      "https://produto.mercadolivre.com.br/MLB-333333333-creatina-_JM";
    const otherProduct =
      "https://produto.mercadolivre.com.br/MLB-444444444-whey-_JM";
    axios.get = (async (_url, config) => ({
      status: 200,
      statusText: "OK",
      config: config as never,
      headers: {},
      data: `
        <a title="Creatina 600g Soldiers" href="${matchedProduct}">Produto</a>
        <link rel="canonical" href="${otherProduct}">
      `,
    })) as typeof axios.get;

    const result = await makeProvider().extractProductFromSocialPage(
      "https://www.mercadolivre.com.br/social/creator/lists/list-id",
      "Creatina 600g Soldiers",
      "secret-session",
    );

    assert.equal(result.selectedCandidate?.itemId, "MLB333333333");
    assert.equal(result.selectedCandidate?.strongTextMatch, true);
    assert.match(result.selectedCandidate?.matchReason ?? "", /BRAND_MATCH/);
    assert.match(result.selectedCandidate?.matchReason ?? "", /QUANTITY_MATCH/);
    assert.equal(result.selectedCandidateReason, "TEXT_SIMILARITY_MATCH");
  });

  it("retries extraction from the original URL when resolved HTML has no product", async () => {
    const productUrl =
      "https://produto.mercadolivre.com.br/MLB-555555555-product-_JM";
    const requestedUrls: string[] = [];
    axios.get = (async (url, config) => {
      requestedUrls.push(String(url));
      return {
        status: 200,
        statusText: "OK",
        config: config as never,
        headers: {},
        data:
          requestedUrls.length === 1
            ? "<html></html>"
            : `<a class="primary cta" title="Creatina 600g Soldiers" href="${productUrl}">Comprar</a>`,
      };
    }) as typeof axios.get;

    const result = await makeProvider().extractProductFromSocialPage(
      "https://www.mercadolivre.com.br/social/creator/lists/list-id",
      "Creatina 600g Soldiers",
      "secret-session",
      "https://meli.la/original",
    );

    assert.deepEqual(requestedUrls, [
      "https://www.mercadolivre.com.br/social/creator/lists/list-id",
      "https://meli.la/original",
    ]);
    assert.equal(result.selectedCandidate?.url, productUrl);
  });

  it("does not use loose MLB occurrences from a social list", () => {
    const result = makeProvider().extractProductUrlFromSocialPage(`
      <script>
        window.recommendations = [
          "/MLB-111111111-first-product-_JM",
          "https://produto.mercadolivre.com.br/MLB-222222222-second-product-_JM"
        ];
      </script>
    `);

    assert.deepEqual(result, { confidence: "none" });
  });

  it("extracts only structured social candidates", () => {
    const candidates = makeProvider().extractSocialCandidates(
      `
        <link rel="canonical" href="https://produto.mercadolivre.com.br/MLB-111111111-canonical-_JM">
        <meta property="og:url" content="https://produto.mercadolivre.com.br/MLB-222222222-og-_JM">
        <script type="application/ld+json">
          {"@type":"Product","name":"Produto JSON","productUrl":"https://produto.mercadolivre.com.br/MLB-333333333-json-ld-_JM"}
        </script>
        <a href="https://produto.mercadolivre.com.br/MLB-444444444-href-_JM">Produto</a>
        https://produto.mercadolivre.com.br/MLB-555555555-regex-_JM
        "/MLB-666666666-relative-_JM"
      `,
      "https://www.mercadolivre.com.br/social/creator/lists/list-id",
    );

    assert.deepEqual(
      candidates.map(({ source, itemId }) => ({ source, itemId })),
      [
        { source: "json_ld", itemId: "MLB333333333" },
        { source: "canonical", itemId: "MLB111111111" },
        { source: "og", itemId: "MLB222222222" },
        { source: "href", itemId: "MLB444444444" },
      ],
    );
    assert.equal(
      candidates.every(
        (candidate) => (candidate.textContext?.length ?? 0) <= 120,
      ),
      true,
    );
  });

  it("returns generation failed when generation from pdp item_id fails", async () => {
    const resolvedUrl =
      "https://www.mercadolivre.com.br/social/creator/lists/list-id";
    globalThis.fetch = async () => {
      const response = new Response(null, { status: 200 });
      Object.defineProperty(response, "url", { value: resolvedUrl });
      return response;
    };
    axios.get = (async (_url, config) => ({
      status: 200,
      statusText: "OK",
      config: config as never,
      headers: {},
      data: '<script>window.href="/up/MLBU1?pdp_filters=item_id%3AMLB123456789"</script>',
    })) as typeof axios.get;
    let generatorCalls = 0;
    axios.post = (async (_url, _body, config) => {
      generatorCalls += 1;
      return {
        status: 400,
        statusText: "Bad Request",
        config: config as never,
        headers: {},
        data: {},
      };
    }) as typeof axios.post;

    const result = await makeProvider().rewriteLink(
      "https://meli.la/social-link",
      makeCredential({ ssid: "secret-session" }),
    );

    assert.equal(result.changed, false);
    assert.equal(result.generationAttempts?.length, 1);
    assert.equal(result.reason, "MERCADO_LIVRE_GENERATION_FAILED");
    assert.equal(generatorCalls, 1);
    assert.equal(
      result.mainProductUrl,
      "https://produto.mercadolivre.com.br/MLB123456789-_JM",
    );
    assert.equal(result.mainProductSource, "pdp_filters_item_id");
    assert.equal(result.strategy, "pdp_filters_item_id");
    assert.equal(result.itemId, "MLB123456789");
    assert.equal(JSON.stringify(result).includes("secret-session"), false);
  });

  it("rejects a canonical URL that still points to social content", () => {
    const result = makeProvider().extractProductUrlFromSocialPage(`
      <link
        rel="canonical"
        href="https://www.mercadolivre.com.br/social/creator/lists/MLB-123456789-product-_JM"
      >
    `);

    assert.deepEqual(result, { confidence: "none" });
  });

  it("validates only Mercado Livre product URLs", () => {
    const provider = makeProvider();

    assert.equal(
      provider.isMercadoLivreProductUrl(
        "https://produto.mercadolivre.com.br/MLB-5943120120-kit-produto-_JM",
      ),
      true,
    );
    assert.equal(
      provider.isMercadoLivreProductUrl(
        "https://www.mercadolivre.com.br/social/lists/MLB-5943120120",
      ),
      false,
    );
    assert.equal(
      provider.isMercadoLivreProductUrl(
        "https://www.mercadolivre.com.br/wishlist/MLB-5943120120",
      ),
      false,
    );
  });

  it("fails without ssid", async () => {
    const result = await makeProvider(
      "https://generator.example/link",
    ).rewriteLink("https://meli.la/2BCJSYh", makeCredential(null));

    assert.equal(result.changed, false);
    assert.equal(result.reason, "MISSING_MERCADO_LIVRE_SESSION");
  });

  it("uses the official endpoint when no override is configured", async () => {
    let requestedUrl = "";
    globalThis.fetch = async () => {
      const response = new Response(null, { status: 200 });
      Object.defineProperty(response, "url", {
        value: "https://produto.mercadolivre.com.br/MLB-123456789-produto",
      });
      return response;
    };
    axios.post = (async (url, _body, config) => {
      requestedUrl = url;
      return {
        status: 200,
        statusText: "OK",
        config: config as never,
        headers: {},
        data: { short_url: "https://meli.la/official" },
      };
    }) as typeof axios.post;
    const result = await makeProvider().rewriteLink(
      "https://mercadolivre.com.br/MLB-123456789-produto",
      makeCredential({ sessionToken: "secret-session" }),
    );

    assert.equal(result.changed, true);
    assert.equal(
      requestedUrl,
      "https://www.mercadolivre.com.br/affiliate-program/api/v2/stripe/user/links",
    );
    assert.equal(result.rewrittenUrl, "https://meli.la/official");
  });

  it("trusts a generated short_url without scraping its final item", async () => {
    globalThis.fetch = async (url) => {
      const response = new Response(null, { status: 200 });
      Object.defineProperty(response, "url", {
        value: String(url).includes("generated")
          ? "https://produto.mercadolivre.com.br/MLB-999999999-outro-_JM"
          : "https://produto.mercadolivre.com.br/MLB-123456789-original-_JM",
      });
      return response;
    };
    axios.post = (async (_url, _body, config) => ({
      status: 200,
      statusText: "OK",
      config: config as never,
      headers: {},
      data: { short_url: "https://meli.la/generated" },
    })) as typeof axios.post;

    const result = await makeProvider().rewriteLink(
      "https://meli.la/original",
      makeCredential({ ssid: "secret-session" }),
    );

    assert.equal(result.changed, true);
    assert.equal(result.canForward, true);
    assert.equal(result.sameProduct, undefined);
    assert.equal(result.originalItemId, "MLB123456789");
    assert.equal(result.generatedItemId, undefined);
    assert.equal(result.reason, undefined);
  });

  it("rejects an unchanged generated URL even for the same item", async () => {
    const originalUrl =
      "https://produto.mercadolivre.com.br/MLB-123456789-original-_JM";
    axios.post = (async (_url, _body, config) => ({
      status: 200,
      statusText: "OK",
      config: config as never,
      headers: {},
      data: { short_url: originalUrl },
    })) as typeof axios.post;

    const result = await makeProvider().rewriteLink(
      originalUrl,
      makeCredential({ ssid: "secret-session" }),
    );

    assert.equal(result.changed, false);
    assert.equal(result.sameProduct, false);
    assert.equal(result.canForward, false);
    assert.equal(result.reason, "MERCADO_LIVRE_GENERATION_FAILED");
  });

  it("uses aff_id only in legacy mode and returns a warning", async () => {
    process.env.MERCADO_LIVRE_MODE = "legacy";
    const result = await makeProvider().rewriteLink(
      "https://mercadolivre.com.br/MLB-123456789-produto",
      makeCredential({ ssid: "secret-session" }),
    );

    assert.equal(result.changed, true);
    assert.equal(result.canForward, false);
    assert.equal(result.sameProduct, false);
    assert.equal(result.mode, "legacy");
    assert.equal(result.warning, "Modo legado não garante comissão.");
    assert.equal(result.rewrittenUrl.includes("aff_id=loce6396673"), true);
  });

  it("does not change links in disabled mode", async () => {
    process.env.MERCADO_LIVRE_MODE = "disabled";
    const result = await makeProvider().rewriteLink(
      "https://meli.la/2BCJSYh",
      makeCredential({ ssid: "secret-session" }),
    );

    assert.equal(result.changed, false);
    assert.equal(result.mode, "disabled");
    assert.equal(result.reason, "MERCADO_LIVRE_DISABLED");
  });
});
