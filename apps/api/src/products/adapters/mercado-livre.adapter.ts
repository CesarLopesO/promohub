import { Injectable } from "@nestjs/common";

import type { ProductDto } from "../dto/product.dto";
import {
  extractFirstJsonLdProduct,
  extractMetaContent,
  fetchHtml,
  parsePrice,
  readNestedPrice,
  readNestedString,
  requireProductFields,
} from "../utils/html-product-parser";
import type { ProductAdapter } from "./product-adapter.interface";

@Injectable()
export class MercadoLivreAdapter implements ProductAdapter {
  readonly source = "mercado_livre";

  supports(url: URL): boolean {
    const hostname = url.hostname.toLowerCase();

    return (
      hostname === "mercadolivre.com.br" ||
      hostname === "www.mercadolivre.com.br" ||
      hostname.endsWith(".mercadolivre.com.br")
    );
  }

  async extract(url: URL): Promise<ProductDto> {
    const html = await fetchHtml(url);
    const jsonLd = extractFirstJsonLdProduct(html);

    const title =
      readNestedString(jsonLd, ["name"]) ??
      extractMetaContent(html, "og:title");

    const price =
      readNestedPrice(jsonLd, ["offers", "price"]) ??
      parsePrice(extractMetaContent(html, "product:price:amount"));

    const product = {
      title,
      price,
      image:
        readNestedString(jsonLd, ["image"]) ??
        extractMetaContent(html, "og:image"),
      description:
        readNestedString(jsonLd, ["description"]) ??
        extractMetaContent(html, "description"),
      source: this.source,
      url: url.toString(),
    };

    requireProductFields(product);

    return product as ProductDto;
  }
}
