type JsonRecord = Record<string, unknown>;

const REQUEST_HEADERS = {
  "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
  "user-agent":
    "Mozilla/5.0 (compatible; PromohubBot/0.1; +https://promohub.local)",
};

export async function fetchHtml(url: URL): Promise<string> {
  const response = await fetch(url, {
    headers: REQUEST_HEADERS,
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch product page: ${response.status}`);
  }

  return response.text();
}

export function extractMetaContent(
  html: string,
  key: string,
): string | undefined {
  const escapedKey = escapeRegExp(key);
  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${escapedKey}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+name=["']${escapedKey}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escapedKey}["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escapedKey}["'][^>]*>`,
      "i",
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match?.[1]) {
      return normalizeText(decodeHtml(match[1]));
    }
  }

  return undefined;
}

export function extractElementTextById(
  html: string,
  id: string,
): string | undefined {
  const escapedId = escapeRegExp(id);
  const pattern = new RegExp(
    `<[^>]+id=["']${escapedId}["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`,
    "i",
  );
  const match = html.match(pattern);

  if (!match?.[1]) {
    return undefined;
  }

  return normalizeText(stripTags(decodeHtml(match[1])));
}

export function extractFirstJsonLdProduct(
  html: string,
): JsonRecord | undefined {
  const scriptPattern =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const matches = html.matchAll(scriptPattern);

  for (const match of matches) {
    if (!match[1]) {
      continue;
    }

    const parsed = parseJson(match[1]);
    const product = findProductRecord(parsed);

    if (product) {
      return product;
    }
  }

  return undefined;
}

export function readString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return normalizeText(value);
  }

  return undefined;
}

export function readPrice(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  return parsePrice(value);
}

export function readNestedString(
  record: JsonRecord | undefined,
  path: string[],
): string | undefined {
  const value = readNestedValue(record, path);

  return readString(value);
}

export function readNestedPrice(
  record: JsonRecord | undefined,
  path: string[],
): number | undefined {
  const value = readNestedValue(record, path);

  return readPrice(value);
}

export function parsePrice(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = normalizeText(value)
    .replace(/[^\d,.]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");

  const price = Number(normalized);

  return Number.isFinite(price) ? price : undefined;
}

export function requireProductFields(product: {
  title?: string;
  price?: number;
  source: string;
  url: string;
}) {
  if (!product.title || product.price === undefined) {
    throw new Error(`Could not extract product data from ${product.source}`);
  }
}

function findProductRecord(value: unknown): JsonRecord | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const product = findProductRecord(item);

      if (product) {
        return product;
      }
    }
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const type = value["@type"];

  if (
    type === "Product" ||
    (Array.isArray(type) && type.some((item) => item === "Product"))
  ) {
    return value;
  }

  for (const nested of Object.values(value)) {
    const product = findProductRecord(nested);

    if (product) {
      return product;
    }
  }

  return undefined;
}

function readNestedValue(
  record: JsonRecord | undefined,
  path: string[],
): unknown {
  let current: unknown = record;

  for (const key of path) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[key];
  }

  return current;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(decodeHtml(value.trim()));
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, " ");
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
