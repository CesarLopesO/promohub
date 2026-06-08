import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";

import { AffiliateGeneratorConfigService } from "./affiliate-generator-config.service";

function makeService() {
  return new AffiliateGeneratorConfigService({
    affiliateGeneratorConfig: {
      upsert: async ({ create }: { create: unknown }) => create,
    },
  } as never);
}

describe("AffiliateGeneratorConfigService", () => {
  it("blocks Cookie and other sensitive headers", async () => {
    const service = makeService();

    for (const header of ["Cookie", "Authorization", "X-Meli-Session"]) {
      assert.throws(
        () =>
          service.upsert("mercado_livre", {
            method: "POST",
            url: "https://mercadolivre.com.br/generator",
            headers: { [header]: "sensitive-value" },
          }),
        BadRequestException,
      );
    }
  });

  it("blocks ssid anywhere in the stored template", async () => {
    assert.throws(
      () =>
        makeService().upsert("mercado_livre", {
          method: "POST",
          url: "https://mercadolivre.com.br/generator",
          bodyTemplate: { ssid: "do-not-store" },
        }),
      /must not contain ssid/,
    );
  });
});
