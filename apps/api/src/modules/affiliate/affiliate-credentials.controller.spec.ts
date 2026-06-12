import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AffiliateCredentialsController } from "./affiliate-credentials.controller";

describe("AffiliateCredentialsController", () => {
  it("forwards storeSlug from the authenticated request to the service", async () => {
    let received: unknown;
    const controller = new AffiliateCredentialsController({
      create: async (body: unknown) => {
        received = body;
        return {
          id: "credential-id",
          userId: "user-id",
          marketplace: "magazine_luiza",
          storeSlug: "magazineproafiliados",
          hasApiKey: false,
          hasApiSecret: false,
          hasSessionToken: false,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
    } as never);

    const result = await controller.create(
      {
        marketplace: "magazine_luiza",
        storeSlug: "magazineproafiliados",
      },
      { user: { id: "user-id" } } as never,
    );

    assert.deepEqual(received, {
      marketplace: "magazine_luiza",
      storeSlug: "magazineproafiliados",
      userId: "user-id",
    });
    assert.equal(result.storeSlug, "magazineproafiliados");
  });
});
