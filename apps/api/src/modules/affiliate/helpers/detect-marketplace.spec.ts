import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { detectMarketplace, Marketplace } from "./detect-marketplace";

describe("detectMarketplace", () => {
  it("detects Amazon URLs", () => {
    assert.equal(
      detectMarketplace("https://amazon.com/dp/abc"),
      Marketplace.AMAZON,
    );
    assert.equal(
      detectMarketplace("https://www.amazon.com.br/dp/abc"),
      Marketplace.AMAZON,
    );
    assert.equal(detectMarketplace("https://amzn.to/abc"), Marketplace.AMAZON);
  });

  it("detects Mercado Livre URLs", () => {
    assert.equal(
      detectMarketplace("https://mercadolivre.com.br/oferta"),
      Marketplace.MERCADO_LIVRE,
    );
    assert.equal(
      detectMarketplace("https://mercadolivre.com/oferta"),
      Marketplace.MERCADO_LIVRE,
    );
    assert.equal(
      detectMarketplace("https://meli.la/abc"),
      Marketplace.MERCADO_LIVRE,
    );
  });

  it("detects Shopee URLs", () => {
    assert.equal(
      detectMarketplace("https://shopee.com.br/product/abc"),
      Marketplace.SHOPEE,
    );
    assert.equal(
      detectMarketplace("https://shopee.com/product/abc"),
      Marketplace.SHOPEE,
    );
    assert.equal(detectMarketplace("https://shope.ee/abc"), Marketplace.SHOPEE);
  });

  it("detects Magazine Luiza and Magazine Você URLs", () => {
    for (const url of [
      "https://www.magazineluiza.com.br/produto/p/abc",
      "https://magalu.com.br/produto/p/abc",
      "https://www.magalu.com/produto/p/abc",
      "https://www.magazinevoce.com.br/minhaloja/produto/p/abc",
    ]) {
      assert.equal(detectMarketplace(url), Marketplace.MAGAZINE_LUIZA);
    }
  });

  it("returns unknown for unsupported URLs", () => {
    assert.equal(
      detectMarketplace("https://example.com/abc"),
      Marketplace.UNKNOWN,
    );
  });
});
