import { Injectable } from "@nestjs/common";
import type { AffiliateCredential } from "@prisma/client";
import axios from "axios";
import { load } from "cheerio";

import {
  MercadoLivreGeneratorConfigMissingError,
  MercadoLivreGeneratorRequestError,
  MercadoLivreLinkGeneratorService,
  MercadoLivreSessionInvalidError,
} from "../services/mercadolivre-link-generator.service";
import type {
  AffiliateProvider,
  AffiliateProviderResult,
  MercadoLivreGenerationAttempt,
  MercadoLivreSocialCandidate,
  MercadoLivreSocialDebug,
} from "./affiliate-provider.interface";
import { addQueryParam } from "./url-query-param";

type SocialProductUrlCandidate = {
  url: string;
  source: string;
  path: string;
  title?: string;
  context?: string;
  blocked: boolean;
  priority: number;
};

type SocialProductExtraction = {
  productUrl: string | null;
  itemId?: string;
  source:
    | "primary_show_product_action"
    | "pdp_filters_item_id"
    | "candidate_fallback"
    | "none";
  strategy?:
    | "show_product_action"
    | "pdp_filters_item_id"
    | "candidate_fallback";
  path?: string;
  selectedCandidate?: MercadoLivreSocialCandidate;
  selectedCandidateReason?:
    | "SHOW_PRODUCT_ACTION"
    | "PDP_FILTERS_ITEM_ID"
    | "TEXT_SIMILARITY_MATCH";
  reason?: string;
  debug: MercadoLivreSocialDebug;
};

@Injectable()
export class MercadoLivreAffiliateProvider implements AffiliateProvider {
  constructor(
    private readonly linkGenerator: MercadoLivreLinkGeneratorService,
  ) {}

  async rewriteLink(
    originalUrl: string,
    credential: AffiliateCredential,
    context?: { originalMessageText?: string },
  ): Promise<AffiliateProviderResult> {
    const mode = this.readMode();
    const affiliateId = (
      credential.affiliateId ?? credential.trackingId
    )?.trim();
    const ssid = this.readSsid(credential.metadata);
    const csrfToken = this.readMetadataString(credential.metadata, "csrfToken");

    if (mode === "disabled") {
      return {
        rewrittenUrl: originalUrl,
        changed: false,
        sameProduct: false,
        canForward: false,
        mode,
        reason: "MERCADO_LIVRE_DISABLED",
      };
    }

    if (!ssid) {
      return {
        rewrittenUrl: originalUrl,
        changed: false,
        sameProduct: false,
        canForward: false,
        mode,
        reason: "MISSING_MERCADO_LIVRE_SESSION",
      };
    }

    if (!affiliateId) {
      return {
        rewrittenUrl: originalUrl,
        changed: false,
        sameProduct: false,
        canForward: false,
        mode,
        reason: "MISSING_AFFILIATE_VALUE",
      };
    }

    console.log("[ML_AFFILIATE] resolving url");
    const resolvedUrl = await this.resolveUrl(originalUrl);
    const primaryPayloadUrl = resolvedUrl ?? originalUrl;
    console.log("[ML_AFFILIATE] resolved url");
    const originalItemId = this.extractItemId(primaryPayloadUrl);

    if (mode === "legacy") {
      const rewrittenUrl = addQueryParam(originalUrl, "aff_id", affiliateId);

      return {
        rewrittenUrl,
        changed: rewrittenUrl !== originalUrl,
        sameProduct: false,
        canForward: false,
        mode,
        resolvedUrl,
        ...(originalItemId ? { itemId: originalItemId, originalItemId } : {}),
        reason: "MERCADO_LIVRE_LEGACY_NOT_VERIFIED",
        warning: "Modo legado não garante comissão.",
      };
    }

    let attemptedPayloadUrl: string | undefined;
    const generationAttempts: MercadoLivreGenerationAttempt[] = [];
    let lastError: unknown;
    let mainProductUrl: string | undefined;
    let mainProductSource:
      | "primary_show_product_action"
      | "pdp_filters_item_id"
      | "candidate_fallback"
      | "primary_cta"
      | "preloaded_primary"
      | "none"
      | undefined;
    let mainProductPath: string | undefined;
    let strategy:
      | "show_product_action"
      | "pdp_filters_item_id"
      | "candidate_fallback"
      | undefined;
    let selectedProductItemId: string | undefined;
    let selectedCandidate: MercadoLivreSocialCandidate | undefined;
    let selectedCandidateReason: string | undefined;
    let finalProductUrl: string | undefined;
    let socialDebug: MercadoLivreSocialDebug | undefined;
    let failureReason = "MERCADO_LIVRE_GENERATION_FAILED";
    const isSocialPage = this.isSocialUrl(primaryPayloadUrl);

    const generate = async (
      payloadUrl: string,
      logMessage: string,
    ): Promise<string | undefined> => {
      attemptedPayloadUrl = payloadUrl;
      console.log(logMessage);

      try {
        const generatedUrl = await this.linkGenerator.generateAffiliateLink({
          originalUrl,
          resolvedUrl: payloadUrl,
          itemId: this.extractItemId(payloadUrl) ?? originalItemId,
          affiliateId,
          ssid,
          csrfToken,
        });

        if (
          generatedUrl === originalUrl ||
          !generatedUrl.startsWith("https://meli.la/")
        ) {
          throw new Error("Generator did not return a new meli.la short_url");
        }

        generationAttempts.push({ url: payloadUrl, success: true });
        return generatedUrl;
      } catch (error) {
        lastError = error;
        generationAttempts.push({
          url: payloadUrl,
          success: false,
          ...(error instanceof MercadoLivreGeneratorRequestError
            ? { status: error.status }
            : {}),
          error: this.summarizeError(error),
        });
        return undefined;
      }
    };

    let rewrittenUrl: string | undefined;

    if (isSocialPage) {
      console.log("[ML_AFFILIATE] social page detected");
      const extraction = await this.fetchMainProductFromSocialPage(
        primaryPayloadUrl,
        ssid,
        context?.originalMessageText,
      );
      mainProductUrl = extraction.productUrl ?? undefined;
      mainProductSource = extraction.source;
      mainProductPath = extraction.path;
      strategy = extraction.strategy;
      selectedProductItemId = extraction.itemId;
      selectedCandidate = extraction.selectedCandidate;
      selectedCandidateReason = extraction.selectedCandidateReason;
      socialDebug = extraction.debug;

      if (mainProductUrl) {
        console.log("[ML_AFFILIATE] resolving selected product url");
        finalProductUrl = await this.resolveSelectedProductUrl(mainProductUrl);
        selectedProductItemId =
          this.extractItemId(finalProductUrl) ?? selectedProductItemId;
        rewrittenUrl = await generate(
          finalProductUrl,
          "[ML_AFFILIATE] generating from selected product url",
        );
      } else {
        failureReason = "MERCADO_LIVRE_PRODUCT_NOT_FOUND";
      }
    } else if (this.isMercadoLivreProductUrl(primaryPayloadUrl)) {
      rewrittenUrl = await generate(
        primaryPayloadUrl,
        "[ML_AFFILIATE] generating from resolved url",
      );
    } else {
      failureReason = "MERCADO_LIVRE_PRODUCT_NOT_FOUND";
    }

    if (rewrittenUrl) {
      console.log("[ML_AFFILIATE] success");
      const selectedItemId =
        selectedProductItemId ??
        (mainProductUrl ? this.extractItemId(mainProductUrl) : originalItemId);

      return {
        rewrittenUrl,
        changed: true,
        canForward: true,
        mode,
        resolvedUrl,
        ...(attemptedPayloadUrl ? { attemptedPayloadUrl } : {}),
        generationAttempts,
        ...(selectedItemId
          ? { itemId: selectedItemId, originalItemId: selectedItemId }
          : {}),
        ...(mainProductUrl
          ? {
              originProductUrl: mainProductUrl,
              mainProductUrl,
              mainProductSource,
              ...(mainProductPath ? { mainProductPath } : {}),
              ...(strategy ? { strategy } : {}),
              ...(finalProductUrl ? { finalProductUrl } : {}),
            }
          : {}),
        ...(selectedCandidate ? { selectedCandidate } : {}),
        ...(selectedCandidateReason ? { selectedCandidateReason } : {}),
        ...(socialDebug ? { socialDebug } : {}),
      };
    }

    failureReason = this.isFatalGenerationError(lastError)
      ? this.readGenerationFailureReason(lastError)
      : failureReason;
    console.log(`[ML_AFFILIATE] failed reason=${failureReason}`);

    return {
      rewrittenUrl: originalUrl,
      changed: false,
      sameProduct: false,
      canForward: false,
      mode,
      resolvedUrl,
      ...(attemptedPayloadUrl ? { attemptedPayloadUrl } : {}),
      generationAttempts,
      ...(mainProductSource ? { mainProductSource } : {}),
      ...(mainProductPath ? { mainProductPath } : {}),
      ...(strategy ? { strategy } : {}),
      ...(finalProductUrl ? { finalProductUrl } : {}),
      ...(mainProductUrl
        ? { mainProductUrl, originProductUrl: mainProductUrl }
        : {}),
      ...(socialDebug ? { socialDebug } : {}),
      ...(selectedCandidate ? { selectedCandidate } : {}),
      ...(selectedCandidateReason ? { selectedCandidateReason } : {}),
      ...(selectedProductItemId
        ? {
            itemId: selectedProductItemId,
            originalItemId: selectedProductItemId,
          }
        : originalItemId
          ? { itemId: originalItemId, originalItemId }
          : {}),
      reason: failureReason,
      error: this.summarizeError(lastError),
    };
  }

