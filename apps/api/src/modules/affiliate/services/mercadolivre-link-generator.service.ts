import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { type AxiosResponse } from "axios";

export type MercadoLivreLinkGeneratorParams = {
  originalUrl: string;
  resolvedUrl?: string;
  itemId?: string;
  affiliateId: string;
  ssid: string;
  csrfToken?: string;
};

const DEFAULT_GENERATOR_URL =
  "https://www.mercadolivre.com.br/affiliate-program/api/v2/stripe/user/links";

export class MercadoLivreGeneratorConfigMissingError extends Error {
  readonly code = "MERCADO_LIVRE_GENERATOR_URL_MISSING";

  constructor() {
    super("MERCADO_LIVRE_GENERATOR_URL_MISSING");
    this.name = "MercadoLivreGeneratorConfigMissingError";
  }
}

export class MercadoLivreSessionInvalidError extends Error {
  readonly code = "MERCADO_LIVRE_SESSION_INVALID";

  constructor() {
    super("MERCADO_LIVRE_SESSION_INVALID");
    this.name = "MercadoLivreSessionInvalidError";
  }
}

export class MercadoLivreGeneratorRequestError extends Error {
  constructor(readonly status: number) {
    super(`Generator request failed with status ${status}`);
    this.name = "MercadoLivreGeneratorRequestError";
  }
}

@Injectable()
export class MercadoLivreLinkGeneratorService {
  constructor(private readonly config: ConfigService) {}

  async generateAffiliateLink(
    params: MercadoLivreLinkGeneratorParams,
  ): Promise<string> {
    const endpoint = this.config
      .get<string>("MERCADO_LIVRE_AFFILIATE_GENERATOR_URL")
      ?.trim() || DEFAULT_GENERATOR_URL;
    const cookie = this.buildCookieHeader(params.ssid);
    const payload = {
      tag: params.affiliateId,
      url: params.resolvedUrl ?? params.originalUrl,
    };
    const availableCsrfToken =
      params.csrfToken?.trim() || this.extractCookie(cookie, "_csrf");
    let response = await this.postGenerator(
      endpoint,
      payload,
      cookie,
    );
    console.log("[ML_AFFILIATE] request sent");

    if (
      [400, 403].includes(response.status) &&
      this.shouldRetryWithCsrf(response)
    ) {
      const csrfToken =
        availableCsrfToken ||
        (await this.discoverCsrfToken(
          params.resolvedUrl ?? params.originalUrl,
          cookie,
        ));

      if (csrfToken) {
        response = await this.postGenerator(
          endpoint,
          payload,
          cookie,
          csrfToken,
        );
      }
    }

    if ([401, 403].includes(response.status)) {
      throw new MercadoLivreSessionInvalidError();
    }

    if (response.status < 200 || response.status >= 300) {
      throw new MercadoLivreGeneratorRequestError(response.status);
    }

    const affiliateUrl = this.extractAffiliateUrl(response.data);

    if (!affiliateUrl) {
      throw new Error("Generator response did not contain an affiliate URL");
    }

    console.log("[ML_AFFILIATE] response parsed");

    return affiliateUrl;
  }

  extractAffiliateUrl(body: unknown): string | undefined {
    if (typeof body === "string") {
      try {
        return this.extractAffiliateUrl(JSON.parse(body) as unknown);
      } catch {
        return undefined;
      }
    }

    if (!body || typeof body !== "object") {
      return undefined;
    }

    const response = body as Record<string, unknown>;
    return typeof response.short_url === "string" &&
      this.isHttpUrl(response.short_url)
      ? response.short_url
      : undefined;
  }

  private postGenerator(
    endpoint: string,
    payload: { tag: string; url: string },
    cookie: string,
    csrfToken?: string,
  ) {
    return axios.post(endpoint, payload, {
      headers: this.browserHeaders(cookie, csrfToken),
      validateStatus: () => true,
      maxRedirects: 0,
    });
  }

  private async discoverCsrfToken(
    productUrl: string,
    cookie: string,
  ): Promise<string | undefined> {
    try {
      const response = await axios.get(productUrl, {
        headers: this.browserHeaders(cookie),
        validateStatus: () => true,
        maxRedirects: 0,
      });
      const setCookie = response.headers["set-cookie"];
      const cookies = Array.isArray(setCookie)
        ? setCookie
        : typeof setCookie === "string"
          ? [setCookie]
          : [];

      for (const value of cookies) {
        const token = this.extractCookie(value, "_csrf");

        if (token) {
          return token;
        }
      }
    } catch {
      return undefined;
    }

    return undefined;
  }

  private shouldRetryWithCsrf(response: AxiosResponse): boolean {
    if (response.status === 403) {
      return true;
    }

    return (
      response.status === 400 &&
      JSON.stringify(response.data).toLowerCase().includes("csrf")
    );
  }

  private browserHeaders(cookie: string, csrfToken?: string) {
    return {
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "pt-BR,pt;q=0.9",
      "Content-Type": "application/json",
      Origin: "https://produto.mercadolivre.com.br",
      Referer: "https://produto.mercadolivre.com.br/",
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-site",
      "sec-ch-ua":
        '"Chromium";v="146", "Not-A.Brand";v="24", "Brave";v="146"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Linux"',
      "sec-gpc": "1",
      Cookie: cookie,
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
    };
  }

  private buildCookieHeader(ssid: string): string {
    const normalized = ssid.trim();

    return /(?:^|;\s*)ssid=/i.test(normalized)
      ? normalized
      : `ssid=${normalized}`;
  }

  private extractCookie(cookieHeader: string, name: string): string | undefined {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = cookieHeader.match(
      new RegExp(`(?:^|[,;]\\s*)${escapedName}=([^;,\\s]+)`, "i"),
    );

    return match?.[1];
  }

  private isHttpUrl(value: string): boolean {
    try {
      return ["http:", "https:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }
}
