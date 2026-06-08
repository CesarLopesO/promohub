import type { AffiliateCredential } from "@prisma/client";

export type MercadoLivreGenerationAttempt = {
  url: string;
  success: boolean;
  status?: number;
  error?: string;
};

export type MercadoLivreSocialCandidate = {
  source:
    | "primary_show_product_action"
    | "pdp_filters_item_id"
    | "cta"
    | "json_field"
    | "json_ld"
    | "canonical"
    | "og"
    | "href";
  url: string;
  path?: string;
  itemId?: string;
  score: number;
  title?: string;
  textContext?: string;
  matchReason?: string;
  strongTextMatch?: boolean;
  matchedKeywords?: string[];
  rejectedReason?: string;
};

export type MercadoLivreSocialDebug = {
  resolvedUrl: string;
  status?: number;
  pdpItemId?: string;
  htmlLength: number;
  scriptCount: number;
  candidateKeysFound: string[];
  urlsFoundCount: number;
  urlsFound: Array<{
    url: string;
    source: string;
    path?: string;
    context?: string;
  }>;
  hasPreloadedState: boolean;
  hasMelidata: boolean;
  hasNextData: boolean;
  endpointsFound: string[];
  candidates: MercadoLivreSocialCandidate[];
};

export type AffiliateProviderResult = {
  rewrittenUrl: string;
  changed: boolean;
  tag?: string;
  mode?: "real" | "legacy" | "disabled";
  reason?: string;
  error?: string;
  warning?: string;
  resolvedUrl?: string;
  attemptedPayloadUrl?: string;
  itemId?: string;
  originalItemId?: string;
  generatedItemId?: string;
  sameProduct?: boolean;
  canForward?: boolean;
  originProductUrl?: string;
  mainProductUrl?: string;
  mainProductSource?:
    | "primary_show_product_action"
    | "pdp_filters_item_id"
    | "candidate_fallback"
    | "primary_cta"
    | "preloaded_primary"
    | "none";
  mainProductPath?: string;
  strategy?:
    | "show_product_action"
    | "pdp_filters_item_id"
    | "candidate_fallback";
  finalProductUrl?: string;
  originConfidence?: "explicit" | "canonical" | "none";
  generationAttempts?: MercadoLivreGenerationAttempt[];
  socialDebug?: MercadoLivreSocialDebug;
  socialCandidates?: MercadoLivreSocialCandidate[];
  selectedCandidate?: MercadoLivreSocialCandidate;
  candidatesCount?: number;
  ambiguous?: boolean;
  selectedCandidateReason?: string;
  offerKeywords?: string[];
  cacheHit?: boolean;
  matchReason?: string;
};

export interface AffiliateProvider {
  rewriteLink(
    originalUrl: string,
    credential: AffiliateCredential,
    context?: { originalMessageText?: string },
  ): Promise<AffiliateProviderResult>;
}
