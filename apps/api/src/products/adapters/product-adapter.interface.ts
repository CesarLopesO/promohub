import type { ProductDto } from "../dto/product.dto";

export interface ProductAdapter {
  readonly source: string;
  supports(url: URL): boolean;
  extract(url: URL): Promise<ProductDto>;
}
