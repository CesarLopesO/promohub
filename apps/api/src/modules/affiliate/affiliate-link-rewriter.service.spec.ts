import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { NotFoundException } from "@nestjs/common";
import type { AffiliateCredential } from "@prisma/client";
import axios from "axios";

import { AffiliateLinkRewriterService } from "./affiliate-link-rewriter.service";
import { Marketplace } from "./helpers/detect-marketplace";

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
    text: "Loja oficial Amazon: https://amzn.to/abc",
    links: ["https://amzn.to/abc"],
    ...overrides,
  };
}

function makeService(
  credentials: AffiliateCredential[],
  messages: StoredMessage[] = [],
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
    } as never,
    {
      rewriteLink: async (originalUrl: string) => ({
        rewrittenUrl: `https://affiliate.mercadolivre.com/link?source=${encodeURIComponent(originalUrl)}`,
        changed: true,
        resolvedUrl: originalUrl,
      }),
    } as never,
  );
}

describe("AffiliateLinkRewriterService", () => {
  it("rewrites Amazon links with trackingId", async () => {
    const service = makeService([
      makeCredential(Marketplace.AMAZON, { trackingId: "meutag-20" }),
    ]);

    assert.deepEqual(
      await service.rewriteUrlForUser("test-user", "https://amzn.to/abc"),
      {
        originalUrl: "https://amzn.to/abc",
        rewrittenUrl: "https://amzn.to/abc?tag=meutag-20",
        marketplace: Marketplace.AMAZON,
        changed: true,
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

    assert.equal(result.rewrittenUrl, "https://amazon.com/dp/abc?tag=fallback-20");
  });

  it("rewrites Mercado Livre links with the real provider result", async () => {
    const service = makeService([
      makeCredential(Marketplace.MERCADO_LIVRE, { affiliateId: "ml-aff" }),
    ]);

    const result = await service.rewriteUrlForUser(
      "test-user",
      "https://meli.la/xyz",
    );

    assert.match(result.rewrittenUrl, /^https:\/\/affiliate\.mercadolivre\.com/);
    assert.equal(result.changed, true);
    assert.equal(result.affiliateUrl, result.rewrittenUrl);
  });

  it("rewrites Shopee links with affiliateId", async () => {
    const service = makeService([
      makeCredential(Marketplace.SHOPEE, { affiliateId: "shopee-aff" }),
    ]);

    const result = await service.rewriteUrlForUser(
      "test-user",
      "https://shope.ee/abc",
    );

    assert.equal(result.rewrittenUrl, "https://shope.ee/abc?affiliate=shopee-aff");
  });

  it("preserves existing query params", async () => {
    const service = makeService([
      makeCredential(Marketplace.AMAZON, { trackingId: "meutag-20" }),
    ]);

    const result = await service.rewriteUrlForUser(
      "test-user",
      "https://amzn.to/abc?utm=a",
    );

    assert.equal(result.rewrittenUrl, "https://amzn.to/abc?utm=a&tag=meutag-20");
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
      await service.rewriteUrlForUser("test-user", "https://amzn.to/abc"),
      {
        originalUrl: "https://amzn.to/abc",
        rewrittenUrl: "https://amzn.to/abc",
        marketplace: Marketplace.AMAZON,
        changed: false,
        reason: "MISSING_CREDENTIAL",
      },
    );
  });

  it("rewrites links in batch", async () => {
    const service = makeService([
      makeCredential(Marketplace.AMAZON, { trackingId: "meutag-20" }),
      makeCredential(Marketplace.MERCADO_LIVRE, { affiliateId: "ml-aff" }),
    ]);

    const result = await service.rewriteUrlsForUser("test-user", [
      "https://amzn.to/abc",
      "https://meli.la/xyz",
    ]);

    assert.deepEqual(
      result.map((item) => item.rewrittenUrl),
      [
        "https://amzn.to/abc?tag=meutag-20",
        "https://affiliate.mercadolivre.com/link?source=https%3A%2F%2Fmeli.la%2Fxyz",
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
        originalText: "Loja oficial Amazon: https://amzn.to/abc",
        rewrittenText:
          "Loja oficial Amazon: https://amzn.to/abc?tag=meutag-20",
        rewrites: [
          {
            originalUrl: "https://amzn.to/abc",
            rewrittenUrl: "https://amzn.to/abc?tag=meutag-20",
            marketplace: Marketplace.AMAZON,
            changed: true,
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
      "Promo ML https://affiliate.mercadolivre.com/link?source=https%3A%2F%2Fmeli.la%2Fabc",
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
          text: "Ofertas https://amzn.to/abc e https://meli.la/xyz",
          links: ["https://amzn.to/abc", "https://meli.la/xyz"],
        }),
      ],
    );

    const result = await service.rewriteMessageForUser(
      "test-user",
      "message-id",
    );

    assert.equal(
      result.rewrittenText,
      "Ofertas https://amzn.to/abc?tag=meutag-20 e https://affiliate.mercadolivre.com/link?source=https%3A%2F%2Fmeli.la%2Fxyz",
    );
    assert.equal(result.changed, true);
    assert.equal(result.rewrites.length, 2);
  });

  it("returns EMPTY_TEXT for messages without text", async () => {
    const service = makeService([], [makeMessage({ text: null, links: [] })]);

    assert.deepEqual(
      await service.rewriteMessageForUser("test-user", "message-id"),
      {
        messageId: "message-id",
        changed: false,
        rewrites: [],
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
    assert.equal(result.rewrittenText, "Loja oficial Amazon: https://amzn.to/abc");
    assert.deepEqual(result.rewrites, [
      {
        originalUrl: "https://amzn.to/abc",
        rewrittenUrl: "https://amzn.to/abc",
        marketplace: Marketplace.AMAZON,
        changed: false,
        reason: "MISSING_CREDENTIAL",
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
    let requestConfig: {
      headers?: Record<string, string>;
      validateStatus?: (status: number) => boolean;
      maxRedirects?: number;
    } | undefined;
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
    assert.equal(
      requestConfig?.headers?.Cookie,
      `ssid=${ssid}`,
    );
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
