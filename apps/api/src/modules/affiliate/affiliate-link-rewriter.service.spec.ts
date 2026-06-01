import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NotFoundException } from "@nestjs/common";
import type { AffiliateCredential } from "@prisma/client";

import { AffiliateLinkRewriterService } from "./affiliate-link-rewriter.service";
import { Marketplace } from "./helpers/detect-marketplace";

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
  return new AffiliateLinkRewriterService({
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
  } as never);
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

  it("rewrites Mercado Livre links with affiliateId", async () => {
    const service = makeService([
      makeCredential(Marketplace.MERCADO_LIVRE, { affiliateId: "ml-aff" }),
    ]);

    const result = await service.rewriteUrlForUser(
      "test-user",
      "https://meli.la/xyz",
    );

    assert.equal(result.rewrittenUrl, "https://meli.la/xyz?aff_id=ml-aff");
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
        "https://meli.la/xyz?aff_id=ml-aff",
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

    assert.equal(result.rewrittenText, "Promo ML https://meli.la/abc?aff_id=ml-aff");
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
      "Ofertas https://amzn.to/abc?tag=meutag-20 e https://meli.la/xyz?aff_id=ml-aff",
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
});