  async resolveUrl(originalUrl: string): Promise<string | undefined> {
    const hostname = this.readHostname(originalUrl);

    if (hostname !== "meli.la" && !hostname.endsWith(".meli.la")) {
      return originalUrl;
    }

    for (const method of ["HEAD", "GET"] as const) {
      try {
        const response = await fetch(originalUrl, {
          method,
          redirect: "follow",
          headers: {
            "User-Agent": "PromoHub/1.0",
          },
        });

        if (response.url && response.url !== originalUrl) {
          return response.url;
        }
      } catch {
        // GET is attempted when HEAD is unavailable.
      }
    }

    return originalUrl;
  }

  private async resolveSelectedProductUrl(
    selectedUrl: string,
  ): Promise<string> {
    for (const method of ["HEAD", "GET"] as const) {
      try {
        const response = await fetch(selectedUrl, {
          method,
          redirect: "follow",
          headers: {
            "User-Agent": "PromoHub/1.0",
          },
        });
        const finalUrl = response.url;

        if (finalUrl && this.isOfficialMercadoLivreProductUrl(finalUrl)) {
          return finalUrl;
        }
      } catch {
        // GET is attempted when HEAD is unavailable.
      }
    }

    return selectedUrl;
  }

  extractItemId(url: string): string | undefined {
    const match = url.match(/\b(MLB)[-_]?(\d{6,})\b/i);

    return match ? `${match[1].toUpperCase()}${match[2]}` : undefined;
  }

  extractMainProductFromSocialPage(
    html: string,
    resolvedUrl: string,
  ): {
    productUrl: string | null;
    itemId?: string;
    source:
      | "primary_show_product_action"
      | "pdp_filters_item_id"
      | "candidate_fallback"
      | "none";
    strategy?:
      | "show_product_action"
      | "pdp_filters_item_id"
      | "candidate_fallback";
    path?: string;
    selectedCandidate?: MercadoLivreSocialCandidate;
    selectedCandidateReason?: string;
    reason?: string;
  } {
    const extraction = this.analyzeSocialPage(html, resolvedUrl);

    return {
      productUrl: extraction.productUrl,
      ...(extraction.itemId ? { itemId: extraction.itemId } : {}),
      source: extraction.source,
      ...(extraction.strategy ? { strategy: extraction.strategy } : {}),
      ...(extraction.path ? { path: extraction.path } : {}),
      ...(extraction.selectedCandidate
        ? { selectedCandidate: extraction.selectedCandidate }
        : {}),
      ...(extraction.selectedCandidateReason
        ? { selectedCandidateReason: extraction.selectedCandidateReason }
        : {}),
      ...(extraction.reason ? { reason: extraction.reason } : {}),
    };
  }

  private async fetchMainProductFromSocialPage(
    resolvedUrl: string,
    ssid: string,
    originalMessageText?: string,
  ): Promise<SocialProductExtraction> {
    try {
      const response = await axios.get(resolvedUrl, {
        headers: this.socialPageHeaders(ssid),
        validateStatus: () => true,
        maxRedirects: 5,
        responseType: "text",
      });

      const html =
        typeof response.data === "string"
          ? response.data
          : JSON.stringify(response.data);
      const finalPageUrl = response.request?.res?.responseUrl ?? resolvedUrl;
      const extraction = this.analyzeSocialPage(
        html,
        finalPageUrl,
        response.status,
        originalMessageText,
      );

      if (!extraction.productUrl) {
        console.log(
          `[ML_AFFILIATE] social extraction debug=${JSON.stringify(extraction.debug)}`,
        );
      }

      return extraction;
    } catch (error) {
      const debug = this.emptySocialDebug(resolvedUrl);
      console.log(
        `[ML_AFFILIATE] social extraction debug=${JSON.stringify({
          ...debug,
          requestError: this.summarizeError(error),
        })}`,
      );
      return {
        productUrl: null,
        source: "none",
        reason: "MERCADO_LIVRE_PRODUCT_NOT_FOUND",
        debug,
      };
    }
  }

