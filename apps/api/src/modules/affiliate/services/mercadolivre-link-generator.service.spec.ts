import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { ConfigService } from "@nestjs/config";
import axios from "axios";

import {
  MercadoLivreLinkGeneratorService,
  MercadoLivreSessionInvalidError,
} from "./mercadolivre-link-generator.service";

const originalPost = axios.post;
const originalGet = axios.get;
const originalLog = console.log;

afterEach(() => {
  axios.post = originalPost;
  axios.get = originalGet;
  console.log = originalLog;
});

function makeService(envUrl?: string) {
  return new MercadoLivreLinkGeneratorService(
    new ConfigService({
      MERCADO_LIVRE_AFFILIATE_GENERATOR_URL: envUrl,
    }),
  );
}

const params = {
  originalUrl: "https://meli.la/original",
  resolvedUrl:
    "https://produto.mercadolivre.com.br/MLB-123456789-produto",
  itemId: "MLB123456789",
  affiliateId: "loce6396673",
  ssid: "top-secret-session",
};

function response(status: number, data: unknown, headers: object = {}) {
  return {
    status,
    statusText: String(status),
    config: {} as never,
    headers,
    data,
  };
}

describe("MercadoLivreLinkGeneratorService", () => {
  it("extracts official response URL fields", () => {
    const service = makeService();

    assert.equal(
      service.extractAffiliateUrl({ short_url: "https://meli.la/direct" }),
      "https://meli.la/direct",
    );
    assert.equal(
      service.extractAffiliateUrl({
        data: { short_url: "https://meli.la/nested" },
      }),
      "https://meli.la/nested",
    );
    assert.equal(
      service.extractAffiliateUrl({ data: { url: "https://meli.la/url" } }),
      "https://meli.la/url",
    );
  });

  it("uses the official default endpoint, payload, and browser headers", async () => {
    let requestedUrl = "";
    let requestedBody: unknown;
    let requestedConfig: { headers?: Record<string, string> } | undefined;
    axios.post = (async (url, body, config) => {
      requestedUrl = url;
      requestedBody = body;
      requestedConfig = config as typeof requestedConfig;

      return response(200, { short_url: "https://meli.la/generated" });
    }) as typeof axios.post;

    assert.equal(
      await makeService().generateAffiliateLink(params),
      "https://meli.la/generated",
    );
    assert.equal(
      requestedUrl,
      "https://www.mercadolivre.com.br/affiliate-program/api/v2/stripe/user/links",
    );
    assert.deepEqual(requestedBody, {
      tag: "loce6396673",
      url: params.resolvedUrl,
    });
    assert.equal(
      requestedConfig?.headers?.Origin,
      "https://produto.mercadolivre.com.br",
    );
    assert.equal(
      requestedConfig?.headers?.Cookie,
      `ssid=${params.ssid}`,
    );
    assert.equal("originalUrl" in (requestedBody as object), false);
  });

  it("allows the endpoint to be overridden by env", async () => {
    let requestedUrl = "";
    axios.post = (async (url) => {
      requestedUrl = url;
      return response(200, { url: "https://meli.la/generated" });
    }) as typeof axios.post;

    await makeService("https://env.example/generator").generateAffiliateLink(
      params,
    );

    assert.equal(requestedUrl, "https://env.example/generator");
  });

  it("discovers a csrf cookie and retries once", async () => {
    const calls: Array<{ headers?: Record<string, string> }> = [];
    axios.post = (async (_url, _body, config) => {
      calls.push(config as { headers?: Record<string, string> });

      return calls.length === 1
        ? response(403, { message: "csrf required" })
        : response(200, { short_url: "https://meli.la/generated" });
    }) as typeof axios.post;
    axios.get = (async () =>
      response(200, "", {
        "set-cookie": ["_csrf=csrf-token-123; Path=/; Secure"],
      })) as typeof axios.get;

    assert.equal(
      await makeService().generateAffiliateLink(params),
      "https://meli.la/generated",
    );
    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.headers?.["x-csrf-token"], undefined);
    assert.equal(calls[1]?.headers?.["x-csrf-token"], "csrf-token-123");
  });

  it("uses csrf from the supplied cookie without a discovery request", async () => {
    let getCalled = false;
    const csrfHeaders: Array<string | undefined> = [];
    axios.get = (async () => {
      getCalled = true;
      return response(200, "");
    }) as typeof axios.get;
    axios.post = (async (_url, _body, config) => {
      csrfHeaders.push(
        (config?.headers as Record<string, string>)["x-csrf-token"],
      );
      return csrfHeaders.length === 1
        ? response(403, { message: "csrf required" })
        : response(200, { short_url: "https://meli.la/generated" });
    }) as typeof axios.post;

    await makeService().generateAffiliateLink({
      ...params,
      ssid: `ssid=${params.ssid}; _csrf=cookie-csrf`,
    });

    assert.deepEqual(csrfHeaders, [undefined, "cookie-csrf"]);
    assert.equal(getCalled, false);
  });

  it("reports an invalid or expired session after csrf retry fails", async () => {
    axios.post = (async () => response(403, "forbidden")) as typeof axios.post;
    axios.get = (async () => response(200, "")) as typeof axios.get;

    await assert.rejects(
      () => makeService().generateAffiliateLink(params),
      MercadoLivreSessionInvalidError,
    );
  });

  it("never logs the ssid or csrf", async () => {
    const logs: string[] = [];
    console.log = (...values: unknown[]) => {
      logs.push(values.map(String).join(" "));
    };
    axios.post = (async () =>
      response(200, { short_url: "https://meli.la/generated" })) as typeof axios.post;

    await makeService().generateAffiliateLink({
      ...params,
      csrfToken: "secret-csrf",
    });

    const output = logs.join("\n");
    assert.equal(output.includes(params.ssid), false);
    assert.equal(output.includes("secret-csrf"), false);
    assert.equal(output.toLowerCase().includes("cookie"), false);
  });
});
