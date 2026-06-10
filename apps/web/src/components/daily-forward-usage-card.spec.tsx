import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  DailyForwardUsageCard,
  type DailyForwardUsage,
} from "./daily-forward-usage-card";

function render(
  plan: DailyForwardUsage["plan"],
  forwardsToday: number,
  dailyForwardLimit: number | null,
) {
  return renderToStaticMarkup(
    <DailyForwardUsageCard
      usage={{
        plan,
        limits: { dailyForwardLimit },
        usage: {
          forwardsToday,
          dailyForwardRemaining:
            dailyForwardLimit === null
              ? null
              : Math.max(dailyForwardLimit - forwardsToday, 0),
        },
      }}
    />,
  );
}

describe("DailyForwardUsageCard", () => {
  it("shows FREE daily progress", () => {
    const html = render("FREE", 42, 100);

    assert.match(html, /Mensagens encaminhadas hoje/);
    assert.match(html, /42 \/ 100/);
    assert.match(html, /role="progressbar"/);
  });

  it("warns FREE users at 80 percent", () => {
    const html = render("FREE", 80, 100);

    assert.match(html, /Você está perto do limite diário do plano FREE\./);
  });

  it("shows the reached state and upgrade action at 100 percent", () => {
    const html = render("FREE", 100, 100);

    assert.match(html, /Limite diário atingido\./);
    assert.match(html, /Fazer upgrade/);
    assert.match(html, /href="\/dashboard\/billing"/);
  });

  it("shows unlimited usage for BASIC and PRO", () => {
    for (const plan of ["BASIC", "PRO"] as const) {
      const html = render(plan, 250, null);

      assert.match(html, /Mensagens encaminhadas hoje: 250/);
      assert.match(html, /Ilimitado no seu plano/);
      assert.doesNotMatch(html, /role="progressbar"/);
    }
  });
});
