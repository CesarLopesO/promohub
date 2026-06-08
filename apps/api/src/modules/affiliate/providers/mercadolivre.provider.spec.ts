import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { ConfigService } from "@nestjs/config";
import type { AffiliateCredential } from "@prisma/client";
import axios from "axios";

import { MercadoLivreLinkGeneratorService } from "../services/mercadolivre-link-generator.service";
import { MercadoLivreAffiliateProvider } from "./mercadolivre.provider";

const originalFetch = globalThis.fetch;
const originalPost = axios.post;
const originalGet = axios.get;

function makeCredential(metadata: object | null): AffiliateCredential {
  return {
    id: "ml-credential",
    userId: "test-user",
    marketplace: "mercado_livre",
    affiliateId: "loce6396673",
    trackingId: null,
    apiKey: null,
    apiSecret: null,
    metadata,
    isActive: true,
    createdAt: new Date("2026-06-01T12:00:00.000Z"),
    updatedAt: new Date("2026-06-01T12:00:00.000Z"),
  };
}

function makeProvider(generatorUrl?: string) {
  const config = new ConfigService({
    MERCADO_LIVRE_AFFILIATE_GENERATOR_URL: generatorUrl,
  });

  return new MercadoLivreAffiliateProvider(
    new MercadoLivreLinkGeneratorService(config),
  );
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  axios.post = originalPost;
  axios.get = originalGet;
  delete process.env.MERCADO_LIVRE_MODE;
});

