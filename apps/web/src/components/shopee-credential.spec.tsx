import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("Shopee credential card", () => {
  it("is active and submits AppID and password without affiliate parameters", async () => {
    const page = await readFile(
      new URL("../../app/dashboard/credentials/page.tsx", import.meta.url),
      "utf8",
    );
    const saveBlock =
      page.match(
        /async function saveShopee[\s\S]*?\n\s+async function testMercadoLivre/,
      )?.[0] ?? "";

    assert.match(page, /onSubmit=\{saveShopee\}/);
    assert.match(page, /marketplace="shopee"/);
    assert.match(page, /Use as credenciais do portal de afiliados Shopee\./);
    assert.match(saveBlock, /marketplace: "shopee"/);
    assert.match(
      saveBlock,
      /shopeeAppId\.trim\(\) \? \{ appId: shopeeAppId\.trim\(\) \} : \{\}/,
    );
    assert.match(saveBlock, /password: shopeePassword\.trim\(\)/);
    assert.doesNotMatch(saveBlock, /affiliateId|trackingId/);
  });

  it("does not render or retain saved AppID or password", async () => {
    const page = await readFile(
      new URL("../../app/dashboard/credentials/page.tsx", import.meta.url),
      "utf8",
    );

    assert.match(page, /setShopeeAppId\(""\)/);
    assert.match(page, /setShopeePassword\(""\)/);
    assert.match(page, /type="password"/);
    assert.match(page, /shopeeHasAppId \? "Configurado" : "Não configurado"/);
    assert.doesNotMatch(page, /shopeeCredential\?\.appId/);
    assert.match(page, /hasSecret/);
  });
});
