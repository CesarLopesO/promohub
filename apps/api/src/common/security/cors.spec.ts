import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createCorsOriginValidator, readCorsOrigins } from "./cors";

function validate(origins: string[], origin: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    createCorsOriginValidator(origins)(origin, (error, allowed) => {
      if (error) reject(error);
      else resolve(allowed === true);
    });
  });
}

describe("CORS configuration", () => {
  it("accepts an allowed origin", async () => {
    const origins = readCorsOrigins(
      "https://peppabot.com,https://admin.peppabot.com",
      "production",
    );
    assert.equal(await validate(origins, "https://peppabot.com"), true);
  });

  it("rejects a non-allowed origin in production", async () => {
    const origins = readCorsOrigins("https://peppabot.com", "production");
    await assert.rejects(
      () => validate(origins, "https://attacker.example"),
      /not allowed/i,
    );
  });

  it("rejects wildcard configuration in production", () => {
    assert.throws(() => readCorsOrigins("*", "production"), /cannot contain/);
  });
});
