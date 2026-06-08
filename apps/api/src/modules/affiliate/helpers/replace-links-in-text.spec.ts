import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { replaceLinksInText } from "./replace-links-in-text";

describe("replaceLinksInText", () => {
  it("replaces original links with rewritten links", () => {
    assert.equal(
      replaceLinksInText("Oferta https://amzn.to/abc e https://meli.la/xyz", [
        {
          originalUrl: "https://amzn.to/abc",
          rewrittenUrl: "https://amzn.to/abc?tag=meutag-20",
        },
        {
          originalUrl: "https://meli.la/xyz",
          rewrittenUrl: "https://meli.la/affiliate-real",
        },
      ]),
      "Oferta https://amzn.to/abc?tag=meutag-20 e https://meli.la/affiliate-real",
    );
  });

  it("replaces all occurrences of the same link", () => {
    assert.equal(
      replaceLinksInText("https://amzn.to/abc https://amzn.to/abc", [
        {
          originalUrl: "https://amzn.to/abc",
          rewrittenUrl: "https://amzn.to/abc?tag=meutag-20",
        },
      ]),
      "https://amzn.to/abc?tag=meutag-20 https://amzn.to/abc?tag=meutag-20",
    );
  });
});
