import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderTemplate } from "./render-template";

describe("renderTemplate", () => {
  it("renders placeholders recursively", () => {
    assert.deepEqual(
      renderTemplate(
        {
          url: "{{resolvedUrl}}",
          nested: {
            item: "{{itemId}}",
            tag: "{{affiliateId}}",
          },
          original: "{{originalUrl}}",
        },
        {
          originalUrl: "https://meli.la/original",
          resolvedUrl: "https://mercadolivre.com.br/MLB-123456789",
          itemId: "MLB123456789",
          affiliateId: "loce6396673",
        },
      ),
      {
        url: "https://mercadolivre.com.br/MLB-123456789",
        nested: {
          item: "MLB123456789",
          tag: "loce6396673",
        },
        original: "https://meli.la/original",
      },
    );
  });
});
