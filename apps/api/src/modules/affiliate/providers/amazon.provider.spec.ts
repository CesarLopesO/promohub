import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { AffiliateCredential } from "@prisma/client";

import { AmazonAffiliateProvider } from "./amazon.provider";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function makeCredential(tag?: string): AffiliateCredential {
  return {
    id: "amazon-credential",
    userId: "test-user",
    marketplace: "amazon",
    affiliateId: null,
    apiKey: null,
    apiSecret: null,
    trackingId: tag ?? null,
    storeSlug: null,
    metadata: null,
    isActive: true,
    createdAt: new Date("2026-06-01T12:00:00.000Z"),
    updatedAt: new Date("2026-06-01T12:00:00.000Z"),
  };
}

describe("AmazonAffiliateProvider", () => {
  const provider = new AmazonAffiliateProvider();
  const tag = "descontai770f-20";

  it("adds the tag to a URL without query parameters", async () => {
    const result = await provider.rewriteLink(
      "https://www.amazon.com.br/dp/6555165766",
      makeCredential(tag),
    );

    assert.equal(
      result.rewrittenUrl,
      `https://www.amazon.com.br/dp/6555165766?tag=${tag}`,
    );
    assert.equal(result.changed, true);
    assert.equal(result.canForward, true);
    assert.equal(result.tag, tag);
  });

  it("normalizes a broken query and adds the tag", async () => {
    const result = await provider.rewriteLink(
      "https://www.amazon.com.br/dp/6555165766?&ref_=as_li_ss_tl",
      makeCredential(tag),
    );

    assert.equal(
      result.rewrittenUrl,
      `https://www.amazon.com.br/dp/6555165766?ref_=as_li_ss_tl&tag=${tag}`,
    );
  });

  it("replaces an incorrect tag", async () => {
    const result = await provider.rewriteLink(
      "https://amazon.com.br/dp/ABC?tag=wrong-20",
      makeCredential(tag),
    );

    assert.equal(
      result.rewrittenUrl,
      `https://amazon.com.br/dp/ABC?tag=${tag}`,
    );
    assert.equal(result.changed, true);
  });

  it("keeps a correct tag and allows forwarding", async () => {
    const url = `https://amazon.com/dp/ABC?tag=${tag}`;
    const result = await provider.rewriteLink(url, makeCredential(tag));

    assert.equal(result.rewrittenUrl, url);
    assert.equal(result.changed, false);
    assert.equal(result.canForward, true);
  });

  it("preserves other parameters and removes empty parameters", async () => {
    const result = await provider.rewriteLink(
      "https://amazon.com.br/dp/ABC?utm_source=promo&empty=&ref_=share",
      makeCredential(tag),
    );

    assert.equal(
      result.rewrittenUrl,
      `https://amazon.com.br/dp/ABC?utm_source=promo&ref_=share&tag=${tag}`,
    );
  });

  it("resolves amzn.to before applying the tag", async () => {
    globalThis.fetch = async () =>
      ({
        url: "https://www.amazon.com.br/dp/6555165766?ref_=short",
      }) as Response;

    const result = await provider.rewriteLink(
      "https://amzn.to/example",
      makeCredential(tag),
    );

    assert.equal(
      result.rewrittenUrl,
      `https://www.amazon.com.br/dp/6555165766?ref_=short&tag=${tag}`,
    );
    assert.equal(
      result.resolvedUrl,
      "https://www.amazon.com.br/dp/6555165766?ref_=short",
    );
    assert.equal(result.changed, true);
  });

  it("blocks forwarding when the tag is not configured", async () => {
    const url = "https://amazon.com.br/dp/ABC";
    const result = await provider.rewriteLink(url, makeCredential());

    assert.deepEqual(result, {
      rewrittenUrl: url,
      changed: false,
      canForward: false,
      reason: "AMAZON_TAG_NOT_CONFIGURED",
    });
  });
});