describe("MercadoLivreAffiliateProvider", () => {
  it("resolves meli.la redirects and extracts the item id", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), init });

      if (init?.method === "HEAD") {
        const response = new Response(null, {
          status: 200,
          headers: {},
        });
        Object.defineProperty(response, "url", {
          value:
            "https://produto.mercadolivre.com.br/MLB-123456789-produto",
        });

        return response;
      }

      return new Response(null, { status: 200 });
    };
    let generatorBody: unknown;
    axios.post = (async (_url, body, config) => {
      generatorBody = body;

      return {
        status: 200,
        statusText: "OK",
        config: config as never,
        headers: {},
        data: { short_url: "https://meli.la/affiliate-real" },
      };
    }) as typeof axios.post;
    const provider = makeProvider("https://generator.example/link");
    const result = await provider.rewriteLink(
      "https://meli.la/2BCJSYh",
      makeCredential({ ssid: "secret-session" }),
    );

    assert.equal(
      result.resolvedUrl,
      "https://produto.mercadolivre.com.br/MLB-123456789-produto",
    );
    assert.equal(result.itemId, "MLB123456789");
    assert.equal(result.rewrittenUrl, "https://meli.la/affiliate-real");
    assert.deepEqual(generatorBody, {
      tag: "loce6396673",
      url: "https://produto.mercadolivre.com.br/MLB-123456789-produto",
    });
  });

  it("extracts origin_url from a social link before generating a new short URL", async () => {
    const socialUrl =
      "https://www.mercadolivre.com.br/social/creator/lists/list-id";
    const productUrl =
      "https://produto.mercadolivre.com.br/MLB-5943120120-kit-produto-_JM";
    globalThis.fetch = async (_url, init) => {
      if (init?.method === "HEAD") {
        const response = new Response(null, { status: 200 });
        Object.defineProperty(response, "url", { value: socialUrl });
        return response;
      }

      return new Response(null, { status: 200 });
    };
    let socialCookie = "";
    axios.get = (async (_url, config) => {
      socialCookie =
        (config?.headers as Record<string, string> | undefined)?.Cookie ?? "";

      return {
        status: 200,
        statusText: "OK",
        config: config as never,
        headers: {},
        data: `<script>window.__DATA__={"origin_url":"${productUrl}"}</script>`,
      };
    }) as typeof axios.get;
    let generatorBody: unknown;
    axios.post = (async (_url, body, config) => {
      generatorBody = body;

      return {
        status: 200,
        statusText: "OK",
        config: config as never,
        headers: {},
        data: { short_url: "https://meli.la/new-affiliate-link" },
      };
    }) as typeof axios.post;
    const result = await makeProvider().rewriteLink(
      "https://meli.la/social-link",
      makeCredential({ ssid: "secret-session" }),
    );

    assert.equal(socialCookie, "ssid=secret-session");
    assert.deepEqual(generatorBody, {
      tag: "loce6396673",
      url: productUrl,
    });
    assert.equal(result.changed, true);
    assert.equal(result.rewrittenUrl, "https://meli.la/new-affiliate-link");
    assert.equal(result.resolvedUrl, socialUrl);
    assert.equal(result.itemId, "MLB5943120120");
  });

  it("returns unchanged when a social link has no product origin", async () => {
    const socialUrl =
      "https://www.mercadolivre.com.br/social/creator/lists/list-id";
    globalThis.fetch = async (_url, init) => {
      const response = new Response(null, { status: 200 });

      if (init?.method === "HEAD") {
        Object.defineProperty(response, "url", { value: socialUrl });
      }

      return response;
    };
    axios.get = (async (_url, config) => ({
      status: 200,
      statusText: "OK",
      config: config as never,
      headers: {},
      data: "<html><body>Social list without product</body></html>",
    })) as typeof axios.get;
    let generatorCalled = false;
    axios.post = (async () => {
      generatorCalled = true;
      throw new Error("generator should not be called");
    }) as typeof axios.post;

    const result = await makeProvider().rewriteLink(
      "https://meli.la/social-link",
      makeCredential({ ssid: "secret-session" }),
    );

    assert.equal(result.changed, false);
    assert.equal(result.reason, "MERCADO_LIVRE_SOCIAL_ORIGIN_NOT_FOUND");
    assert.equal(generatorCalled, false);
  });

  it("fails without ssid", async () => {
    const result = await makeProvider("https://generator.example/link").rewriteLink(
      "https://meli.la/2BCJSYh",
      makeCredential(null),
    );

    assert.equal(result.changed, false);
    assert.equal(result.reason, "MISSING_MERCADO_LIVRE_SESSION");
  });

  it("uses the official endpoint when no override is configured", async () => {
    let requestedUrl = "";
    axios.post = (async (url, _body, config) => {
      requestedUrl = url;
      return {
        status: 200,
        statusText: "OK",
        config: config as never,
        headers: {},
        data: { short_url: "https://meli.la/official" },
      };
    }) as typeof axios.post;
    const result = await makeProvider().rewriteLink(
      "https://mercadolivre.com.br/MLB-123456789-produto",
      makeCredential({ sessionToken: "secret-session" }),
    );

    assert.equal(result.changed, true);
    assert.equal(
      requestedUrl,
      "https://www.mercadolivre.com.br/affiliate-program/api/v2/stripe/user/links",
    );
    assert.equal(result.rewrittenUrl, "https://meli.la/official");
  });

  it("uses aff_id only in legacy mode and returns a warning", async () => {
    process.env.MERCADO_LIVRE_MODE = "legacy";
    const result = await makeProvider().rewriteLink(
      "https://mercadolivre.com.br/MLB-123456789-produto",
      makeCredential({ ssid: "secret-session" }),
    );

    assert.equal(result.changed, true);
    assert.equal(result.mode, "legacy");
    assert.equal(result.warning, "Modo legado não garante comissão.");
    assert.equal(result.rewrittenUrl.includes("aff_id=loce6396673"), true);
  });

  it("does not change links in disabled mode", async () => {
    process.env.MERCADO_LIVRE_MODE = "disabled";
    const result = await makeProvider().rewriteLink(
      "https://meli.la/2BCJSYh",
      makeCredential({ ssid: "secret-session" }),
    );

    assert.equal(result.changed, false);
    assert.equal(result.mode, "disabled");
    assert.equal(result.reason, "MERCADO_LIVRE_DISABLED");
  });
});
