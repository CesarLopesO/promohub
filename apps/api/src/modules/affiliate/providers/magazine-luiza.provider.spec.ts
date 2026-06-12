import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AffiliateCredential } from "@prisma/client";

import { MagazineLuizaAffiliateProvider } from "./magazine-luiza.provider";

function makeCredential(storeSlug: string | null): AffiliateCredential {
  return {
    id: "credential-id",
    userId: "user-id",
    marketplace: "magazine_luiza",
    affiliateId: null,
    apiKey: null,
    apiSecret: null,
    trackingId: null,
    storeSlug,
    metadata: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("MagazineLuizaAffiliateProvider", () => {
  const provider = new MagazineLuizaAffiliateProvider();
  const credential = makeCredential("magazineproafiliados");

  it("rewrites a common Magalu URL and preserves path, query and hash", async () => {
    const result = await provider.rewriteLink(
      "https://www.magazineluiza.com.br/smartphone-x/p/abc123/te/tezz/?utm_source=grupo#oferta",
      credential,
    );

    assert.equal(
      result.rewrittenUrl,
      "https://www.magazinevoce.com.br/magazineproafiliados/smartphone-x/p/abc123/te/tezz/?utm_source=grupo#oferta",
    );
    assert.equal(result.changed, true);
    assert.equal(result.canForward, true);
  });

  it("rewrites magalu.com.br and normalizes duplicate path slashes", async () => {
    const result = await provider.rewriteLink(
      "https://magalu.com.br//produto-x///p/abc123?utm=a",
      credential,
    );

    assert.equal(
      result.rewrittenUrl,
      "https://www.magazinevoce.com.br/magazineproafiliados/produto-x/p/abc123?utm=a",
    );
  });

  it("keeps a Magazine Você URL with the same slug", async () => {
    const originalUrl =
      "https://www.magazinevoce.com.br/magazineproafiliados/produto/p/abc";
    const result = await provider.rewriteLink(originalUrl, credential);

    assert.equal(result.rewrittenUrl, originalUrl);
    assert.equal(result.changed, false);
    assert.equal(result.canForward, true);
  });

  it("replaces another Magazine Você store slug", async () => {
    const result = await provider.rewriteLink(
      "https://www.magazinevoce.com.br/outraloja/produto/p/abc?utm=x#detalhes",
      credential,
    );

    assert.equal(
      result.rewrittenUrl,
      "https://www.magazinevoce.com.br/magazineproafiliados/produto/p/abc?utm=x#detalhes",
    );
  });

  it("returns MAGALU_CREDENTIAL_MISSING without a slug", async () => {
    const result = await provider.rewriteLink(
      "https://www.magazineluiza.com.br/produto/p/abc",
      makeCredential(null),
    );

    assert.equal(result.changed, false);
    assert.equal(result.canForward, false);
    assert.equal(result.reason, "MAGALU_CREDENTIAL_MISSING");
  });
});
