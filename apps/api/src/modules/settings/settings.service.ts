import { BadRequestException, Injectable } from "@nestjs/common";

import { PrismaService } from "../../prisma.service";
import type {
  CredentialTutorialSettings,
  PublicSettings,
  UpdateSettingsInput,
} from "./settings.types";
import { DEFAULT_FREE_PLAN_SIGNATURE } from "./settings.types";

const TUTORIAL_SETTING_FIELDS = [
  ["credentialTutorialAmazonTitle", "title"],
  ["credentialTutorialAmazonBody", "body"],
  ["credentialTutorialAmazonVideoUrl", "videoUrl"],
  ["credentialTutorialMercadoLivreTitle", "title"],
  ["credentialTutorialMercadoLivreBody", "body"],
  ["credentialTutorialMercadoLivreVideoUrl", "videoUrl"],
  ["credentialTutorialShopeeTitle", "title"],
  ["credentialTutorialShopeeBody", "body"],
  ["credentialTutorialShopeeVideoUrl", "videoUrl"],
  ["credentialTutorialAliExpressTitle", "title"],
  ["credentialTutorialAliExpressBody", "body"],
  ["credentialTutorialAliExpressVideoUrl", "videoUrl"],
  ["credentialTutorialMagazineLuizaTitle", "title"],
  ["credentialTutorialMagazineLuizaBody", "body"],
  ["credentialTutorialMagazineLuizaVideoUrl", "videoUrl"],
  ["credentialTutorialCasasBahiaTitle", "title"],
  ["credentialTutorialCasasBahiaBody", "body"],
  ["credentialTutorialCasasBahiaVideoUrl", "videoUrl"],
  ["credentialTutorialPontoTitle", "title"],
  ["credentialTutorialPontoBody", "body"],
  ["credentialTutorialPontoVideoUrl", "videoUrl"],
  ["credentialTutorialExtraTitle", "title"],
  ["credentialTutorialExtraBody", "body"],
  ["credentialTutorialExtraVideoUrl", "videoUrl"],
  ["credentialTutorialKabumTitle", "title"],
  ["credentialTutorialKabumBody", "body"],
  ["credentialTutorialKabumVideoUrl", "videoUrl"],
  ["credentialTutorialNetshoesTitle", "title"],
  ["credentialTutorialNetshoesBody", "body"],
  ["credentialTutorialNetshoesVideoUrl", "videoUrl"],
] as const satisfies ReadonlyArray<
  readonly [keyof CredentialTutorialSettings, "title" | "body" | "videoUrl"]
>;

const PUBLIC_SETTING_KEYS = [
  "supportEmail",
  "supportWhatsappUrl",
  "freePlanSignature",
  ...TUTORIAL_SETTING_FIELDS.map(([key]) => key),
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
    const credentialTutorialSettings = Object.fromEntries(
      TUTORIAL_SETTING_FIELDS.map(([key, kind]) => [
        key,
        this.readStoredTutorialValue(values.get(key), key, kind),
      ]),
    ) as CredentialTutorialSettings;

    return {
      supportEmail: values.get("supportEmail") ?? "",
      supportWhatsappUrl: values.get("supportWhatsappUrl") ?? "",
      freePlanSignature:
        values.get("freePlanSignature")?.trim() || DEFAULT_FREE_PLAN_SIGNATURE,
      ...credentialTutorialSettings,
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

    for (const [key, kind] of TUTORIAL_SETTING_FIELDS) {
      if (input[key] !== undefined) {
        updates.push({
          key,
          value: this.normalizeTutorialValue(input[key], key, kind),
        });
      }
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

  private normalizeTutorialValue(
    value: unknown,
    key: keyof CredentialTutorialSettings,
    kind: "title" | "body" | "videoUrl",
  ): string {
    if (typeof value !== "string") {
      throw new BadRequestException(`${key} must be a string.`);
    }

    const normalized = value.trim();

    if (!normalized) {
      return "";
    }

    const maxLength = kind === "title" ? 120 : kind === "body" ? 3000 : 500;

    if (normalized.length > maxLength) {
      throw new BadRequestException(
        `${key} must have at most ${maxLength} characters.`,
      );
    }

    if (kind !== "videoUrl") {
      if (/<[^>]+>/.test(normalized)) {
        throw new BadRequestException(`${key} must not contain HTML.`);
      }

      return normalized;
    }

    let parsedUrl: URL;

    try {
      parsedUrl = new URL(normalized);
    } catch {
      throw new BadRequestException(`${key} must be a valid HTTP(S) URL.`);
    }

    if (
      !["http:", "https:"].includes(parsedUrl.protocol) ||
      parsedUrl.username ||
      parsedUrl.password
    ) {
      throw new BadRequestException(`${key} must be a valid HTTP(S) URL.`);
    }

    return normalized;
  }

  private readStoredTutorialValue(
    value: string | undefined,
    key: keyof CredentialTutorialSettings,
    kind: "title" | "body" | "videoUrl",
  ): string {
    try {
      return this.normalizeTutorialValue(value ?? "", key, kind);
    } catch {
      return "";
    }
  }
}
