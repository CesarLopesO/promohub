import { Module } from "@nestjs/common";

import { AmazonAdapter } from "./adapters/amazon.adapter";
import { MercadoLivreAdapter } from "./adapters/mercado-livre.adapter";
import { ExtractorService } from "./extractor.service";
import { ProductsController } from "./products.controller";

@Module({
  controllers: [ProductsController],
  providers: [AmazonAdapter, MercadoLivreAdapter, ExtractorService],
  exports: [ExtractorService],
})
export class ProductExtractorModule {}
