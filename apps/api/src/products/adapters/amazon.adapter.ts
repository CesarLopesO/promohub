import { Injectable } from "@nestjs/common";

import type { ProductDto } from "../dto/product.dto";
import {
  extractElementTextById,
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
export class AmazonAdapter implements ProductAdapter {
  readonly source = "amazon";

  supports(url: URL): boolean {
    return ["amazon.com.br", "www.amazon.com.br", "amzn.to"].includes(
      url.hostname.toLowerCase(),
    );
  }

  async extract(url: URL): Promise<ProductDto> {
    const html = await fetchHtml(url);
    const jsonLd = extractFirstJsonLdProduct(html);

    const title =
      readNestedString(jsonLd, ["name"]) ??
      extractElementTextById(html, "productTitle") ??
      extractMetaContent(html, "og:title");

    const price =
      readNestedPrice(jsonLd, ["offers", "price"]) ??
      parsePrice(extractElementTextById(html, "priceblock_ourprice")) ??
      parsePrice(extractElementTextById(html, "priceblock_dealprice")) ??
      parsePrice(extractMetaContent(html, "product:price:amount"));

    const product = {
      title,
      price,
      oldPrice: parsePrice(extractElementTextById(html, "listPrice")),
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
