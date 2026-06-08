import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../../prisma.service";
import type { UpsertAffiliateGeneratorConfigDto } from "../dto/upsert-affiliate-generator-config.dto";

const BLOCKED_HEADER_NAMES = new Set([
  "authorization",
  "cookie",
  "x-meli-session",
]);
const SUPPORTED_METHODS = new Set(["GET", "POST"]);

@Injectable()
export class AffiliateGeneratorConfigService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.affiliateGeneratorConfig.findMany({
      orderBy: { marketplace: "asc" },
    });
  }

  async findByMarketplace(marketplace: string) {
    const config = await this.prisma.affiliateGeneratorConfig.findUnique({
      where: { marketplace: this.normalizeMarketplace(marketplace) },
    });

    if (!config) {
      throw new NotFoundException("Affiliate generator config not found.");
    }

    return config;
  }

  findActive(marketplace: string) {
    return this.prisma.affiliateGeneratorConfig.findFirst({
      where: {
        marketplace: this.normalizeMarketplace(marketplace),
        isActive: true,
      },
    });
  }

  upsert(marketplace: string, body: UpsertAffiliateGeneratorConfigDto) {
    const normalizedMarketplace = this.normalizeMarketplace(marketplace);
    const method = body.method?.trim().toUpperCase();
    const url = body.url?.trim();

    if (!SUPPORTED_METHODS.has(method)) {
      throw new BadRequestException("Method must be GET or POST.");
    }

    if (!url) {
      throw new BadRequestException("Generator URL is required.");
    }

    this.assertSafeTemplate(url, "url");
    const headers = this.normalizeHeaders(body.headers);
    const bodyTemplate = this.normalizeJson(body.bodyTemplate, "bodyTemplate");
    this.assertSafeTemplate(bodyTemplate, "bodyTemplate");
    const responsePath = body.responsePath?.trim() || null;
    const data = {
      method,
      url,
      headers,
      bodyTemplate,
      responsePath,
      isActive: body.isActive ?? true,
    };

    return this.prisma.affiliateGeneratorConfig.upsert({
      where: { marketplace: normalizedMarketplace },
      create: {
        marketplace: normalizedMarketplace,
        ...data,
      },
      update: data,
    });
  }

  private normalizeHeaders(value: unknown): Prisma.InputJsonValue | undefined {
    const headers = this.normalizeJson(value, "headers");

    if (headers === undefined) {
      return undefined;
    }

    if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
      throw new BadRequestException("Headers must be a JSON object.");
    }

    for (const [name, headerValue] of Object.entries(headers)) {
      if (BLOCKED_HEADER_NAMES.has(name.trim().toLowerCase())) {
        throw new BadRequestException(`Header ${name} is not allowed.`);
      }

      if (typeof headerValue !== "string") {
        throw new BadRequestException("Header values must be strings.");
      }
    }

    this.assertSafeTemplate(headers, "headers");

    return headers;
  }

  private normalizeJson(
    value: unknown,
    fieldName: string,
  ): Prisma.InputJsonValue | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    try {
      return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
    } catch {
      throw new BadRequestException(`${fieldName} must be valid JSON.`);
    }
  }

  private assertSafeTemplate(value: unknown, fieldName: string): void {
    const serialized =
      typeof value === "string" ? value : JSON.stringify(value ?? "");

    if (/ssid/i.test(serialized)) {
      throw new BadRequestException(`${fieldName} must not contain ssid.`);
    }
  }

  private normalizeMarketplace(value: string): string {
    const marketplace = value?.trim().toLowerCase();

    if (marketplace !== "mercado_livre") {
      throw new BadRequestException("Unsupported marketplace.");
    }

    return marketplace;
  }
}
