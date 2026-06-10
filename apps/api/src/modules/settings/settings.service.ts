import { BadRequestException, Injectable } from "@nestjs/common";

import { PrismaService } from "../../prisma.service";
import type { PublicSettings, UpdateSettingsInput } from "./settings.types";
import { DEFAULT_FREE_PLAN_SIGNATURE } from "./settings.types";

const PUBLIC_SETTING_KEYS = [
  "supportEmail",
  "supportWhatsappUrl",
  "freePlanSignature",
] as const satisfies ReadonlyArray<keyof PublicSettings>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WHATSAPP_PREFIXES = [
  "https://wa.me/",
  "https://api.whatsapp.com/",
] as const;

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicSettings(): Promise<PublicSettings> {
    const rows = await this.prisma.appSetting.findMany({
      where: {
        key: {
          in: [...PUBLIC_SETTING_KEYS],
        },
      },
      select: {
        key: true,
        value: true,
      },
    });
    const values = new Map(rows.map((row) => [row.key, row.value]));

    return {
      supportEmail: values.get("supportEmail") ?? "",
      supportWhatsappUrl: values.get("supportWhatsappUrl") ?? "",
      freePlanSignature:
        values.get("freePlanSignature")?.trim() ||
        DEFAULT_FREE_PLAN_SIGNATURE,
    };
  }

  getAdminSettings(): Promise<PublicSettings> {
    return this.getPublicSettings();
  }

  async updateSettings(input: UpdateSettingsInput): Promise<PublicSettings> {
    const updates: Array<{ key: keyof PublicSettings; value: string }> = [];

    if (input.supportEmail !== undefined) {
      updates.push({
        key: "supportEmail",
        value: this.normalizeEmail(input.supportEmail),
      });
    }

    if (input.supportWhatsappUrl !== undefined) {
      updates.push({
        key: "supportWhatsappUrl",
        value: this.normalizeWhatsappUrl(input.supportWhatsappUrl),
      });
    }

    if (input.freePlanSignature !== undefined) {
      updates.push({
        key: "freePlanSignature",
        value: this.normalizeFreePlanSignature(input.freePlanSignature),
      });
    }

    if (updates.length > 0) {
      await this.prisma.$transaction(
        updates.map(({ key, value }) =>
          this.prisma.appSetting.upsert({
            where: { key },
            create: { key, value },
            update: { value },
          }),
        ),
      );
    }

    return this.getAdminSettings();
  }

  private normalizeEmail(value: unknown): string {
    if (typeof value !== "string") {
      throw new BadRequestException("supportEmail must be a string.");
    }

    const email = value.trim();

    if (email && !EMAIL_PATTERN.test(email)) {
      throw new BadRequestException("supportEmail must be a valid email.");
    }

    return email;
  }

  private normalizeWhatsappUrl(value: unknown): string {
    if (typeof value !== "string") {
      throw new BadRequestException("supportWhatsappUrl must be a string.");
    }

    const whatsappUrl = value.trim();

    if (!whatsappUrl) {
      return "";
    }

    if (!WHATSAPP_PREFIXES.some((prefix) => whatsappUrl.startsWith(prefix))) {
      throw new BadRequestException(
        "supportWhatsappUrl must use https://wa.me/ or https://api.whatsapp.com/.",
      );
    }

    let parsedUrl: URL;

    try {
      parsedUrl = new URL(whatsappUrl);
    } catch {
      throw new BadRequestException("supportWhatsappUrl must be a valid URL.");
    }

    const allowedHost =
      parsedUrl.hostname === "wa.me" ||
      parsedUrl.hostname === "api.whatsapp.com";

    if (
      parsedUrl.protocol !== "https:" ||
      !allowedHost ||
      parsedUrl.username ||
      parsedUrl.password
    ) {
      throw new BadRequestException(
        "supportWhatsappUrl must be a valid WhatsApp URL.",
      );
    }

    return whatsappUrl;
  }

  private normalizeFreePlanSignature(value: unknown): string {
    if (typeof value !== "string") {
      throw new BadRequestException("freePlanSignature must be a string.");
    }

    const signature = value.trim() || DEFAULT_FREE_PLAN_SIGNATURE;

    if (signature.length > 300) {
      throw new BadRequestException(
        "freePlanSignature must have at most 300 characters.",
      );
    }

    if (/<[^>]+>/.test(signature)) {
      throw new BadRequestException("freePlanSignature must not contain HTML.");
    }

    if (/(?:javascript|data)\s*:/i.test(signature)) {
      throw new BadRequestException(
        "freePlanSignature contains an unsafe URL.",
      );
    }

    return signature;
  }
}
