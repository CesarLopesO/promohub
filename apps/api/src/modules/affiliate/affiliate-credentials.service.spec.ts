import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AffiliateCredentialsService } from "./affiliate-credentials.service";
import { Marketplace } from "./helpers/detect-marketplace";

type StoredCredential = {
  id: string;
  userId: string;
  marketplace: string;
  affiliateId: string | null;
  apiKey: string | null;
  apiSecret: string | null;
  trackingId: string | null;
  storeSlug: string | null;
  metadata: unknown;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

describe("AffiliateCredentialsService", () => {
  it("creates, lists, updates, and soft deletes credentials", async () => {
    process.env.APP_ENCRYPTION_KEY =
      "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
    const createdAt = new Date("2026-06-01T12:00:00.000Z");
    const store = new Map<string, StoredCredential>();
    const prisma = {
      affiliateCredential: {
        upsert: async ({
          create,
          update,
        }: {
          create: Omit<StoredCredential, "id" | "createdAt" | "updatedAt">;
          update: Partial<StoredCredential>;
        }) => {
          const key = `${create.userId}:${create.marketplace}`;
          const existing = store.get(key);

          if (existing) {
            Object.assign(existing, update, { updatedAt: createdAt });
            return existing;
          }

          const credential = {
            id: "credential-id",
            createdAt,
            updatedAt: createdAt,
            ...create,
          };
          store.set(key, credential);

          return credential;
        },
        findMany: async ({ where }: { where: { userId?: string } }) =>
          Array.from(store.values()).filter(
            (credential) =>
              credential.isActive &&
              (!where.userId || credential.userId === where.userId),
          ),
        findUnique: async ({ where }: { where: { id: string } }) =>
          Array.from(store.values()).find(
            (credential) => credential.id === where.id,
          ) ?? null,
        update: async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<StoredCredential>;
        }) => {
          const credential = Array.from(store.values()).find(
            (item) => item.id === where.id,
          );

          assert.ok(credential);
          Object.assign(credential, data, { updatedAt: createdAt });

          return credential;
        },
      },
    };
    const service = new AffiliateCredentialsService(prisma as never);

    const created = await service.create({
      userId: "test-user",
      marketplace: Marketplace.AMAZON,
      trackingId: "meutag-20",
      apiKey: "api-key-secret",
      apiSecret: "api-secret-value",
      metadata: {
        ssid: "plain-session-token",
      },
    });
    const listed = await service.list("test-user");
    const stored = store.get("test-user:amazon");

    assert.ok(stored);
    const encryptedSsid = (stored.metadata as { ssid: string }).ssid;
    stored.apiKey = "legacy-plain-api-key";
    stored.apiSecret = "legacy-plain-api-secret";
    stored.metadata = { sessionToken: "legacy-plain-session-token" };
    const updated = await service.update(created.id, {
      affiliateId: "affiliate-1",
    });
    const deleted = await service.softDelete(created.id);
    const listedAfterDelete = await service.list("test-user");

    assert.equal(created.isActive, true);
    assert.equal(created.trackingId, "meutag-20");
    assert.equal(created.hasApiKey, true);
    assert.equal(created.hasApiSecret, true);
    assert.equal(created.hasSessionToken, true);
    assert.equal("apiKey" in created, false);
    assert.equal("apiSecret" in created, false);
    assert.equal("metadata" in created, false);
    assert.match(store.get("test-user:amazon")?.apiKey ?? "", /^enc:v1:/);
    assert.match(store.get("test-user:amazon")?.apiSecret ?? "", /^enc:v1:/);
    assert.match(encryptedSsid, /^enc:v1:/);
    assert.equal(listed.length, 1);
    assert.equal(updated.affiliateId, "affiliate-1");
    assert.match(stored.apiKey ?? "", /^enc:v1:/);
    assert.match(stored.apiSecret ?? "", /^enc:v1:/);
    assert.match(
      (stored.metadata as { sessionToken: string }).sessionToken,
      /^enc:v1:/,
    );
    assert.equal(deleted.isActive, false);
    assert.deepEqual(listedAfterDelete, []);
  });

  it("normalizes and exposes a Magazine Luiza store slug", async () => {
    const store = new Map<string, StoredCredential>();
    const prisma = {
      affiliateCredential: {
        upsert: async ({
          create,
        }: {
          create: Omit<StoredCredential, "id" | "createdAt" | "updatedAt">;
        }) => {
          const credential = {
            id: "magalu-credential",
            createdAt: new Date(),
            updatedAt: new Date(),
            ...create,
          };
          store.set(`${create.userId}:${create.marketplace}`, credential);
          return credential;
        },
        findMany: async ({ where }: { where: { userId?: string } }) =>
          Array.from(store.values()).filter(
            (credential) =>
              credential.isActive &&
              (!where.userId || credential.userId === where.userId),
          ),
      },
    };
    const service = new AffiliateCredentialsService(prisma as never);

    const result = await service.create({
      userId: "test-user",
      marketplace: Marketplace.MAGAZINE_LUIZA,
      storeSlug: " MagazineProAfiliados ",
    });

    assert.equal(result.storeSlug, "magazineproafiliados");
    assert.equal(
      store.get("test-user:magazine_luiza")?.storeSlug,
      "magazineproafiliados",
    );
    assert.deepEqual(await service.list("test-user"), [result]);
  });

  it("rejects invalid Magazine Luiza store slugs", async () => {
    const service = new AffiliateCredentialsService({} as never);

    for (const storeSlug of [
      "",
      "ab",
      "loja com espaco",
      "https://www.magazinevoce.com.br/minhaloja",
      "javascript:alert(1)",
      "data:text/html,test",
      "file:///tmp/test",
      "a".repeat(81),
    ]) {
      await assert.rejects(
        () =>
          service.create({
            userId: "test-user",
            marketplace: Marketplace.MAGAZINE_LUIZA,
            storeSlug,
          }),
        /storeSlug/,
      );
    }
  });

  it("continues saving Amazon, Mercado Livre, and Shopee credentials", async () => {
    process.env.APP_ENCRYPTION_KEY =
      "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
    const store = new Map<string, StoredCredential>();
    const prisma = {
      affiliateCredential: {
        upsert: async ({
          create,
        }: {
          create: Omit<StoredCredential, "id" | "createdAt" | "updatedAt">;
        }) => {
          const credential = {
            id: `${create.marketplace}-credential`,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...create,
          };
          store.set(`${create.userId}:${create.marketplace}`, credential);
          return credential;
        },
      },
    };
    const service = new AffiliateCredentialsService(prisma as never);

    const amazon = await service.create({
      userId: "test-user",
      marketplace: Marketplace.AMAZON,
      trackingId: "meutag-20",
    });
    const mercadoLivre = await service.create({
      userId: "test-user",
      marketplace: Marketplace.MERCADO_LIVRE,
      affiliateId: "loce6396673",
    });
    const shopee = await service.create({
      userId: "test-user",
      marketplace: Marketplace.SHOPEE,
      appId: "shopee-app-id",
      password: "shopee-password",
    });

    assert.equal(amazon.trackingId, "meutag-20");
    assert.equal(mercadoLivre.affiliateId, "loce6396673");
    assert.equal(shopee.hasAppId, true);
    assert.equal(shopee.hasSecret, true);
  });

  it("encrypts Shopee credentials and lists them without exposing AppID or password", async () => {
    process.env.APP_ENCRYPTION_KEY =
      "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
    const store = new Map<string, StoredCredential>();
    const prisma = {
      affiliateCredential: {
        upsert: async ({
          create,
        }: {
          create: Omit<StoredCredential, "id" | "createdAt" | "updatedAt">;
        }) => {
          const credential = {
            id: "shopee-credential",
            createdAt: new Date(),
            updatedAt: new Date(),
            ...create,
          };
          store.set(`${create.userId}:${create.marketplace}`, credential);
          return credential;
        },
        findMany: async ({ where }: { where: { userId?: string } }) =>
          Array.from(store.values()).filter(
            (credential) =>
              credential.isActive &&
              (!where.userId || credential.userId === where.userId),
          ),
        findFirst: async ({
          where,
        }: {
          where: { id: string; userId: string };
        }) =>
          Array.from(store.values()).find(
            (credential) =>
              credential.id === where.id && credential.userId === where.userId,
          ) ?? null,
        update: async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<StoredCredential>;
        }) => {
          const credential = Array.from(store.values()).find(
            (item) => item.id === where.id,
          );
          assert.ok(credential);
          const updated = {
            ...credential,
            ...data,
            updatedAt: new Date(),
          };
          store.set(`${updated.userId}:${updated.marketplace}`, updated);
          return updated;
        },
      },
    };
    const service = new AffiliateCredentialsService(prisma as never);

    const created = await service.create({
      userId: "test-user",
      marketplace: Marketplace.SHOPEE,
      appId: "app-123",
      password: "secret-password",
    });
    const [listed] = await service.list("test-user");
    const updated = await service.update(
      "shopee-credential",
      { marketplace: Marketplace.SHOPEE },
      "test-user",
    );
    const stored = store.get("test-user:shopee");

    assert.match(stored?.apiKey ?? "", /^enc:v1:/);
    assert.match(stored?.apiSecret ?? "", /^enc:v1:/);
    assert.equal(created.hasAppId, true);
    assert.equal(created.hasSecret, true);
    assert.equal(listed?.hasAppId, true);
    assert.equal(listed?.hasSecret, true);
    assert.equal(updated.hasAppId, true);
    assert.equal(updated.hasSecret, true);
    assert.equal("appId" in created, false);
    assert.equal("password" in created, false);
    assert.equal("apiKey" in created, false);
    assert.equal("apiSecret" in created, false);
    assert.equal("appId" in (listed ?? {}), false);
    assert.equal("password" in (listed ?? {}), false);
    assert.equal("apiKey" in (listed ?? {}), false);
    assert.equal("apiSecret" in (listed ?? {}), false);
  });

  it("rejects Shopee credentials without AppID or password", async () => {
    const service = new AffiliateCredentialsService({} as never);

    await assert.rejects(
      () =>
        service.create({
          userId: "test-user",
          marketplace: Marketplace.SHOPEE,
          password: "secret",
        }),
      /appId and password/,
    );
    await assert.rejects(
      () =>
        service.create({
          userId: "test-user",
          marketplace: Marketplace.SHOPEE,
          appId: "app-id",
        }),
      /appId and password/,
    );
  });
});
