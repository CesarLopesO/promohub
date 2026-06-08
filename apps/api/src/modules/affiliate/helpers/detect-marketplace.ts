export enum Marketplace {
  AMAZON = "amazon",
  MERCADO_LIVRE = "mercado_livre",
  SHOPEE = "shopee",
  WHATSAPP = "whatsapp",
  UNKNOWN = "unknown",
}

const MARKETPLACE_HOSTS: Array<{
  marketplace: Marketplace;
  hosts: string[];
}> = [
  {
    marketplace: Marketplace.AMAZON,
    hosts: ["amazon.com", "amazon.com.br", "amzn.to"],
  },
  {
    marketplace: Marketplace.MERCADO_LIVRE,
    hosts: ["mercadolivre.com.br", "mercadolivre.com", "meli.la"],
  },
  {
    marketplace: Marketplace.SHOPEE,
    hosts: ["shopee.com.br", "shopee.com", "shope.ee"],
  },
];

export function detectMarketplace(url: string): Marketplace {
  const hostname = readHostname(url);

  if (!hostname) {
    return Marketplace.UNKNOWN;
  }

  for (const { marketplace, hosts } of MARKETPLACE_HOSTS) {
    if (hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
      return marketplace;
    }
  }

  return Marketplace.UNKNOWN;
}

function readHostname(url: string): string | undefined {
  if (!url?.trim()) {
    return undefined;
  }

  try {
    return new URL(ensureProtocol(url.trim())).hostname
      .replace(/^www\./, "")
      .toLowerCase();
  } catch {
    return undefined;
  }
}

function ensureProtocol(url: string): string {
  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  return `https://${url}`;
}
