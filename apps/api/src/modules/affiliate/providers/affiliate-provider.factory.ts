import { Marketplace } from "../helpers/detect-marketplace";
import { AmazonAffiliateProvider } from "./amazon.provider";
import type { AffiliateProvider } from "./affiliate-provider.interface";
import { MercadoLivreAffiliateProvider } from "./mercadolivre.provider";
import { ShopeeAffiliateProvider } from "./shopee.provider";

export function getAffiliateProvider(
  marketplace: Marketplace,
): AffiliateProvider | null {
  switch (marketplace) {
    case Marketplace.AMAZON:
      return new AmazonAffiliateProvider();
    case Marketplace.MERCADO_LIVRE:
      return new MercadoLivreAffiliateProvider();
    case Marketplace.SHOPEE:
      return new ShopeeAffiliateProvider();
    case Marketplace.UNKNOWN:
      return null;
  }
}
