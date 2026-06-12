import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExecutionContext } from "@nestjs/common";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";

import { AdminGuard } from "../auth/admin.guard";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { AdminSettingsController } from "./settings.controller";
import { SettingsService } from "./settings.service";
import { DEFAULT_FREE_PLAN_SIGNATURE } from "./settings.types";

type StoredSettings = Map<string, string>;

const TUTORIAL_MARKETPLACE_KEYS = [
  [
    "credentialTutorialAmazonTitle",
    "credentialTutorialAmazonBody",
    "credentialTutorialAmazonVideoUrl",
  ],
  [
    "credentialTutorialMercadoLivreTitle",
    "credentialTutorialMercadoLivreBody",
    "credentialTutorialMercadoLivreVideoUrl",
  ],
  [
    "credentialTutorialShopeeTitle",
    "credentialTutorialShopeeBody",
    "credentialTutorialShopeeVideoUrl",
  ],
  [
    "credentialTutorialAliExpressTitle",
    "credentialTutorialAliExpressBody",
    "credentialTutorialAliExpressVideoUrl",
  ],
  [
    "credentialTutorialMagazineLuizaTitle",
    "credentialTutorialMagazineLuizaBody",
    "credentialTutorialMagazineLuizaVideoUrl",
  ],
  [
    "credentialTutorialCasasBahiaTitle",
    "credentialTutorialCasasBahiaBody",
    "credentialTutorialCasasBahiaVideoUrl",
  ],
  [
    "credentialTutorialPontoTitle",
    "credentialTutorialPontoBody",
    "credentialTutorialPontoVideoUrl",
  ],
  [
    "credentialTutorialExtraTitle",
    "credentialTutorialExtraBody",
    "credentialTutorialExtraVideoUrl",
  ],
  [
    "credentialTutorialKabumTitle",
    "credentialTutorialKabumBody",
    "credentialTutorialKabumVideoUrl",
  ],
  [
    "credentialTutorialNetshoesTitle",
    "credentialTutorialNetshoesBody",
    "credentialTutorialNetshoesVideoUrl",
  ],
] as const;

const TUTORIAL_SETTING_KEYS = TUTORIAL_MARKETPLACE_KEYS.flat();
const EMPTY_TUTORIAL_SETTINGS = Object.fromEntries(
  TUTORIAL_SETTING_KEYS.map((key) => [key, ""]),
);

function makeService(initial: Record<string, string> = {}) {
  const stored: StoredSettings = new Map(Object.entries(initial));
  const appSetting = {
    findMany: async ({ where }: { where: { key: { in: string[] } } }) =>
      [...stored.entries()]
        .filter(([key]) => where.key.in.includes(key))
        .map(([key, value]) => ({ key, value })),
    upsert:
      ({
        where,
        create,
        update,
      }: {
        where: { key: string };
        create: { key: string; value: string };
        update: { value: string };
      }) =>
      async () => {
        stored.set(
          where.key,
          stored.has(where.key) ? update.value : create.value,
        );
        return { key: where.key, value: stored.get(where.key) };
      },
  };
  const prisma = {
    appSetting,
    $transaction: async (operations: Array<() => Promise<unknown>>) =>
      Promise.all(operations.map((operation) => operation())),
  };

  return {
    service: new SettingsService(prisma as never),
    stored,
  };
}