  private analyzeSocialPage(
    html: string,
    resolvedUrl: string,
    status?: number,
    originalMessageText?: string,
  ): SocialProductExtraction {
    const $ = load(html);
    const candidates: SocialProductUrlCandidate[] = [];
    const candidateKeysFound = new Set<string>();
    const scripts = $("script").toArray();
    const hasNextData = $("script#__NEXT_DATA__").length > 0;
    const hasPreloadedState = /__PRELOADED_STATE__/i.test(html);
    const hasMelidata = /\bmelidata\b/i.test(html);

    const addCandidate = (
      rawUrl: string,
      source: string,
      path: string,
      options?: {
        title?: string;
        context?: string;
        allowRedirect?: boolean;
        forcePrimary?: boolean;
      },
    ) => {
      const url =
        this.extractProductUrlFromValue(rawUrl, resolvedUrl) ??
        (options?.allowRedirect
          ? this.normalizeMercadoLivreRedirect(rawUrl, resolvedUrl)
          : undefined);

      if (!url) {
        return;
      }

      const normalizedPath = path.replace(/\[(\d+)\]/g, ".$1");
      const blocked =
        !options?.forcePrimary && this.isBlockedProductPath(normalizedPath);
      const priority = options?.forcePrimary
        ? 10000
        : blocked
          ? -1
          : this.readProductPathPriority(normalizedPath);
      candidates.push({
        url,
        source,
        path: normalizedPath,
        blocked,
        priority,
        ...(this.cleanText(options?.title)
          ? { title: this.cleanText(options?.title) }
          : {}),
        ...(this.cleanText(options?.context)
          ? { context: this.cleanText(options?.context)?.slice(0, 120) }
          : {}),
      });
    };

    scripts.forEach((element, index) => {
      const body = $(element).html()?.trim();
      if (!body) {
        return;
      }

      const source = $(element).is("#__NEXT_DATA__")
        ? "next_data"
        : /application\/ld\+json/i.test($(element).attr("type") ?? "")
          ? "json_ld"
          : /application\/json/i.test($(element).attr("type") ?? "")
            ? "application_json"
            : "script_json";
      const parsedValues: unknown[] = [];
      const direct = this.tryParseJson(body);
      if (direct !== undefined) {
        parsedValues.push(direct);
      }
      const firstJson = this.extractFirstJsonValue(body);
      if (firstJson !== undefined && firstJson !== direct) {
        parsedValues.push(firstJson);
      }
      const markers = new Set(
        body.match(/(?:window\.)?__[A-Z0-9_]+__/gi) ?? [],
      );
      if (/__PRELOADED_STATE__/i.test(body)) {
        markers.add("__PRELOADED_STATE__");
      }
      for (const marker of markers) {
        const assigned = this.extractAssignedJson(body, marker);
        if (assigned !== undefined) {
          parsedValues.push(assigned);
        }
      }
      parsedValues.forEach((parsed, parsedIndex) => {
        this.deepFindProductUrls(
          parsed,
          [`script[${index}]`, source, String(parsedIndex)],
          resolvedUrl,
          candidates,
          candidateKeysFound,
        );
      });
    });

    const normalizedHtml = this.decodeEscapedText(html);
    const actionPattern =
      /["'](primaryAction|action|cta)["']\s*:\s*\{[\s\S]{0,500}?["'](?:url|target|href|deeplink)["']\s*:\s*["']([^"']+)["']/gi;
    for (const match of normalizedHtml.matchAll(actionPattern)) {
      const container = match[1] ?? "action";
      candidateKeysFound.add(container);
      candidateKeysFound.add("url");
      addCandidate(match[2] ?? "", "html_pattern", `html.${container}.url`, {
        context: this.readTextContext(normalizedHtml, match.index ?? 0),
      });
    }
    const fieldPattern =
      /["'](permalink|url|productUrl|itemUrl|targetUrl|destinationUrl|destination_url|actionUrl|link|href|deeplink|target)["']\s*:\s*["']([^"']+)["']/gi;
    for (const match of normalizedHtml.matchAll(fieldPattern)) {
      const key = match[1] ?? "url";
      candidateKeysFound.add(key);
      addCandidate(match[2] ?? "", "html_pattern", `html.${key}`, {
        context: this.readTextContext(normalizedHtml, match.index ?? 0),
      });
    }

    $("a, button").each((_index, element) => {
      const node = $(element);
      const text = this.normalizeComparableText(
        `${node.text()} ${node.attr("aria-label") ?? ""} ${node.attr("title") ?? ""}`,
      );
      if (!/\b(ir para produto|ver produto|comprar)\b/.test(text)) {
        return;
      }
      const rawTarget =
        node.attr("href") ??
        node.attr("data-href") ??
        node.attr("data-url") ??
        node.attr("data-target") ??
        node.closest("a").attr("href");
      if (!rawTarget) {
        return;
      }
      const ancestorContext = node
        .parents()
        .toArray()
        .map((ancestor) => {
          const parent = $(ancestor);
          return `${parent.attr("class") ?? ""} ${parent.attr("id") ?? ""}`;
        })
        .join(" ");
      const ancestorPath = this.normalizeComparableText(ancestorContext)
        .replace(/\s+/g, ".")
        .replace(/^\.+|\.+$/g, "");
      addCandidate(
        rawTarget,
        "primary_cta",
        `dom.${ancestorPath ? `${ancestorPath}.` : ""}cta`,
        {
          title: node.attr("title") ?? node.attr("aria-label") ?? node.text(),
          context: ancestorContext,
          allowRedirect: true,
        },
      );
    });

    const pdpItemId = this.extractPdpFiltersItemId(html);
    const endpointsFound = this.extractSocialApiEndpoints(html, resolvedUrl);
    const uniqueCandidates = this.dedupeSocialProductCandidates(candidates);
    const showProductCandidate = uniqueCandidates.find(
      (candidate) =>
        candidate.source === "primary_show_product_action" &&
        this.isOfficialMercadoLivreProductUrl(candidate.url),
    );
    const fallbackCandidate = showProductCandidate
      ? undefined
      : pdpItemId
        ? undefined
        : this.selectProductCandidateByMessage(
            uniqueCandidates,
            originalMessageText,
          );
    const debug: MercadoLivreSocialDebug = {
      resolvedUrl,
      ...(status !== undefined ? { status } : {}),
      ...(pdpItemId ? { pdpItemId } : {}),
      htmlLength: html.length,
      scriptCount: scripts.length,
      candidateKeysFound: [...candidateKeysFound].slice(0, 50),
      urlsFoundCount: uniqueCandidates.length,
      urlsFound: uniqueCandidates.slice(0, 20).map((candidate) => ({
        url: candidate.url,
        source: candidate.source,
        path: candidate.path,
        ...(candidate.context ? { context: candidate.context } : {}),
      })),
      hasPreloadedState,
      hasMelidata,
      hasNextData,
      endpointsFound,
      candidates: this.toSocialDebugCandidates(uniqueCandidates),
    };

    if (showProductCandidate) {
      console.log("[ML_AFFILIATE] show_product action found");
      console.log("[ML_AFFILIATE] selecting show_product action");
      const selectedCandidate =
        this.toMercadoLivreSocialCandidate(showProductCandidate);

      return {
        productUrl: showProductCandidate.url,
        itemId: this.extractItemId(showProductCandidate.url),
        source: "primary_show_product_action",
        strategy: "show_product_action",
        path: showProductCandidate.path,
        selectedCandidate,
        selectedCandidateReason: "SHOW_PRODUCT_ACTION",
        debug,
      };
    }

    if (pdpItemId) {
      console.log(`[ML_AFFILIATE] pdp itemId found=${pdpItemId}`);
      const productUrl = this.buildOfficialProductUrl(pdpItemId);
      return {
        productUrl,
        itemId: pdpItemId,
        source: "pdp_filters_item_id",
        strategy: "pdp_filters_item_id",
        path: "pdp_filters.item_id",
        selectedCandidate: {
          source: "pdp_filters_item_id",
          url: productUrl,
          path: "pdp_filters.item_id",
          itemId: pdpItemId,
          score: 9000,
        },
        selectedCandidateReason: "PDP_FILTERS_ITEM_ID",
        debug,
      };
    }

    if (fallbackCandidate) {
      return {
        productUrl: fallbackCandidate.url,
        itemId: this.extractItemId(fallbackCandidate.url),
        source: "candidate_fallback",
        strategy: "candidate_fallback",
        path: fallbackCandidate.path,
        selectedCandidate:
          this.toMercadoLivreSocialCandidate(fallbackCandidate),
        selectedCandidateReason: "TEXT_SIMILARITY_MATCH",
        debug,
      };
    }

    return {
      productUrl: null,
      source: "none",
      reason: "MERCADO_LIVRE_PRODUCT_NOT_FOUND",
      debug,
    };
  }

  extractPdpFiltersItemId(html: string): string | undefined {
    const match = html.match(/pdp_filters=item_id(?:%3A|:)(MLB\d+)/i);

    return match?.[1]?.toUpperCase();
  }

  private buildOfficialProductUrl(itemId: string): string {
    return `https://produto.mercadolivre.com.br/${itemId}-_JM`;
  }

  deepFindProductUrls(
    value: unknown,
    path: string[] = [],
    resolvedUrl = "https://www.mercadolivre.com.br/",
    candidates: SocialProductUrlCandidate[] = [],
    candidateKeysFound: Set<string> = new Set(),
  ): SocialProductUrlCandidate[] {
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        this.deepFindProductUrls(
          item,
          [...path, String(index)],
          resolvedUrl,
          candidates,
          candidateKeysFound,
        ),
      );
      return candidates;
    }

    if (!value || typeof value !== "object") {
      return candidates;
    }

    const record = value as Record<string, unknown>;
    const title = this.readJsonTitle(record);
    const watchedKeys = new Set([
      "url",
      "permalink",
      "producturl",
      "itemurl",
      "targeturl",
      "destinationurl",
      "actionurl",
      "link",
      "href",
      "deeplink",
      "products",
      "item",
      "mainproduct",
      "selectedproduct",
      "primaryproduct",
      "highlightedproduct",
      "publication",
      "catalogproduct",
    ]);
    const actionUrl = [
      record.url,
      record.href,
      record.targetUrl,
      record.actionUrl,
    ].find((item): item is string => typeof item === "string");

    if (actionUrl && this.isShowProductAction(record)) {
      const url = this.extractProductUrlFromValue(actionUrl, resolvedUrl);

      if (url) {
        const urlKey =
          Object.entries(record).find(([, item]) => item === actionUrl)?.[0] ??
          "url";
        const joinedPath = [...path, urlKey].join(".");
        candidateKeysFound.add("action_links");
        candidateKeysFound.add(urlKey);
        candidates.push({
          url,
          source: "primary_show_product_action",
          path: joinedPath,
          title:
            typeof record.text === "string"
              ? record.text
              : typeof record.label === "string"
                ? record.label
                : title,
          context: JSON.stringify({
            id: record.id,
            text: record.text,
          }).slice(0, 120),
          blocked: false,
          priority: 10000,
        });
      }
    }

    for (const [key, item] of Object.entries(record)) {
      const normalizedKey = key.replace(/[_-]/g, "").toLowerCase();
      const nextPath = [...path, key];
      if (watchedKeys.has(normalizedKey)) {
        candidateKeysFound.add(key);
      }
      if (typeof item === "string" && watchedKeys.has(normalizedKey)) {
        const url = this.extractProductUrlFromValue(item, resolvedUrl);
        if (url) {
          const joinedPath = nextPath.join(".");
          candidates.push({
            url,
            source: path[1] ?? "json",
            path: joinedPath,
            title,
            context: joinedPath.slice(0, 120),
            blocked: this.isBlockedProductPath(joinedPath),
            priority: this.readProductPathPriority(joinedPath),
          });
        }
      }
      if (typeof item === "object" && item !== null) {
        this.deepFindProductUrls(
          item,
          nextPath,
          resolvedUrl,
          candidates,
          candidateKeysFound,
        );
      }
    }

    return candidates;
  }

