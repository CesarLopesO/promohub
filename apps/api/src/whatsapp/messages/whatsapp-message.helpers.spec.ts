import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { extractLinks } from "./whatsapp-message.helpers";

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
