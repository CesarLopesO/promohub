import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { SupportButton } from "./support-button";
import { SupportChannels } from "./support-channels";

describe("SupportButton", () => {
  it("is mounted in the global root layout", async () => {
    const rootLayout = await readFile(
      new URL("../../app/layout.tsx", import.meta.url),
      "utf8",
    );

    assert.match(rootLayout, /<SupportButton \/>/);
    assert.match(renderToStaticMarkup(<SupportButton />), /href="\/support"/);
  });
});

describe("SupportChannels", () => {
  it("shows configured email with a mailto link", () => {
    const html = renderToStaticMarkup(
      <SupportChannels
        supportEmail="suporte@peppabot.com"
        supportWhatsappUrl=""
      />,
    );

    assert.match(html, />suporte@peppabot\.com</);
    assert.match(html, /href="mailto:suporte@peppabot\.com"/);
    assert.doesNotMatch(html, />WhatsApp</);
  });

  it("shows configured WhatsApp with safe external link attributes", () => {
    const html = renderToStaticMarkup(
      <SupportChannels
        supportEmail=""
        supportWhatsappUrl="https://wa.me/5538999999999"
      />,
    );

    assert.match(html, /href="https:\/\/wa\.me\/5538999999999"/);
    assert.match(html, /target="_blank"/);
    assert.match(html, /rel="noopener noreferrer"/);
    assert.doesNotMatch(html, />Email</);
  });

  it("hides empty channels and shows the empty state", () => {
    const html = renderToStaticMarkup(
      <SupportChannels supportEmail="" supportWhatsappUrl="" />,
    );

    assert.match(html, /Nenhum canal de suporte configurado no momento\./);
    assert.doesNotMatch(html, /mailto:/);
    assert.doesNotMatch(html, /target="_blank"/);
  });
});
