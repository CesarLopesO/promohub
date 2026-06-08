import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { NotFoundException } from "@nestjs/common";
import type { AffiliateCredential, AffiliateLinkCache } from "@prisma/client";
import axios from "axios";

import { AffiliateLinkRewriterService } from "./affiliate-link-rewriter.service";
import { Marketplace } from "./helpers/detect-marketplace";
import { AmazonAffiliateProvider } from "./providers/amazon.provider";

const originalFetch = globalThis.fetch;
const originalAxiosPost = axios.post;

afterEach(() => {
  globalThis.fetch = originalFetch;
  axios.post = originalAxiosPost;
});

function makeCredential(
  marketplace: Marketplace,
  overrides: Partial<AffiliateCredential>,
): AffiliateCredential {
  return {
    id: `${marketplace}-credential`,
    userId: "test-user",
    marketplace,
    affiliateId: null,
    apiKey: null,
    apiSecret: null,
    trackingId: null,
    metadata: null,
    isActive: true,
    createdAt: new Date("2026-06-01T12:00:00.000Z"),
    updatedAt: new Date("2026-06-01T12:00:00.000Z"),
    ...overrides,
  };
}

type StoredMessage = {
  id: string;
  text: string | null;
  links: unknown;
};

function makeMessage(overrides: Partial<StoredMessage>): StoredMessage {
  return {
    id: "message-id",
    text: "Loja oficial Amazon: https://www.amazon.com.br/dp/ABC",
    links: ["https://www.amazon.com.br/dp/ABC"],
    ...overrides,
  };
}

function makeService(
  credentials: AffiliateCredential[],
  messages: StoredMessage[] = [],
  mercadoLivreRewrite?: (originalUrl: string) => {
    rewrittenUrl: string;
    changed: boolean;
    resolvedUrl?: string;
    originalItemId?: string;
    generatedItemId?: string;
    sameProduct?: boolean;
    canForward?: boolean;
    reason?: string;
    itemId?: string;
    selectedCandidate?: {
      source: "cta";
      url: string;
      score: number;
    };
  },
  cacheEntries: AffiliateLinkCache[] = [],
) {
  return new AffiliateLinkRewriterService(
    {
      affiliateCredential: {
        findUnique: async ({
          where,
        }: {
          where: {
            userId_marketplace: {
              userId: string;
              marketplace: string;
            };
          };
        }) =>
          credentials.find(
            (credential) =>
              credential.userId === where.userId_marketplace.userId &&
              credential.marketplace === where.userId_marketplace.marketplace,
          ) ?? null,
      },
      whatsAppMessage: {
        findUnique: async ({ where }: { where: { id: string } }) =>
          messages.find((message) => message.id === where.id) ?? null,
      },
      affiliateLinkCache: {
        findUnique: async ({ where }: { where: { originalUrlHash: string } }) =>
          cacheEntries.find(
            (entry) => entry.originalUrlHash === where.originalUrlHash,
          ) ?? null,
        upsert: async ({
          where,
          create,
          update,
        }: {
          where: { originalUrlHash: string };
          create: Omit<AffiliateLinkCache, "id" | "createdAt" | "updatedAt">;
          update: Partial<AffiliateLinkCache>;
        }) => {
          const existing = cacheEntries.find(
            (entry) => entry.originalUrlHash === where.originalUrlHash,
          );

          if (existing) {
            Object.assign(existing, update, { updatedAt: new Date() });
            return existing;
          }

          const entry: AffiliateLinkCache = {
            id: `cache-${cacheEntries.length + 1}`,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...create,
          };
          cacheEntries.push(entry);
          return entry;
        },
      },
    } as never,
    {
      rewriteLink: async (originalUrl: string) =>
        mercadoLivreRewrite?.(originalUrl) ?? {
          rewrittenUrl: "https://meli.la/generated-affiliate",
          changed: true,
          resolvedUrl: originalUrl,
          originalItemId: "MLB123456789",
          generatedItemId: "MLB123456789",
          sameProduct: true,
          canForward: true,
        },
    } as never,
    new AmazonAffiliateProvider(),
  );
}