  private isShowProductAction(record: Record<string, unknown>): boolean {
    const id = this.normalizeComparableText(
      typeof record.id === "string"
        ? record.id
        : typeof record.actionId === "string"
          ? record.actionId
          : typeof record.action_id === "string"
            ? record.action_id
            : "",
    ).replace(/\s+/g, "");
    const text = this.normalizeComparableText(
      [record.text, record.label, record.title, record.action]
        .filter((item): item is string => typeof item === "string")
        .join(" "),
    );

    return (
      ["showproduct", "viewproduct", "gotoproduct"].includes(id) ||
      /\b(ir para produto|ver produto|show product|view product|go to product)\b/.test(
        text,
      )
    );
  }

  private extractProductUrlFromValue(
    value: string,
    resolvedUrl: string,
  ): string | undefined {
    const decoded = this.decodeEscapedText(value)
      .replace(/&amp;/gi, "&")
      .trim();
    const attempts = [decoded];
    try {
      attempts.push(decodeURIComponent(decoded));
    } catch {
      // The URL may already be decoded.
    }
    for (const attempt of attempts) {
      try {
        const url = new URL(attempt, resolvedUrl);
        if (this.isOfficialMercadoLivreProductUrl(url.toString())) {
          url.hash = "";
          return url.toString();
        }
        for (const key of ["url", "target"]) {
          const nested = url.searchParams.get(key);
          if (nested && nested !== attempt) {
            const productUrl = this.extractProductUrlFromValue(
              nested,
              resolvedUrl,
            );
            if (productUrl) {
              return productUrl;
            }
          }
        }
      } catch {
        // Invalid candidates are ignored.
      }
    }
    return undefined;
  }

  private readProductPathPriority(path: string): number {
    const normalized = path.replace(/[_-]/g, "").toLowerCase();

    if (
      /(^|\.)(primaryaction|mainproduct|primaryproduct|cta|action)(\.|$)/.test(
        normalized,
      )
    ) {
      return 100;
    }
    if (/(^|\.)(highlightedproduct|selectedproduct)(\.|$)/.test(normalized)) {
      return 90;
    }
    if (/(^|\.)(publication|catalogproduct|item)(\.|$)/.test(normalized)) {
      return 80;
    }
    if (/(^|\.)(main|primary|highlighted|selected)(\.|$)/.test(normalized)) {
      return 70;
    }

    return 0;
  }

  private isBlockedProductPath(path: string): boolean {
    return /(^|\.)(recommendations?|reco|carousel|related|sponsored|similar|search|wishlist|bookmarks|listitems)(\.|$)/i.test(
      path.replace(/[_-]/g, ""),
    );
  }

