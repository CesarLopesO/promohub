import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
} from "@nestjs/common";

import { AmazonAdapter } from "./adapters/amazon.adapter";
import { MercadoLivreAdapter } from "./adapters/mercado-livre.adapter";
import type { ProductAdapter } from "./adapters/product-adapter.interface";
import type { ProductDto } from "./dto/product.dto";

@Injectable()
export class ExtractorService {
  private readonly adapters: ProductAdapter[];

  constructor(
    @Inject(AmazonAdapter)
    amazonAdapter: AmazonAdapter,
    @Inject(MercadoLivreAdapter)
    mercadoLivreAdapter: MercadoLivreAdapter,
  ) {
    this.adapters = [
      amazonAdapter,
      mercadoLivreAdapter,
      // Future adapters: ShopeeAdapter, MagaluAdapter, AliExpressAdapter.
    ];
  }

  async extract(rawUrl: string): Promise<ProductDto> {
    const url = this.parseUrl(rawUrl);
    const adapter = this.adapters.find((candidate) => candidate.supports(url));

    if (!adapter) {
      throw new BadRequestException(
        "Unsupported product URL. Supported sources: Amazon Brasil, Mercado Livre.",
      );
    }

    try {
      return await adapter.extract(url);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Product extraction failed";

      throw new BadGatewayException(message);
    }
  }

  private parseUrl(rawUrl: string): URL {
    if (!rawUrl || typeof rawUrl !== "string") {
      throw new BadRequestException("Field url is required.");
    }

    try {
      const url = new URL(rawUrl);

      if (!["http:", "https:"].includes(url.protocol)) {
        throw new BadRequestException(
          "Only HTTP and HTTPS URLs are supported.",
        );
      }

      return url;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException("Invalid URL.");
    }
  }
}