describe("AffiliateLinkRewriterService", () => {
  it("rewrites Amazon links with trackingId", async () => {
    const service = makeService([
      makeCredential(Marketplace.AMAZON, { trackingId: "meutag-20" }),
    ]);

    assert.deepEqual(
      await service.rewriteUrlForUser(
        "test-user",
        "https://www.amazon.com.br/dp/ABC",
      ),
      {
        originalUrl: "https://www.amazon.com.br/dp/ABC",
        rewrittenUrl: "https://www.amazon.com.br/dp/ABC?tag=meutag-20",
        marketplace: Marketplace.AMAZON,
        changed: true,
        canForward: true,
        tag: "meutag-20",
      },
    );
  });

  it("rewrites Amazon links with affiliateId fallback", async () => {
    const service = makeService([
      makeCredential(Marketplace.AMAZON, { affiliateId: "fallback-20" }),
    ]);

    const result = await service.rewriteUrlForUser(
      "test-user",
      "https://amazon.com/dp/abc",
    );

    assert.equal(
      result.rewrittenUrl,
      "https://amazon.com/dp/abc?tag=fallback-20",
    );
  });

  it("rewrites Mercado Livre links with the real provider result", async () => {
    const service = makeService([
      makeCredential(Marketplace.MERCADO_LIVRE, { affiliateId: "ml-aff" }),
    ]);

    const result = await service.rewriteUrlForUser(
      "test-user",
      "https://meli.la/xyz",
    );

    assert.match(result.rewrittenUrl, /^https:\/\/meli\.la\//);
    assert.equal(result.changed, true);
    assert.equal(result.affiliateUrl, result.rewrittenUrl);
  });

  it("saves a successful Mercado Livre conversion and reuses it", async () => {
    const cacheEntries: AffiliateLinkCache[] = [];
    let providerCalls = 0;
    const service = makeService(
      [
        makeCredential(Marketplace.MERCADO_LIVRE, {
          affiliateId: "ml-aff",
        }),
      ],
      [],
      () => {
        providerCalls += 1;
        return {
          rewrittenUrl: "https://meli.la/cached-affiliate",
          changed: true,
          resolvedUrl:
            "https://produto.mercadolivre.com.br/MLB-123456789-produto-_JM",
          itemId: "MLB123456789",
          canForward: true,
          selectedCandidate: {
            source: "cta",
            url: "https://produto.mercadolivre.com.br/MLB-123456789-produto-_JM",
            score: 100,
          },
        };
      },
      cacheEntries,
    );

    const first = await service.rewriteUrlForUser(
      "test-user",
      "https://meli.la/repeated",
    );
    const second = await service.rewriteUrlForUser(
      "test-user",
      "https://meli.la/repeated",
    );

    assert.equal(first.cacheHit, undefined);
    assert.equal(cacheEntries.length, 1);
    assert.equal(
      cacheEntries[0]?.affiliateUrl,
      "https://meli.la/cached-affiliate",
    );
    assert.equal(cacheEntries[0]?.source, "cta");
    assert.equal(second.cacheHit, true);
    assert.equal(second.reason, "CACHE_HIT");
    assert.equal(second.affiliateUrl, "https://meli.la/cached-affiliate");
    assert.equal(providerCalls, 1);
  });

  it("rewrites Shopee links with affiliateId", async () => {
    const service = makeService([
      makeCredential(Marketplace.SHOPEE, { affiliateId: "shopee-aff" }),
    ]);

    const result = await service.rewriteUrlForUser(
      "test-user",
      "https://shope.ee/abc",
    );

    assert.equal(
      result.rewrittenUrl,
      "https://shope.ee/abc?affiliate=shopee-aff",
    );
  });

  it("preserves existing query params", async () => {
    const service = makeService([
      makeCredential(Marketplace.AMAZON, { trackingId: "meutag-20" }),
    ]);

    const result = await service.rewriteUrlForUser(
      "test-user",
      "https://www.amazon.com.br/dp/ABC?utm=a",
    );

    assert.equal(
      result.rewrittenUrl,
      "https://www.amazon.com.br/dp/ABC?utm=a&tag=meutag-20",
    );
  });

  it("returns unchanged for unknown marketplaces", async () => {
    const service = makeService([]);

    assert.deepEqual(
      await service.rewriteUrlForUser("test-user", "https://example.com/abc"),
      {
        originalUrl: "https://example.com/abc",
        rewrittenUrl: "https://example.com/abc",
        marketplace: Marketplace.UNKNOWN,
        changed: false,
        reason: "UNKNOWN_MARKETPLACE",
      },
    );
  });

  it("returns unchanged when credential is missing", async () => {
    const service = makeService([]);

    assert.deepEqual(
      await service.rewriteUrlForUser(
        "test-user",
        "https://www.amazon.com.br/dp/ABC",
      ),
      {
        originalUrl: "https://www.amazon.com.br/dp/ABC",
        rewrittenUrl: "https://www.amazon.com.br/dp/ABC",
        marketplace: Marketplace.AMAZON,
        changed: false,
        reason: "AMAZON_TAG_NOT_CONFIGURED",
        canForward: false,
      },
    );
  });

  it("rewrites links in batch", async () => {
    const service = makeService([
      makeCredential(Marketplace.AMAZON, { trackingId: "meutag-20" }),
      makeCredential(Marketplace.MERCADO_LIVRE, { affiliateId: "ml-aff" }),
    ]);

    const result = await service.rewriteUrlsForUser("test-user", [
      "https://www.amazon.com.br/dp/ABC",
      "https://meli.la/xyz",
    ]);

    assert.deepEqual(
      result.map((item) => item.rewrittenUrl),
      [
        "https://www.amazon.com.br/dp/ABC?tag=meutag-20",
        "https://meli.la/generated-affiliate",
      ],
    );
  });

  it("previews a captured message with an Amazon link", async () => {
    const service = makeService(
      [makeCredential(Marketplace.AMAZON, { trackingId: "meutag-20" })],
      [makeMessage({})],
    );

    assert.deepEqual(
      await service.rewriteMessageForUser("test-user", "message-id"),
      {
        messageId: "message-id",
        changed: true,
        canForward: true,
        originalText: "Loja oficial Amazon: https://www.amazon.com.br/dp/ABC",
        rewrittenText:
          "Loja oficial Amazon: https://www.amazon.com.br/dp/ABC?tag=meutag-20",
        rewrites: [
          {
            originalUrl: "https://www.amazon.com.br/dp/ABC",
            rewrittenUrl: "https://www.amazon.com.br/dp/ABC?tag=meutag-20",
            marketplace: Marketplace.AMAZON,
            changed: true,
            canForward: true,
            tag: "meutag-20",
          },
        ],
      },
    );
  });

  it("previews a captured message with a Mercado Livre link", async () => {
    const service = makeService(
      [
        makeCredential(Marketplace.MERCADO_LIVRE, {
          affiliateId: "ml-aff",
        }),
      ],
      [
        makeMessage({
          text: "Promo ML https://meli.la/abc",
          links: ["https://meli.la/abc"],
        }),
      ],
    );

    const result = await service.rewriteMessageForUser(
      "test-user",
      "message-id",
    );

    assert.equal(
      result.rewrittenText,
      "Promo ML https://meli.la/generated-affiliate",
    );
  });

  it("previews a captured message with multiple links", async () => {
    const service = makeService(
      [
        makeCredential(Marketplace.AMAZON, { trackingId: "meutag-20" }),
        makeCredential(Marketplace.MERCADO_LIVRE, { affiliateId: "ml-aff" }),
      ],
      [
        makeMessage({
          text: "Ofertas https://www.amazon.com.br/dp/ABC e https://meli.la/xyz",
          links: ["https://www.amazon.com.br/dp/ABC", "https://meli.la/xyz"],
        }),
      ],
    );

    const result = await service.rewriteMessageForUser(
      "test-user",
      "message-id",
    );

    assert.equal(
      result.rewrittenText,
      "Ofertas https://www.amazon.com.br/dp/ABC?tag=meutag-20 e https://meli.la/generated-affiliate",
    );
    assert.equal(result.changed, true);
    assert.equal(result.rewrites.length, 2);
    assert.equal(result.canForward, true);
  });

  it("blocks forwarding when any Mercado Livre link fails conversion", async () => {
    const service = makeService(
      [
        makeCredential(Marketplace.MERCADO_LIVRE, {
          affiliateId: "ml-aff",
        }),
      ],
      [
        makeMessage({
          text: "Ofertas https://meli.la/good e https://meli.la/bad",
          links: ["https://meli.la/good", "https://meli.la/bad"],
        }),
      ],
      (originalUrl) =>
        originalUrl.endsWith("/bad")
          ? {
              rewrittenUrl: originalUrl,
              changed: false,
              originalItemId: "MLB123456789",
              generatedItemId: "MLB999999999",
              sameProduct: false,
              canForward: false,
              reason: "MERCADO_LIVRE_ITEM_MISMATCH",
            }
          : {
              rewrittenUrl: "https://meli.la/generated-good",
              changed: true,
              originalItemId: "MLB123456789",
              generatedItemId: "MLB123456789",
              sameProduct: true,
              canForward: true,
            },
    );

    const result = await service.rewriteMessageForUser(
      "test-user",
      "message-id",
    );

    assert.equal(result.changed, true);
    assert.equal(result.canForward, false);
    assert.equal(result.reason, "MERCADO_LIVRE_GENERATION_FAILED");
    assert.equal(result.rewrittenText?.includes("https://meli.la/bad"), false);
    assert.equal(
      result.rewrittenText?.includes("https://meli.la/generated-good"),
      true,
    );
  });

  it("returns EMPTY_TEXT for messages without text", async () => {
    const service = makeService([], [makeMessage({ text: null, links: [] })]);

    assert.deepEqual(
      await service.rewriteMessageForUser("test-user", "message-id"),
      {
        messageId: "message-id",
        changed: false,
        rewrites: [],
        canForward: false,
        reason: "EMPTY_TEXT",
      },
    );
  });

  it("returns unchanged for messages without links", async () => {
    const service = makeService(
      [],
      [makeMessage({ text: "Texto sem oferta", links: [] })],
    );

    assert.deepEqual(
      await service.rewriteMessageForUser("test-user", "message-id"),
      {
        messageId: "message-id",
        changed: false,
        originalText: "Texto sem oferta",
        rewrittenText: "Texto sem oferta",
        rewrites: [],
        canForward: false,
        reason: "NO_LINKS",
      },
    );
  });

  it("returns unchanged rewrite details when marketplace credential is missing", async () => {
    const service = makeService([], [makeMessage({})]);
    const result = await service.rewriteMessageForUser(
      "test-user",
      "message-id",
    );

    assert.equal(result.changed, false);
    assert.equal(
      result.rewrittenText,
      "Loja oficial Amazon: https://www.amazon.com.br/dp/ABC",
    );
    assert.equal(result.canForward, false);
    assert.equal(result.reason, "AMAZON_TAG_NOT_CONFIGURED");
    assert.deepEqual(result.rewrites, [
      {
        originalUrl: "https://www.amazon.com.br/dp/ABC",
        rewrittenUrl: "https://www.amazon.com.br/dp/ABC",
        marketplace: Marketplace.AMAZON,
        changed: false,
        reason: "AMAZON_TAG_NOT_CONFIGURED",
        canForward: false,
      },
    ]);
  });

  it("throws NotFoundException when message id does not exist", async () => {
    const service = makeService([]);

    await assert.rejects(
      () => service.rewriteMessageForUser("test-user", "missing-id"),
      NotFoundException,
    );
  });

  it("returns the raw Mercado Livre response without exposing the ssid", async () => {
    const ssid = "secret-session";
    let requestUrl = "";
    let requestBody: unknown;
    let requestConfig:
      | {
          headers?: Record<string, string>;
          validateStatus?: (status: number) => boolean;
          maxRedirects?: number;
        }
      | undefined;
    axios.post = (async (url, body, config) => {
      requestUrl = url;
      requestBody = body;
      requestConfig = config as typeof requestConfig;

      return {
        status: 201,
        statusText: "Created",
        config: config as never,
        headers: {
          "content-type": "application/json",
          "x-debug-session": ssid,
          "x-request-id": "request-123",
        },
        data: {
          result: "https://meli.la/generated",
          echoedSession: ssid,
        },
      };
    }) as typeof axios.post;
    const service = makeService([
      makeCredential(Marketplace.MERCADO_LIVRE, {
        affiliateId: "loce6396673",
        metadata: { ssid },
      }),
    ]);
    const result = await service.testMercadoLivreRawForUser(
      "test-user",
      "https://meli.la/2BCJSYh",
    );

    assert.equal(
      requestUrl,
      "https://www.mercadolivre.com.br/affiliate-program/api/v2/stripe/user/links",
    );
    assert.equal(requestConfig?.headers?.Cookie, `ssid=${ssid}`);
    assert.equal(
      requestConfig?.headers?.Origin,
      "https://produto.mercadolivre.com.br",
    );
    assert.equal(requestConfig?.headers?.["Sec-Fetch-Mode"], "cors");
    assert.equal(requestConfig?.maxRedirects, 0);
    assert.equal(requestConfig?.validateStatus?.(403), true);
    assert.deepEqual(requestBody, { url: "https://meli.la/2BCJSYh" });
    assert.deepEqual(result, {
      status: 201,
      responseHeaders: {
        "content-type": "application/json",
        "x-debug-session": "<REDACTED>",
        "x-request-id": "request-123",
      },
      requestHeaders: {
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "pt-BR,pt;q=0.9",
        Origin: "https://produto.mercadolivre.com.br",
        Referer: "https://produto.mercadolivre.com.br/",
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-site",
        "sec-ch-ua":
          '"Chromium";v="146", "Not-A.Brand";v="24", "Brave";v="146"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Linux"',
        "sec-gpc": "1",
        "Content-Type": "application/json",
        Cookie: "ssid=<REDACTED>",
      },
      requestBody: { url: "https://meli.la/2BCJSYh" },
      body: {
        result: "https://meli.la/generated",
        echoedSession: "<REDACTED>",
      },
    });
    assert.equal(JSON.stringify(result).includes(ssid), false);
  });

  it("keeps a non-JSON raw response as text", async () => {
    axios.post = (async (_url, _body, config) => ({
      status: 400,
      statusText: "Bad Request",
      config: config as never,
      headers: {},
      data: "plain response",
    })) as typeof axios.post;
    const service = makeService([
      makeCredential(Marketplace.MERCADO_LIVRE, {
        affiliateId: "loce6396673",
        metadata: { ssid: "secret-session" },
      }),
    ]);

    const result = await service.testMercadoLivreRawForUser(
      "test-user",
      "https://meli.la/2BCJSYh",
    );

    assert.equal(result.status, 400);
    assert.equal(result.body, "plain response");
  });

  it("uses a custom raw payload when supplied", async () => {
    let requestBody: unknown;
    axios.post = (async (_url, body, config) => {
      requestBody = body;

      return {
        status: 200,
        statusText: "OK",
        config: config as never,
        headers: {},
        data: {},
      };
    }) as typeof axios.post;
    const service = makeService([
      makeCredential(Marketplace.MERCADO_LIVRE, {
        affiliateId: "loce6396673",
        metadata: { ssid: "secret-session" },
      }),
    ]);
    const payload = { source: "manual", urls: ["https://meli.la/custom"] };

    const result = await service.testMercadoLivreRawForUser(
      "test-user",
      "https://meli.la/fallback",
      payload,
    );

    assert.deepEqual(requestBody, payload);
    assert.deepEqual(result.requestBody, payload);
  });
});