  private dedupeSocialProductCandidates(
    candidates: SocialProductUrlCandidate[],
  ): SocialProductUrlCandidate[] {
    const seen = new Set<string>();

    return candidates
      .sort(
        (a, b) =>
          Number(a.blocked) - Number(b.blocked) || b.priority - a.priority,
      )
      .filter((candidate) => {
        const key = `${candidate.url}|${candidate.path}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
  }

  private selectProductCandidateByMessage(
    candidates: SocialProductUrlCandidate[],
    originalMessageText?: string,
  ): SocialProductUrlCandidate | undefined {
    if (!originalMessageText?.trim()) {
      return undefined;
    }

    const offerKeywords = this.extractOfferKeywords(originalMessageText);
    const candidatesByUrl = new Map<string, SocialProductUrlCandidate>();
    for (const candidate of candidates.filter((item) => !item.blocked)) {
      const current = candidatesByUrl.get(candidate.url);
      if (
        !current ||
        (!current.title && candidate.title) ||
        candidate.priority > current.priority
      ) {
        candidatesByUrl.set(candidate.url, candidate);
      }
    }
    const ranked = [...candidatesByUrl.values()]
      .map((candidate) => {
        const scored = this.scoreCandidateForOffer(
          {
            source: "json_field",
            url: candidate.url,
            score: 0,
            ...(candidate.title ? { title: candidate.title } : {}),
            ...(candidate.context ? { textContext: candidate.context } : {}),
          },
          offerKeywords,
        );

        return { candidate, scored };
      })
      .sort((a, b) => b.scored.score - a.scored.score);
    const top = ranked[0];
    const second = ranked[1];

    if (
      !top ||
      (top.scored.matchedKeywords?.length ?? 0) < 2 ||
      top.scored.score < 30 ||
      (second && top.scored.score - second.scored.score < 15)
    ) {
      return undefined;
    }

    return top.candidate;
  }

  private normalizeMercadoLivreRedirect(
    rawUrl: string,
    resolvedUrl: string,
  ): string | undefined {
    try {
      const url = new URL(this.decodeEscapedText(rawUrl), resolvedUrl);
      const hostname = url.hostname.replace(/^www\./, "").toLowerCase();

      return hostname === "meli.la" || hostname.endsWith(".meli.la")
        ? url.toString()
        : undefined;
    } catch {
      return undefined;
    }
  }

  private toSocialDebugCandidates(
    candidates: SocialProductUrlCandidate[],
  ): MercadoLivreSocialCandidate[] {
    return candidates
      .slice(0, 20)
      .map((candidate) => this.toMercadoLivreSocialCandidate(candidate));
  }

  private toMercadoLivreSocialCandidate(
    candidate: SocialProductUrlCandidate,
  ): MercadoLivreSocialCandidate {
    return {
      source:
        candidate.source === "primary_show_product_action"
          ? "primary_show_product_action"
          : candidate.source === "primary_cta"
            ? "cta"
            : candidate.source === "json_ld"
              ? "json_ld"
              : "json_field",
      url: candidate.url,
      path: candidate.path,
      score: candidate.blocked ? -100 : candidate.priority,
      ...(this.extractItemId(candidate.url)
        ? { itemId: this.extractItemId(candidate.url) }
        : {}),
      ...(candidate.title ? { title: candidate.title } : {}),
      textContext:
        `${candidate.path}${candidate.context ? `: ${candidate.context}` : ""}`.slice(
          0,
          120,
        ),
      ...(candidate.blocked ? { rejectedReason: "BLOCKED_PATH" } : {}),
    };
  }

  private extractSocialApiEndpoints(
    html: string,
    resolvedUrl: string,
  ): string[] {
    const endpoints = new Set<string>();
    const normalized = this.decodeEscapedText(html);

    for (const match of normalized.matchAll(
      /(?:https?:\/\/[^"'\\\s<>]+|\/[^"'\\\s<>]+(?:affiliate-program|social|lists|api)[^"'\\\s<>]*)/gi,
    )) {
      const raw = match[0];
      if (
        !/(?:\/affiliate-program\/|\/social\/|\/lists\/|\/api\/)/i.test(raw)
      ) {
        continue;
      }
      try {
        const endpoint = new URL(raw, resolvedUrl);
        if (
          endpoint.hostname === new URL(resolvedUrl).hostname ||
          endpoint.hostname.endsWith(".mercadolivre.com.br")
        ) {
          endpoints.add(endpoint.toString().slice(0, 500));
        }
      } catch {
        // Invalid endpoint-like strings are ignored.
      }
    }

    return [...endpoints].slice(0, 20);
  }

  private extractFirstJsonValue(body: string): unknown {
    const starts = [body.indexOf("{"), body.indexOf("[")].filter(
      (index) => index >= 0,
    );
    if (starts.length === 0) {
      return undefined;
    }
    const start = Math.min(...starts);
    const opening = body[start];
    const closing = opening === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < body.length; index += 1) {
      const character = body[index]!;
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === '"') {
          inString = false;
        }
        continue;
      }
      if (character === '"') {
        inString = true;
      } else if (character === opening) {
        depth += 1;
      } else if (character === closing) {
        depth -= 1;
        if (depth === 0) {
          return this.tryParseJson(body.slice(start, index + 1));
        }
      }
    }

    return undefined;
  }

  private emptySocialDebug(resolvedUrl: string): MercadoLivreSocialDebug {
    return {
      resolvedUrl,
      htmlLength: 0,
      scriptCount: 0,
      candidateKeysFound: [],
      urlsFoundCount: 0,
      urlsFound: [],
      hasPreloadedState: false,
      hasMelidata: false,
      hasNextData: false,
      endpointsFound: [],
      candidates: [],
    };
  }

  async extractProductFromSocialPage(
    resolvedUrl: string,
    originalMessageText?: string,
    ssid = "",
    originalUrl?: string,
  ): Promise<{
    candidates: MercadoLivreSocialCandidate[];
    selectedCandidate?: MercadoLivreSocialCandidate;
    ambiguous: boolean;
    selectedCandidateReason?: "TEXT_SIMILARITY_MATCH";
    offerKeywords: string[];
  }> {
    const candidates = await this.fetchSocialCandidates(resolvedUrl, ssid);
    const fallbackCandidates =
      candidates.length === 0 && originalUrl && originalUrl !== resolvedUrl
        ? await this.fetchSocialCandidates(originalUrl, ssid)
        : [];
    const extracted =
      fallbackCandidates.length > 0
        ? this.rankAndMergeCandidates([...candidates, ...fallbackCandidates])
        : candidates;
    const offerKeywords = this.extractOfferKeywords(originalMessageText ?? "");
    const ranked = extracted
      .map((candidate) => this.scoreCandidateForOffer(candidate, offerKeywords))
      .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
    const top = ranked[0];

    if (!top) {
      return { candidates: [], ambiguous: false, offerKeywords };
    }

    const minScore = this.readCandidateThreshold(
      "MERCADO_LIVRE_CANDIDATE_MIN_SCORE",
      70,
    );
    const minKeywords = this.readCandidateThreshold(
      "MERCADO_LIVRE_CANDIDATE_MIN_KEYWORDS",
      2,
    );
    const minMargin = this.readCandidateThreshold(
      "MERCADO_LIVRE_CANDIDATE_MIN_MARGIN",
      20,
    );
    const secondRelevant = ranked
      .slice(1)
      .find((candidate) => (candidate.matchedKeywords?.length ?? 0) > 0);
    const margin = top.score - (secondRelevant?.score ?? 0);
    const rejectedReasons = [
      top.rejectedReason,
      top.score < minScore ? `SCORE_BELOW_${minScore}` : undefined,
      (top.matchedKeywords?.length ?? 0) < minKeywords
        ? `KEYWORDS_BELOW_${minKeywords}`
        : undefined,
      secondRelevant && margin < minMargin
        ? `MARGIN_BELOW_${minMargin}`
        : undefined,
    ].filter((reason): reason is string => Boolean(reason));

    if (rejectedReasons.length > 0) {
      top.rejectedReason = rejectedReasons.join(",");
      return {
        candidates: ranked,
        ambiguous: ranked.length > 1,
        offerKeywords,
      };
    }

    return {
      candidates: ranked,
      selectedCandidate: top,
      selectedCandidateReason: "TEXT_SIMILARITY_MATCH",
      ambiguous: ranked.length > 1,
      offerKeywords,
    };
  }

  private async fetchSocialCandidates(
    url: string,
    ssid: string,
  ): Promise<MercadoLivreSocialCandidate[]> {
    try {
      const response = await axios.get(url, {
        headers: this.socialPageHeaders(ssid),
        validateStatus: () => true,
        maxRedirects: 5,
        responseType: "text",
      });

      if (response.status < 200 || response.status >= 300) {
        return [];
      }

      const body =
        typeof response.data === "string"
          ? response.data
          : JSON.stringify(response.data);

      return this.extractSocialCandidates(
        body,
        response.request?.res?.responseUrl ?? url,
      );
    } catch {
      return [];
    }
  }

  async debugSocialPage(
    resolvedUrl: string,
    ssid: string,
  ): Promise<MercadoLivreSocialDebug> {
    try {
      const response = await axios.get(resolvedUrl, {
        headers: this.socialPageHeaders(ssid),
        validateStatus: () => true,
        maxRedirects: 5,
        responseType: "text",
      });
      const body =
        typeof response.data === "string"
          ? response.data
          : JSON.stringify(response.data);

      return this.analyzeSocialPage(
        body,
        response.request?.res?.responseUrl ?? resolvedUrl,
        response.status,
      ).debug;
    } catch {
      return this.emptySocialDebug(resolvedUrl);
    }
  }

  extractSocialCandidates(
    body: string,
    baseUrl: string,
  ): MercadoLivreSocialCandidate[] {
    const normalizedBody = this.decodeEscapedText(body);
    const candidates: MercadoLivreSocialCandidate[] = [];
    const addCandidate = (
      source: MercadoLivreSocialCandidate["source"],
      rawUrl: string,
      score: number,
      options?: {
        title?: string;
        textContext?: string;
      },
    ) => {
      const url = this.normalizeProductCandidateUrl(rawUrl, baseUrl);

      if (!url) {
        return;
      }

      const itemId = this.extractItemId(url);
      const title = this.cleanText(options?.title);
      const textContext = this.cleanText(options?.textContext)?.slice(0, 120);
      candidates.push({
        source,
        url,
        score,
        ...(itemId ? { itemId } : {}),
        ...(title ? { title } : {}),
        ...(textContext ? { textContext } : {}),
      });
    };

    for (const match of normalizedBody.matchAll(
      /<a\b([^>]*)>([\s\S]*?)<\/a>/gi,
    )) {
      const attributes = match[1] ?? "";
      const href = this.readHtmlAttribute(attributes, "href");

      if (!href) {
        continue;
      }

      const anchorText = this.cleanText(match[2]);
      const imageAlt = this.readImageAlt(match[2] ?? "");
      const anchorContext = `${attributes} ${anchorText ?? ""} ${this.readTextContext(normalizedBody, match.index ?? 0) ?? ""}`;
      const isCta =
        /\b(cta|primary|button|action|buy|purchase)\b/i.test(attributes) ||
        /\b(comprar|ver produto|ir para produto|aproveitar oferta)\b/i.test(
          anchorText ?? "",
        );
      addCandidate(isCta ? "cta" : "href", href, isCta ? 40 : 20, {
        title: this.pickCandidateTitle(
          this.readHtmlAttribute(attributes, "title"),
          this.readHtmlAttribute(attributes, "aria-label"),
          anchorText,
          imageAlt,
        ),
        textContext: anchorContext,
      });
    }

    for (const match of normalizedBody.matchAll(
      /<button\b([^>]*)>([\s\S]*?)<\/button>/gi,
    )) {
      const attributes = match[1] ?? "";
      const targetUrl =
        this.readHtmlAttribute(attributes, "data-href") ??
        this.readHtmlAttribute(attributes, "data-url") ??
        this.readHtmlAttribute(attributes, "href");

      if (targetUrl) {
        addCandidate("cta", targetUrl, 40, {
          title: this.pickCandidateTitle(
            this.readHtmlAttribute(attributes, "title"),
            this.readHtmlAttribute(attributes, "aria-label"),
            this.cleanText(match[2]),
            this.readImageAlt(match[2] ?? ""),
          ),
          textContext: attributes,
        });
      }
    }

    for (const match of normalizedBody.matchAll(/<(?:link|meta)\b([^>]*)>/gi)) {
      const attributes = match[1] ?? "";
      const rel = this.readHtmlAttribute(attributes, "rel")?.toLowerCase();
      const property = this.readHtmlAttribute(
        attributes,
        "property",
      )?.toLowerCase();
      const rawUrl =
        this.readHtmlAttribute(attributes, "href") ??
        this.readHtmlAttribute(attributes, "content");

      if (rawUrl && rel?.includes("canonical")) {
        addCandidate("canonical", rawUrl, 20, { textContext: attributes });
      } else if (rawUrl && property === "og:url") {
        addCandidate("og", rawUrl, 20, { textContext: attributes });
      }
    }

    for (const match of normalizedBody.matchAll(
      /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
    )) {
      const attributes = match[1] ?? "";
      const scriptBody = match[2]?.trim() ?? "";

      if (/__PRELOADED_STATE__/i.test(attributes)) {
        const parsed = this.tryParseJson(scriptBody);

        if (parsed !== undefined) {
          this.collectJsonCandidates(parsed, "json_field", [], addCandidate);
        }
      }

      if (/application\/ld\+json/i.test(attributes)) {
        const parsed = this.tryParseJson(scriptBody);

        if (parsed !== undefined) {
          this.collectJsonCandidates(parsed, "json_ld", [], addCandidate);
        }
        continue;
      }

      for (const marker of [
        "__PRELOADED_STATE__",
        "window.__PRELOADED_STATE__",
      ]) {
        const parsed = this.extractAssignedJson(scriptBody, marker);

        if (parsed !== undefined) {
          this.collectJsonCandidates(parsed, "json_field", [], addCandidate);
        }
      }
    }

    return this.rankAndMergeCandidates(candidates);
  }

  private collectJsonCandidates(
    value: unknown,
    source: "json_field" | "json_ld",
    path: string[],
    addCandidate: (
      source: MercadoLivreSocialCandidate["source"],
      rawUrl: string,
      score: number,
      options?: { title?: string; textContext?: string },
    ) => void,
  ): void {
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        this.collectJsonCandidates(
          item,
          source,
          [...path, String(index)],
          addCandidate,
        ),
      );
      return;
    }

    if (!value || typeof value !== "object") {
      return;
    }

    const record = value as Record<string, unknown>;
    const typeValue = Array.isArray(record["@type"])
      ? record["@type"].join(" ")
      : String(record["@type"] ?? "");
    const isJsonLdProduct =
      source !== "json_ld" ||
      /(^|\W)product(\W|$)/i.test(typeValue) ||
      path.includes("__product__");
    const childPath = isJsonLdProduct ? [...path, "__product__"] : path;
    const title = this.readJsonTitle(record);

    for (const [key, item] of Object.entries(record)) {
      const normalizedKey = key.replace(/[_-]/g, "").toLowerCase();
      const nextPath = [...childPath, key];

      if (
        typeof item === "string" &&
        ["url", "permalink", "targeturl", "itemurl", "producturl"].includes(
          normalizedKey,
        ) &&
        isJsonLdProduct
      ) {
        addCandidate(source, item, 50, {
          title,
          textContext: nextPath.join("."),
        });
      }

      if (typeof item === "object" && item !== null) {
        this.collectJsonCandidates(item, source, nextPath, addCandidate);
      }
    }
  }

  private rankAndMergeCandidates(
    candidates: MercadoLivreSocialCandidate[],
  ): MercadoLivreSocialCandidate[] {
    const groups = new Map<string, MercadoLivreSocialCandidate[]>();

    for (const candidate of candidates) {
      const key = candidate.itemId ?? candidate.url;
      groups.set(key, [...(groups.get(key) ?? []), candidate]);
    }

    const differentCandidatePenalty = groups.size >= 4 ? -40 : 0;

    return [...groups.values()]
      .map((group) => {
        const sorted = [...group].sort((a, b) => b.score - a.score);
        const best = sorted[0]!;
        const distinctUrls = new Set(group.map((candidate) => candidate.url));

        return {
          ...best,
          score:
            best.score +
            (distinctUrls.size > 1 ? -50 : 0) +
            differentCandidatePenalty,
          ...(best.title
            ? {}
            : {
                title: group.find((candidate) => candidate.title)?.title,
              }),
        };
      })
      .map((candidate) =>
        candidate.title
          ? candidate
          : {
              source: candidate.source,
              url: candidate.url,
              score: candidate.score,
              ...(candidate.itemId ? { itemId: candidate.itemId } : {}),
              ...(candidate.textContext
                ? { textContext: candidate.textContext }
                : {}),
            },
      )
      .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url))
      .slice(0, 20);
  }

  private readHtmlAttribute(
    attributes: string,
    name: string,
  ): string | undefined {
    const match = attributes.match(
      new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"),
    );

    return match?.[1] ?? match?.[2];
  }

  private readJsonTitle(record: Record<string, unknown>): string | undefined {
    for (const key of ["title", "name", "itemTitle", "productTitle"]) {
      const value = record[key];

      if (typeof value === "string" && value.trim()) {
        return value;
      }
    }

    return undefined;
  }

  extractOfferKeywords(messageText: string): string[] {
    const stopWords = new Set([
      "app",
      "cupom",
      "frete",
      "loja",
      "oferta",
      "oficial",
      "pegar",
      "pix",
      "por",
      "promocao",
      "promo",
      "aproveitar",
      "comprar",
      "desconto",
      "agora",
      "aqui",
      "para",
      "com",
      "sem",
      "de",
      "do",
      "da",
      "em",
      "no",
      "na",
      "que",
      "compre",
      "garanta",
      "dos",
      "das",
      "uma",
      "uns",
    ]);
    const normalizedLines = messageText
      .replace(/https?:\/\/\S+/gi, " ")
      .split(/\r?\n/)
      .map((line) =>
        this.normalizeComparableText(
          line
            .replace(/\b(?:r\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}\b/gi, " ")
            .replace(/\b\d+%\b/g, " "),
        ),
      )
      .filter(Boolean);
    const normalized =
      normalizedLines
        .map((line) => ({
          line,
          score:
            line.split(" ").filter((word) => word.length >= 3).length +
            (/\b\d+(?:g|kg|mg|ml|l|un|und|caps)\b/i.test(line) ? 5 : 0),
        }))
        .sort((a, b) => b.score - a.score)[0]?.line ?? "";
    const keywords: string[] = [];
    const seen = new Set<string>();

    for (const word of normalized.split(" ")) {
      if (
        word.length < 3 ||
        stopWords.has(word) ||
        (/^\d+$/.test(word) && word.length < 3)
      ) {
        continue;
      }

      if (!seen.has(word)) {
        seen.add(word);
        keywords.push(word);
      }
    }

    return keywords;
  }

  private scoreCandidateForOffer(
    candidate: MercadoLivreSocialCandidate,
    offerKeywords: string[],
  ): MercadoLivreSocialCandidate {
    const normalizedTitle = this.normalizeComparableText(candidate.title ?? "");
    const normalizedContext = this.normalizeComparableText(
      candidate.textContext ?? "",
    );
    const normalizedUrl = this.normalizeComparableText(
      this.safeDecodeURIComponent(candidate.url),
    );
    const corpus = `${normalizedTitle} ${normalizedContext} ${normalizedUrl}`;
    const matchedKeywords = offerKeywords.filter((keyword) =>
      this.containsComparableToken(corpus, keyword),
    );
    const likelyBrands = this.readLikelyBrandKeywords(offerKeywords);
    const brandMatch = likelyBrands.some((brand) =>
      this.containsComparableToken(corpus, brand),
    );
    const quantities = offerKeywords.filter((keyword) =>
      this.isQuantityKeyword(keyword),
    );
    const quantityMatch = quantities.some((quantity) =>
      this.containsComparableToken(corpus, quantity),
    );
    const consecutiveMatch = this.hasConsecutiveKeywordMatch(
      offerKeywords,
      corpus,
    );
    const negativeText = this.hasNegativeCandidateContext(
      `${candidate.title ?? ""} ${candidate.textContext ?? ""}`,
    );
    const recommendationSource = this.hasRecommendationSource(
      candidate.textContext ?? "",
    );
    const matchReasons = [
      matchedKeywords.length > 0
        ? `KEYWORDS:${matchedKeywords.join("|")}`
        : undefined,
      brandMatch ? "BRAND_MATCH" : undefined,
      quantityMatch ? "QUANTITY_MATCH" : undefined,
      consecutiveMatch ? "CONSECUTIVE_WORDS_MATCH" : undefined,
      negativeText ? "NEGATIVE_TEXT" : undefined,
      recommendationSource ? "RECOMMENDATION_SOURCE" : undefined,
    ].filter((reason): reason is string => Boolean(reason));
    const score =
      candidate.score +
      matchedKeywords.length * 15 +
      (brandMatch ? 30 : 0) +
      (quantityMatch ? 30 : 0) +
      (consecutiveMatch ? 20 : 0) +
      (negativeText ? -50 : 0) +
      (recommendationSource ? -100 : 0);
    const hasUsefulText =
      this.readComparableWords(normalizedTitle).length >= 2 ||
      this.readComparableWords(normalizedContext).length >= 3;

    return {
      ...candidate,
      score,
      matchedKeywords,
      matchReason: matchReasons.join(",") || undefined,
      strongTextMatch: matchedKeywords.length >= 3,
      ...(!hasUsefulText
        ? { rejectedReason: "INSUFFICIENT_TEXT_CONTEXT" }
        : {}),
    };
  }

  private pickCandidateTitle(
    ...values: Array<string | undefined>
  ): string | undefined {
    const ignored =
      /^(comprar|produto|ver produto|ir para produto|saiba mais)$/i;

    return values
      .map((value) => this.cleanText(value))
      .find((value) => value && !ignored.test(value));
  }

  private readImageAlt(html: string): string | undefined {
    const image = html.match(/<img\b([^>]*)>/i);

    return image ? this.readHtmlAttribute(image[1] ?? "", "alt") : undefined;
  }

  private readCandidateThreshold(name: string, fallback: number): number {
    const parsed = Number.parseInt(process.env[name] ?? "", 10);

    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  private containsComparableToken(corpus: string, token: string): boolean {
    return new RegExp(`(?:^|\\s)${this.escapeRegex(token)}(?:$|\\s)`).test(
      corpus,
    );
  }

  private readLikelyBrandKeywords(keywords: string[]): string[] {
    const generic = new Set([
      "creatina",
      "suplemento",
      "monohidratada",
      "pura",
      "capsulas",
      "caps",
      "comprimidos",
      "produto",
      "kit",
      "sabor",
      "po",
      "gramas",
    ]);

    return keywords.filter(
      (keyword) =>
        /^[a-z][a-z0-9]{3,}$/.test(keyword) &&
        !generic.has(keyword) &&
        !this.isQuantityKeyword(keyword),
    );
  }

  private isQuantityKeyword(keyword: string): boolean {
    return /^(?:\d+(?:g|kg|mg|ml|l|un|und|caps|capsulas)|caps|capsulas|unidades?)$/i.test(
      keyword,
    );
  }

  private hasConsecutiveKeywordMatch(
    keywords: string[],
    corpus: string,
  ): boolean {
    for (let index = 0; index <= keywords.length - 3; index += 1) {
      if (corpus.includes(keywords.slice(index, index + 3).join(" "))) {
        return true;
      }
    }

    return false;
  }

  private hasRecommendationSource(value: string): boolean {
    return /\b(recommendations?|reco|similar|sponsored|patrocinado)\b/i.test(
      value,
    );
  }

  private readComparableWords(value: string): string[] {
    return value.split(" ").filter((word) => word.length >= 3);
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private safeDecodeURIComponent(value: string): string {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  private extractAssignedJson(body: string, marker: string): unknown {
    const markerIndex = body.indexOf(marker);

    if (markerIndex < 0) {
      return undefined;
    }

    const assignmentIndex = body.indexOf("=", markerIndex + marker.length);

    if (assignmentIndex < 0) {
      return undefined;
    }

    const assignmentBody = body.slice(assignmentIndex + 1);
    const starts = [
      assignmentBody.indexOf("{"),
      assignmentBody.indexOf("["),
    ].filter((index) => index >= 0);
    const start = starts.length > 0 ? Math.min(...starts) : -1;

    if (start < 0) {
      return undefined;
    }

    const absoluteStart = assignmentIndex + 1 + start;
    const opening = body[absoluteStart];
    const closing = opening === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = absoluteStart; index < body.length; index += 1) {
      const character = body[index]!;

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === '"') {
          inString = false;
        }
        continue;
      }

      if (character === '"') {
        inString = true;
      } else if (character === opening) {
        depth += 1;
      } else if (character === closing) {
        depth -= 1;

        if (depth === 0) {
          return this.tryParseJson(body.slice(absoluteStart, index + 1));
        }
      }
    }

    return undefined;
  }

  private tryParseJson(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }

  private normalizeProductCandidateUrl(
    rawUrl: string,
    baseUrl: string,
  ): string | undefined {
    let value = this.decodeEscapedText(rawUrl).trim();

    try {
      value = decodeURIComponent(value);
    } catch {
      // The value may already be decoded.
    }

    try {
      const url = new URL(value, baseUrl);

      if (!this.isMercadoLivreProductUrl(url.toString())) {
        return undefined;
      }

      url.hash = "";
      url.search = "";
      return url.toString();
    } catch {
      return undefined;
    }
  }

  private hasNegativeCandidateContext(value: string): boolean {
    return /\b(recommendation|recommendations|recommended|reco|similar|sponsored|patrocinado|wishlist|bookmarks)\b/i.test(
      value,
    );
  }

  private hasActionCandidateContext(value: string): boolean {
    return /\b(buy|comprar|ver produto|go|redirect|target)\b/i.test(value);
  }

  private titleMatchesMessage(title: string, message: string): boolean {
    const stopWords = new Set([
      "para",
      "com",
      "sem",
      "por",
      "uma",
      "das",
      "dos",
      "produto",
      "oferta",
      "mercado",
      "livre",
    ]);
    const titleWords = this.normalizeComparableText(title)
      .split(" ")
      .filter((word) => word.length >= 4 && !stopWords.has(word));
    const messageWords = new Set(
      this.normalizeComparableText(message).split(" ").filter(Boolean),
    );
    const matches = titleWords.filter((word) => messageWords.has(word)).length;

    return matches >= Math.min(2, Math.max(1, titleWords.length));
  }

  private normalizeComparableText(value: string): string {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  private cleanText(value?: string): string | undefined {
    const cleaned = value
      ?.replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&quot;/gi, '"')
      .replace(/&amp;/gi, "&")
      .replace(/\s+/g, " ")
      .trim();

    return cleaned || undefined;
  }

  extractProductUrlFromSocialPage(body: string): {
    url?: string;
    confidence: "explicit" | "canonical" | "none";
  } {
    const normalizedBody = this.decodeEscapedText(body);
    const explicitPatterns = [
      /["'](?:origin_url|originUrl|originURL)["']\s*:\s*["']([^"']+)["']/gi,
      /["'](?:original_url|originalUrl|target_url|targetUrl|item_url|itemUrl|product_url|productUrl)["']\s*:\s*["']([^"']+)["']/gi,
    ];

    for (const pattern of explicitPatterns) {
      for (const match of normalizedBody.matchAll(pattern)) {
        const productUrl = this.normalizeProductUrl(match[1] ?? "");

        if (productUrl) {
          return {
            url: productUrl,
            confidence: "explicit",
          };
        }
      }
    }

    const canonicalPatterns = [
      /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/gi,
      /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/gi,
    ];

    for (const pattern of canonicalPatterns) {
      for (const match of normalizedBody.matchAll(pattern)) {
        const productUrl = this.normalizeProductUrl(match[1] ?? "");

        if (productUrl && this.isCanonicalProductUrl(productUrl)) {
          return {
            url: productUrl,
            confidence: "canonical",
          };
        }
      }
    }

    return { confidence: "none" };
  }

  private normalizeProductUrl(value: string): string | undefined {
    let normalized = this.decodeEscapedText(value).trim();

    try {
      normalized = decodeURIComponent(normalized);
    } catch {
      // The candidate may already be decoded.
    }

    try {
      const url = new URL(normalized);
      if (!this.isMercadoLivreProductUrl(url.toString())) {
        return undefined;
      }

      return url.toString();
    } catch {
      return undefined;
    }
  }

  isMercadoLivreProductUrl(value: string): boolean {
    return this.isOfficialMercadoLivreProductUrl(value);
  }

  isOfficialMercadoLivreProductUrl(value: string): boolean {
    try {
      const url = new URL(value);
      const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
      const pathname = url.pathname.toLowerCase();
      const isMercadoLivreHost =
        hostname === "mercadolivre.com.br" ||
        hostname === "produto.mercadolivre.com.br";

      return (
        isMercadoLivreHost &&
        /\/mlb-\d+/i.test(url.pathname) &&
        !pathname.includes("/social/") &&
        !pathname.includes("/lists") &&
        !pathname.includes("/bookmarks/") &&
        !pathname.includes("/wishlist/") &&
        !pathname.includes("/recommendations/") &&
        !pathname.includes("/recommendation/") &&
        !pathname.includes("/reco/") &&
        !pathname.includes("/sponsored/")
      );
    } catch {
      return false;
    }
  }

  private isCanonicalProductUrl(value: string): boolean {
    try {
      return (
        this.isMercadoLivreProductUrl(value) &&
        /\/mlb-\d+.*-_jm\/?$/i.test(new URL(value).pathname)
      );
    } catch {
      return false;
    }
  }

  private decodeEscapedText(value: string): string {
    return value
      .replace(/\\u002F/gi, "/")
      .replace(/\\u003A/gi, ":")
      .replace(/\\\//g, "/")
      .replace(/&quot;/gi, '"')
      .replace(/&amp;/gi, "&");
  }

  private isSocialUrl(url: string): boolean {
    try {
      const pathname = new URL(url).pathname.toLowerCase();

      return pathname.includes("/social/") || pathname.includes("/lists");
    } catch {
      return false;
    }
  }

  private socialPageHeaders(ssid: string): Record<string, string> {
    return {
      Accept: "text/html,application/xhtml+xml,application/json",
      "Accept-Language": "pt-BR,pt;q=0.9",
      Origin: "https://produto.mercadolivre.com.br",
      Referer: "https://produto.mercadolivre.com.br/",
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
      Cookie: this.buildSsidCookie(ssid),
    };
  }

  private normalizeCandidateUrl(
    rawUrl: string,
    baseUrl: string,
  ): string | undefined {
    let value = this.decodeEscapedText(rawUrl).trim();

    try {
      value = decodeURIComponent(value);
    } catch {
      // The candidate may already be decoded.
    }

    try {
      const url = new URL(value, baseUrl);

      return /\/MLB-\d+/i.test(url.pathname) ? url.toString() : undefined;
    } catch {
      return undefined;
    }
  }

  private readTextContext(body: string, index: number): string | undefined {
    const start = Math.max(0, index - 60);
    const context = body
      .slice(start, start + 120)
      .replace(/\s+/g, " ")
      .trim();

    return context || undefined;
  }

  private buildSsidCookie(ssid: string): string {
    return /(?:^|;\s*)ssid=/i.test(ssid) ? ssid : `ssid=${ssid}`;
  }

  private readSsid(
    metadata: AffiliateCredential["metadata"],
  ): string | undefined {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      return undefined;
    }

    for (const key of ["ssid", "sessionToken", "mlSessionToken"]) {
      const value = metadata[key];

      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }

    return undefined;
  }

  private readMetadataString(
    metadata: AffiliateCredential["metadata"],
    key: string,
  ): string | undefined {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      return undefined;
    }

    const value = metadata[key];

    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }

  private readHostname(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      return "";
    }
  }

  private readMode(): "real" | "legacy" | "disabled" {
    const mode = process.env.MERCADO_LIVRE_MODE?.trim().toLowerCase();

    return mode === "legacy" || mode === "disabled" ? mode : "real";
  }

  private isFatalGenerationError(error: unknown): boolean {
    return (
      error instanceof MercadoLivreGeneratorConfigMissingError ||
      error instanceof MercadoLivreSessionInvalidError
    );
  }

  private readGenerationFailureReason(error: unknown): string {
    if (error instanceof MercadoLivreGeneratorConfigMissingError) {
      return error.code;
    }

    if (error instanceof MercadoLivreSessionInvalidError) {
      return error.code;
    }

    return "MERCADO_LIVRE_GENERATION_FAILED";
  }

  private summarizeError(error: unknown): string {
    const message = error instanceof Error ? error.message : "Unknown error";

    return message.replace(/ssid=[^;\s]+/gi, "ssid=[REDACTED]").slice(0, 240);
  }
}
