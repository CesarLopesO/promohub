import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  AdminPlanPricesForm,
  buildPlanPricesPayload,
  centsToReaisInput,
  reaisInputToCents,
} from "./admin-plan-prices";

function render() {
  return renderToStaticMarkup(
    <AdminPlanPricesForm
      basicPrice="79,90"
      proPrice="99,90"
      saving={false}
      saved={false}
      onBasicPriceChange={() => undefined}
      onProPriceChange={() => undefined}
      onSubmit={() => undefined}
    />,
  );
}

describe("AdminPlanPricesForm", () => {
  it("shows plan price fields for admins", () => {
    const html = render();

    assert.match(html, /Preços dos planos/);
    assert.match(html, /aria-label="BASIC"/);
    assert.match(html, /aria-label="PRO"/);
  });

  it("shows values in reais", () => {
    const html = render();

    assert.match(html, /value="79,90"/);
    assert.match(html, /value="99,90"/);
    assert.match(html, /R\$(?:\s|\u00a0)79,90/);
    assert.equal(centsToReaisInput(7_990), "79,90");
  });

  it("converts saved values to cents", () => {
    assert.deepEqual(buildPlanPricesPayload("79,90", "99.90"), {
      BASIC: 7_990,
      PRO: 9_990,
    });
    assert.equal(reaisInputToCents("R$ 1.234,56"), 123_456);
  });

  it("shows FREE as blocked and informative", () => {
    const html = render();

    assert.match(html, /FREE é sempre gratuito/);
    assert.match(html, /aria-label="FREE"/);
    assert.match(html, /disabled=""/);
    assert.match(html, /Alterações afetam novos checkouts/);
  });
});
