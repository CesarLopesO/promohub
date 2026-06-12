import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AffiliateCredential } from "@prisma/client";

import { ShopeeAffiliateProvider } from "./shopee.provider";

function makeCredential(
  apiKey: string | null,
  apiSecret: string | null,
): AffiliateCredential {
  return {
    id: "credential-id",
    userId: "user-id",
    marketplace: "shopee",
    affiliateId: null,
    apiKey,
    apiSecret,
    trackingId: null,
    storeSlug: null,
    metadata: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("ShopeeAffiliateProvider", () => {
  const provider = new ShopeeAffiliateProvider();

  it("does not invent an affiliate parameter when the generator is absent", async () => {
    const originalUrl = "https://shope.ee/abc";
    const appId = "private-app-id";
    const secret = "private-secret";
    const logs: string[] = [];
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    console.log = (...values: unknown[]) => logs.push(values.join(" "));
    console.warn = (...values: unknown[]) => logs.push(values.join(" "));
    console.error = (...values: unknown[]) => logs.push(values.join(" "));

    let result;
    try {
      result = await provider.rewriteLink(
        originalUrl,
        makeCredential(appId, secret),
      );
    } finally {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    }

    assert.equal(result.rewrittenUrl, originalUrl);
    assert.equal(result.changed, false);
    assert.equal(result.canForward, true);
    assert.equal(result.reason, "SHOPEE_GENERATOR_NOT_IMPLEMENTED");
    assert.equal(
      result.warning,
      "Shopee está com credenciais salvas, mas a geração automática ainda não foi ativada.",
    );
    assert.doesNotMatch(
      JSON.stringify(result),
      new RegExp(`${appId}|${secret}`),
    );
    assert.doesNotMatch(logs.join("\n"), new RegExp(`${appId}|${secret}`));
  });

  it("returns SHOPEE_CREDENTIAL_MISSING without AppID or password", async () => {
    const result = await provider.rewriteLink(
      "https://www.shopee.com.br/product/abc",
      makeCredential(null, null),
    );

    assert.equal(result.changed, false);
    assert.equal(result.canForward, true);
    assert.equal(result.reason, "SHOPEE_CREDENTIAL_MISSING");
  });
});
