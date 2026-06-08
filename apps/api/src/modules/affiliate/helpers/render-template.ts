export type AffiliateGeneratorTemplateContext = {
  originalUrl: string;
  resolvedUrl?: string;
  itemId?: string;
  affiliateId: string;
};

const PLACEHOLDER_PATTERN =
  /\{\{(originalUrl|resolvedUrl|itemId|affiliateId)\}\}/g;

export function renderTemplate<T>(
  value: T,
  context: AffiliateGeneratorTemplateContext,
): T {
  if (typeof value === "string") {
    return value.replace(
      PLACEHOLDER_PATTERN,
      (_match, key: keyof AffiliateGeneratorTemplateContext) =>
        context[key] ?? "",
    ) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => renderTemplate(item, context)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        renderTemplate(key, context),
        renderTemplate(item, context),
      ]),
    ) as T;
  }

  return value;
}
