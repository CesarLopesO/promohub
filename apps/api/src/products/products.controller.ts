import { Body, Controller, Inject, Post } from "@nestjs/common";

import { ExtractProductDto } from "./dto/extract-product.dto";
import type { ProductDto } from "./dto/product.dto";
import { ExtractorService } from "./extractor.service";

@Controller("products")
export class ProductsController {
  constructor(
    @Inject(ExtractorService)
    private readonly extractorService: ExtractorService,
  ) {}

  @Post("extract")
  extract(@Body() body: ExtractProductDto): Promise<ProductDto> {
    return this.extractorService.extract(body.url);
  }
}