describe("SettingsService", () => {
  it("allows an ADMIN endpoint to update supportEmail", async () => {
    const { service } = makeService();

    const result = await service.updateSettings({
      supportEmail: "  suporte@peppabot.com  ",
    });

    assert.equal(result.supportEmail, "suporte@peppabot.com");
  });

  it("allows an ADMIN endpoint to update supportWhatsappUrl", async () => {
    const { service } = makeService();
    const url = "https://wa.me/5538999999999?text=Ola";

    const result = await service.updateSettings({
      supportWhatsappUrl: ` ${url} `,
    });

    assert.equal(result.supportWhatsappUrl, url);
  });

  it("allows an ADMIN endpoint to save each marketplace tutorial", async () => {
    for (const [titleKey, bodyKey, videoUrlKey] of TUTORIAL_MARKETPLACE_KEYS) {
      const { service, stored } = makeService();
      const title = `Como obter ${titleKey}`;
      const body = "1. Faça login.\n2. Copie a credencial.";
      const videoUrl = `https://youtube.com/watch?v=${videoUrlKey}`;

      const result = await service.updateSettings({
        [titleKey]: ` ${title} `,
        [bodyKey]: ` ${body} `,
        [videoUrlKey]: ` ${videoUrl} `,
      });

      assert.equal(result[titleKey], title);
      assert.equal(result[bodyKey], body);
      assert.equal(result[videoUrlKey], videoUrl);
      assert.equal(stored.get(titleKey), title);
      assert.equal(stored.get(bodyKey), body);
      assert.equal(stored.get(videoUrlKey), videoUrl);
    }
  });

  it("protects the admin settings controller with JWT and ADMIN guards", () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      AdminSettingsController,
    ) as unknown[];

    assert.deepEqual(guards, [JwtAuthGuard, AdminGuard]);
  });

  it("does not allow a regular user to update admin settings", () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            id: "user-id",
            role: "USER",
          },
        }),
      }),
    } as ExecutionContext;

    assert.throws(
      () => new AdminGuard().canActivate(context),
      ForbiddenException,
    );
  });

  it("returns credential tutorials in public settings", async () => {
    const { service } = makeService({
      supportEmail: "suporte@peppabot.com",
      supportWhatsappUrl: "https://api.whatsapp.com/send?phone=5538999999999",
      credentialTutorialAmazonTitle: "Tutorial Amazon",
      credentialTutorialAmazonBody: "Passo 1\nPasso 2",
      credentialTutorialAmazonVideoUrl: "https://youtube.com/watch?v=amazon",
      credentialTutorialShopeeTitle: "<script>alert(1)</script>",
      credentialTutorialShopeeVideoUrl: "javascript:alert(1)",
      privateApiKey: "must-not-leak",
    });

    assert.deepEqual(await service.getPublicSettings(), {
      supportEmail: "suporte@peppabot.com",
      supportWhatsappUrl: "https://api.whatsapp.com/send?phone=5538999999999",
      freePlanSignature: DEFAULT_FREE_PLAN_SIGNATURE,
      ...EMPTY_TUTORIAL_SETTINGS,
      credentialTutorialAmazonTitle: "Tutorial Amazon",
      credentialTutorialAmazonBody: "Passo 1\nPasso 2",
      credentialTutorialAmazonVideoUrl: "https://youtube.com/watch?v=amazon",
    });
  });

  it("rejects invalid email", async () => {
    const { service } = makeService();

    await assert.rejects(
      () => service.updateSettings({ supportEmail: "not-an-email" }),
      BadRequestException,
    );
  });

  it("rejects invalid or suspicious WhatsApp URLs", async () => {
    const { service } = makeService();

    for (const value of [
      "javascript:alert(1)",
      "data:text/html,test",
      "mailto:suporte@peppabot.com",
      "texto livre",
      "https://example.com/whatsapp",
      "https://wa.me.evil.example/5538999999999",
    ]) {
      await assert.rejects(
        () => service.updateSettings({ supportWhatsappUrl: value }),
        BadRequestException,
      );
    }
  });

  it("accepts empty support fields", async () => {
    const { service } = makeService({
      supportEmail: "old@example.com",
      supportWhatsappUrl: "https://wa.me/5511999999999",
    });

    assert.deepEqual(
      await service.updateSettings({
        supportEmail: " ",
        supportWhatsappUrl: "",
      }),
      {
        supportEmail: "",
        supportWhatsappUrl: "",
        freePlanSignature: DEFAULT_FREE_PLAN_SIGNATURE,
        ...EMPTY_TUTORIAL_SETTINGS,
      },
    );
  });

  it("accepts and trims tutorial title, body and HTTP(S) video URL", async () => {
    const { service } = makeService();

    const result = await service.updateSettings({
      credentialTutorialShopeeTitle: " Como obter suas credenciais Shopee ",
      credentialTutorialShopeeBody: " 1. Login\n2. Copie a credencial ",
      credentialTutorialShopeeVideoUrl: " https://youtube.com/watch?v=shopee ",
    });

    assert.equal(
      result.credentialTutorialShopeeTitle,
      "Como obter suas credenciais Shopee",
    );
    assert.equal(
      result.credentialTutorialShopeeBody,
      "1. Login\n2. Copie a credencial",
    );
    assert.equal(
      result.credentialTutorialShopeeVideoUrl,
      "https://youtube.com/watch?v=shopee",
    );
  });

  it("rejects invalid video URLs for every marketplace", async () => {
    for (const [, , key] of TUTORIAL_MARKETPLACE_KEYS) {
      for (const value of [
        "javascript:alert(1)",
        "data:text/html,test",
        "file:///tmp/tutorial.pdf",
        "vbscript:msgbox(1)",
        "texto livre",
        `https://example.com/${"a".repeat(481)}`,
      ]) {
        const { service } = makeService();
        await assert.rejects(
          () => service.updateSettings({ [key]: value }),
          BadRequestException,
        );
      }
    }
  });

  it("rejects tutorial bodies longer than 3000 characters", async () => {
    const { service } = makeService();

    await assert.rejects(
      () =>
        service.updateSettings({
          credentialTutorialAmazonBody: "a".repeat(3001),
        }),
      BadRequestException,
    );
  });

  it("rejects HTML in tutorial title and body", async () => {
    const { service } = makeService();

    for (const input of [
      { credentialTutorialAmazonTitle: "<strong>Tutorial</strong>" },
      { credentialTutorialAmazonBody: "<script>alert(1)</script>" },
    ]) {
      await assert.rejects(
        () => service.updateSettings(input),
        BadRequestException,
      );
    }
  });

  it("updates and trims the FREE plan signature", async () => {
    const { service } = makeService();
    const signature = "🤖 Oferta automatizada\nhttps://peppabot.com";

    const result = await service.updateSettings({
      freePlanSignature: `  ${signature}  `,
    });

    assert.equal(result.freePlanSignature, signature);
  });

  it("uses the default signature when the input is empty", async () => {
    const { service } = makeService({
      freePlanSignature: "Assinatura anterior",
    });

    const result = await service.updateSettings({ freePlanSignature: "  " });

    assert.equal(result.freePlanSignature, DEFAULT_FREE_PLAN_SIGNATURE);
  });

  it("uses the default signature when a stored setting is empty", async () => {
    const { service } = makeService({ freePlanSignature: " " });

    assert.equal(
      (await service.getPublicSettings()).freePlanSignature,
      DEFAULT_FREE_PLAN_SIGNATURE,
    );
  });

  it("rejects FREE plan signatures longer than 300 characters", async () => {
    const { service } = makeService();

    await assert.rejects(
      () =>
        service.updateSettings({
          freePlanSignature: "a".repeat(301),
        }),
      BadRequestException,
    );
  });

  it("rejects HTML and unsafe URL schemes in the FREE signature", async () => {
    const { service } = makeService();

    for (const value of [
      "<script>alert(1)</script>",
      "<strong>PeppaBot</strong>",
      "javascript:alert(1)",
      "data:text/html,test",
    ]) {
      await assert.rejects(
        () => service.updateSettings({ freePlanSignature: value }),
        BadRequestException,
      );
    }
  });
});
