import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  detectWhatsAppInviteLinks,
  replaceWhatsAppLinks,
} from "./whatsapp-link-rewriter";

describe("WhatsApp link rewriter", () => {
  const replacement = "https://chat.whatsapp.com/DESTINO";

  for (const url of [
    "chat.whatsapp.com/abc",
    "https://whatsapp.com/channel/abc",
    "https://wa.me/559999",
  ]) {
    it(`replaces ${url}`, () => {
      assert.equal(
        replaceWhatsAppLinks(`Oferta ${url}`, replacement).text,
        `Oferta ${replacement}`,
      );
    });
  }

  it("does not change text without a WhatsApp URL", () => {
    assert.deepEqual(replaceWhatsAppLinks("Fale pelo WhatsApp", replacement), {
      text: "Fale pelo WhatsApp",
      links: [],
      changed: false,
    });
  });

  it("keeps links and returns a warning without configuration", () => {
    const text = "Entre em https://chat.whatsapp.com/abc";
    assert.deepEqual(replaceWhatsAppLinks(text), {
      text,
      links: ["https://chat.whatsapp.com/abc"],
      changed: false,
      warning: "WHATSAPP_INVITE_REPLACEMENT_NOT_CONFIGURED",
    });
  });

  it("detects API and protocol links", () => {
    assert.deepEqual(
      detectWhatsAppInviteLinks(
        "https://api.whatsapp.com/send?phone=55 whatsapp://send?phone=55",
      ),
      ["https://api.whatsapp.com/send?phone=55", "whatsapp://send?phone=55"],
    );
  });
});
