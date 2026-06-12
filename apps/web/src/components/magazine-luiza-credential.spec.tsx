import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import { normalizeMagazineLuizaStoreSlug } from "../lib/magazine-luiza-store-slug";

describe("Magazine Luiza credential card", () => {
  it("normalizes a valid store slug and rejects full URLs", () => {
    assert.equal(
      normalizeMagazineLuizaStoreSlug(" MagazineProAfiliados "),
      "magazineproafiliados",
    );
    assert.equal(
      normalizeMagazineLuizaStoreSlug(
        "https://www.magazinevoce.com.br/magazineproafiliados",
      ),
      null,
    );
  });

  it("is active, saves storeSlug and renders the dynamic tutorial", async () => {
    const page = await readFile(
      new URL("../../app/dashboard/credentials/page.tsx", import.meta.url),
      "utf8",
    );

    assert.match(page, /onSubmit=\{saveMagazineLuiza\}/);
    assert.match(page, /marketplace: "magazine_luiza"/);
    assert.match(page, /storeSlug,/);
    assert.doesNotMatch(
      page.match(
        /await saveCredential\(magazineLuizaCredential\?\.id,[\s\S]*?\n\s+\}\);/,
      )?.[0] ?? "",
      /affiliateId|trackingId|apiKey|apiSecret|metadata/,
    );
    assert.match(page, /marketplace="magazine_luiza"/);
    assert.match(page, /Salvar Magazine Luiza/);
  });
});
