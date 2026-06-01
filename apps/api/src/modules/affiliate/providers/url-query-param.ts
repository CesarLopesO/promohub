export function addQueryParam(
  originalUrl: string,
  key: string,
  value?: string | null,
): string {
  if (!value?.trim()) {
    return originalUrl;
  }

  const url = new URL(ensureProtocol(originalUrl));
  url.searchParams.set(key, value.trim());

  return url.toString();
}

function ensureProtocol(url: string): string {
  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  return `https://${url}`;
}
