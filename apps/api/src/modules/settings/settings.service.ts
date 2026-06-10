import { BadRequestException, Injectable } from "@nestjs/common";

import { PrismaService } from "../../prisma.service";
import type { PublicSettings, UpdateSettingsInput } from "./settings.types";

const PUBLIC_SETTING_KEYS = [
  "supportEmail",
  "supportWhatsappUrl",
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
}
