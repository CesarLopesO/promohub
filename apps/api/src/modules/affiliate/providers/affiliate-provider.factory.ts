import { Marketplace } from "../helpers/detect-marketplace";
import { AmazonAffiliateProvider } from "./amazon.provider";
import type { AffiliateProvider } from "./affiliate-provider.interface";
import { MercadoLivreAffiliateProvider } from "./mercadolivre.provider";
import { MagazineLuizaAffiliateProvider } from "./magazine-luiza.provider";
import { ShopeeAffiliateProvider } from "./shopee.provider";

export function getAffiliateProvider(
  marketplace: Marketplace,
  mercadoLivreProvider: MercadoLivreAffiliateProvider,
  amazonProvider: AmazonAffiliateProvider,
): AffiliateProvider | null {
  switch (marketplace) {
    case Marketplace.AMAZON:
      return amazonProvider;
    case Marketplace.MERCADO_LIVRE:
      return mercadoLivreProvider;
    case Marketplace.SHOPEE:
      return new ShopeeAffiliateProvider();
    case Marketplace.MAGAZINE_LUIZA:
      return new MagazineLuizaAffiliateProvider();
    case Marketplace.UNKNOWN:
    case Marketplace.WHATSAPP:
      return null;
  }
}
