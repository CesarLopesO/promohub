import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExecutionContext } from "@nestjs/common";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";

import { AdminGuard } from "../auth/admin.guard";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { AdminSettingsController } from "./settings.controller";
import { SettingsService } from "./settings.service";

type StoredSettings = Map<string, string>;

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

  it("returns only public support settings", async () => {
    const { service } = makeService({
      supportEmail: "suporte@peppabot.com",
      supportWhatsappUrl: "https://api.whatsapp.com/send?phone=5538999999999",
      privateApiKey: "must-not-leak",
    });

    assert.deepEqual(await service.getPublicSettings(), {
      supportEmail: "suporte@peppabot.com",
      supportWhatsappUrl: "https://api.whatsapp.com/send?phone=5538999999999",
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
      },
    );
  });
});
