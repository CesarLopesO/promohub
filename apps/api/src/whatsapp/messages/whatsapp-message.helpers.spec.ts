import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { WAMessage } from "@whiskeysockets/baileys";

import {
  extractLinks,
  extractMessageText,
  isProtocolMessage,
  isReactionMessage,
} from "./whatsapp-message.helpers";

describe("extractLinks", () => {
  it("captures https amzn.to links", () => {
    assert.deepEqual(extractLinks("https://amzn.to/abc"), [
      "https://amzn.to/abc",
    ]);
  });

  it("normalizes amzn.to links without protocol", () => {
    assert.deepEqual(extractLinks("amzn.to/abc"), ["https://amzn.to/abc"]);
  });

  it("captures https meli.la links", () => {
    assert.deepEqual(extractLinks("https://meli.la/abc"), [
      "https://meli.la/abc",
    ]);
  });

  it("normalizes meli.la links without protocol", () => {
    assert.deepEqual(extractLinks("meli.la/abc"), ["https://meli.la/abc"]);
  });

  it("captures https shope.ee links", () => {
    assert.deepEqual(extractLinks("https://shope.ee/abc"), [
      "https://shope.ee/abc",
    ]);
  });

  it("normalizes Magazine Luiza links without protocol", () => {
    assert.deepEqual(extractLinks("www.magazineluiza.com.br/produto/p/abc"), [
      "https://www.magazineluiza.com.br/produto/p/abc",
    ]);
    assert.deepEqual(extractLinks("magalu.com.br/produto/p/abc"), [
      "https://magalu.com.br/produto/p/abc",
    ]);
  });

  it("captures multiple links in the same text", () => {
    assert.deepEqual(
      extractLinks("Oferta boa https://amzn.to/teste e meli.la/abc."),
      ["https://amzn.to/teste", "https://meli.la/abc"],
    );
  });

  it("removes trailing punctuation", () => {
    assert.deepEqual(extractLinks("Compre em https://amzn.to/abc."), [
      "https://amzn.to/abc",
    ]);
  });

  it("returns an empty array when there are no links", () => {
    assert.deepEqual(extractLinks("sem oferta hoje"), []);
  });

  it("returns an empty array for null text", () => {
    assert.deepEqual(extractLinks(null), []);
  });
});

describe("WhatsApp message content", () => {
  it("extracts text from ephemeral image captions", () => {
    const message = {
      message: {
        ephemeralMessage: {
          message: {
            imageMessage: {
              caption: "Oferta https://meli.la/teste",
            },
          },
        },
      },
    } as WAMessage;

    assert.equal(extractMessageText(message), "Oferta https://meli.la/teste");
  });

  it("detects reaction and protocol messages", () => {
    assert.equal(
      isReactionMessage({
        message: { reactionMessage: { text: "👍" } },
      } as WAMessage),
      true,
    );
    assert.equal(
      isProtocolMessage({
        message: { protocolMessage: { type: 0 } },
      } as WAMessage),
      true,
    );
  });
});
