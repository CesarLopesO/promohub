import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../prisma.service";
import {
  encryptCredentialSecrets,
  hasSessionToken,
} from "./affiliate-credential-secrets";
import type { CreateAffiliateCredentialDto } from "./dto/create-affiliate-credential.dto";
import type { UpdateAffiliateCredentialDto } from "./dto/update-affiliate-credential.dto";
import { Marketplace } from "./helpers/detect-marketplace";

export type AffiliateCredentialDto = {
  id: string;
  userId: string;
  marketplace: Marketplace;
  affiliateId?: string;
  trackingId?: string;
  storeSlug?: string;
  hasApiKey: boolean;
  hasApiSecret: boolean;
  hasSessionToken: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class AffiliateCredentialsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    body: CreateAffiliateCredentialDto & { userId: string },
  ): Promise<AffiliateCredentialDto> {
    const userId = this.normalizeRequiredString(body.userId, "userId");
    const marketplace = this.normalizeMarketplace(body.marketplace);
    const data = this.toCredentialData(body, marketplace);

    const credential = await this.prisma.affiliateCredential.upsert({
      where: {
        userId_marketplace: {
          userId,
          marketplace,
        },
      },
      create: {
        userId,
        marketplace,
        ...data,
        isActive: true,
      },
      update: {
        ...data,
        isActive: true,
      },
    });

    return this.toDto(credential);
  }

  async list(userId?: string): Promise<AffiliateCredentialDto[]> {
    const credentials = await this.prisma.affiliateCredential.findMany({
      where: {
        isActive: true,
        ...(userId?.trim()
          ? {
              userId: userId.trim(),
            }
          : {}),
      },
      orderBy: [
        {
          marketplace: "asc",
        },
        {
          createdAt: "asc",
        },
      ],
    });

    return credentials.map((credential) => this.toDto(credential));
  }

  async findOne(id: string, userId?: string): Promise<AffiliateCredentialDto> {
    const credential = await this.findCredential(id, userId);

    return this.toDto(credential);
  }

  async update(
    id: string,
    body: UpdateAffiliateCredentialDto,
    userId?: string,
  ): Promise<AffiliateCredentialDto> {
    const credential = await this.findCredential(id, userId);
    const marketplace =
      body.marketplace === undefined
        ? credential.marketplace
        : this.normalizeMarketplace(body.marketplace);
    const data = this.toCredentialData(body, marketplace, credential.storeSlug);
    const migratedSecrets = encryptCredentialSecrets({
      apiKey: credential.apiKey,
      apiSecret: credential.apiSecret,
      metadata: credential.metadata as Prisma.InputJsonValue,
    });

    const updated = await this.prisma.affiliateCredential.update({
      where: {
        id: credential.id,
      },
      data: {
        ...migratedSecrets,
        ...data,
        marketplace,
        ...(body.isActive === undefined ? {} : { isActive: body.isActive }),
      },
    });

    return this.toDto(updated);
  }

  async softDelete(
    id: string,
    userId?: string,
  ): Promise<AffiliateCredentialDto> {
    const credential = await this.findCredential(id, userId);
    const updated = await this.prisma.affiliateCredential.update({
      where: {
        id: credential.id,
      },
      data: {
        isActive: false,
      },
    });

    return this.toDto(updated);
  }

  private async findCredential(id: string, userId?: string) {
    const normalizedId = this.normalizeRequiredString(id, "id");
    const normalizedUserId = userId
      ? this.normalizeRequiredString(userId, "userId")
      : undefined;
    const credential = normalizedUserId
      ? await this.prisma.affiliateCredential.findFirst({
          where: {
            id: normalizedId,
            userId: normalizedUserId,
          },
        })
      : await this.prisma.affiliateCredential.findUnique({
          where: {
            id: normalizedId,
          },
        });

    if (!credential) {
      throw new NotFoundException("Affiliate credential not found.");
    }

    return credential;
  }

  private toCredentialData(
    body: CreateAffiliateCredentialDto | UpdateAffiliateCredentialDto,
    marketplace: string,
    currentStoreSlug?: string | null,
  ) {
    const storeSlug =
      body.storeSlug === undefined
        ? currentStoreSlug
        : this.normalizeStoreSlug(body.storeSlug);

    if (marketplace === Marketplace.MAGAZINE_LUIZA && !storeSlug) {
      throw new BadRequestException(
        "Field storeSlug is required for magazine_luiza.",
      );
    }

    const data = {
      ...(body.affiliateId === undefined
        ? {}
        : { affiliateId: this.normalizeNullableString(body.affiliateId) }),
      ...(body.apiKey === undefined
        ? {}
        : { apiKey: this.normalizeNullableString(body.apiKey) }),
      ...(body.apiSecret === undefined
        ? {}
        : { apiSecret: this.normalizeNullableString(body.apiSecret) }),
      ...(body.trackingId === undefined
        ? {}
        : { trackingId: this.normalizeNullableString(body.trackingId) }),
      ...(body.storeSlug === undefined ? {} : { storeSlug }),
      ...(body.metadata === undefined
        ? {}
        : { metadata: this.toJson(body.metadata) }),
    };

    return {
      ...data,
      ...encryptCredentialSecrets(data),
    };
  }

  private toDto(credential: {
    id: string;
    userId: string;
    marketplace: string;
    affiliateId: string | null;
    apiKey: string | null;
    apiSecret: string | null;
    trackingId: string | null;
    storeSlug: string | null;
    metadata: Prisma.JsonValue | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): AffiliateCredentialDto {
    return {
      id: credential.id,
      userId: credential.userId,
      marketplace: this.normalizeMarketplace(credential.marketplace),
      affiliateId: credential.affiliateId ?? undefined,
      trackingId: credential.trackingId ?? undefined,
      storeSlug: credential.storeSlug ?? undefined,
      hasApiKey: Boolean(credential.apiKey),
      hasApiSecret: Boolean(credential.apiSecret),
      hasSessionToken: hasSessionToken(credential.metadata),
      isActive: credential.isActive,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
    };
  }

  private normalizeMarketplace(value: string): Marketplace {
    if (!Object.values(Marketplace).includes(value as Marketplace)) {
      throw new BadRequestException("Invalid marketplace.");
    }

    return value as Marketplace;
  }

  private normalizeRequiredString(value: string, fieldName: string): string {
    if (!value || typeof value !== "string" || !value.trim()) {
      throw new BadRequestException(`Field ${fieldName} is required.`);
    }

    return value.trim();
  }

  private normalizeNullableString(value: string | null): string | null {
    if (value === null) {
      return null;
    }

    return value.trim() || null;
  }

  private normalizeStoreSlug(value: string | null): string | null {
    if (value === null) {
      return null;
    }

    if (typeof value !== "string") {
      throw new BadRequestException("Field storeSlug must be a string.");
    }

    const storeSlug = value.trim().toLowerCase();

    if (!storeSlug) {
      return null;
    }

    if (
      storeSlug.length < 3 ||
      storeSlug.length > 80 ||
      !/^[a-z0-9_-]+$/.test(storeSlug)
    ) {
      throw new BadRequestException(
        "Field storeSlug must have 3 to 80 letters, numbers, hyphens, or underscores.",
      );
    }

    return storeSlug;
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
