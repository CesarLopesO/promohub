import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { BillingPaymentMethodSelector } from "./billing-payment-method";

describe("BillingPaymentMethodSelector", () => {
  it("shows flexible and recurring credit card options", () => {
    const html = renderToStaticMarkup(
      <BillingPaymentMethodSelector
        value="FLEXIBLE"
        onChange={() => undefined}
      />,
    );

    assert.match(html, /Pix, boleto ou cartão/);
    assert.match(html, /Cartão recorrente/);
    assert.match(html, /renova automaticamente a cada mês/);
    assert.match(html, /value="CREDIT_CARD_RECURRING"/);
  });
});
