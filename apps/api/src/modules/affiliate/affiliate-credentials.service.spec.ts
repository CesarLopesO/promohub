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
  metadata: unknown;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

describe("AffiliateCredentialsService", () => {
  it("creates, lists, updates, and soft deletes credentials", async () => {
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
    });
    const listed = await service.list("test-user");
    const updated = await service.update(created.id, {
      affiliateId: "affiliate-1",
    });
    const deleted = await service.softDelete(created.id);
    const listedAfterDelete = await service.list("test-user");

    assert.equal(created.isActive, true);
    assert.equal(created.trackingId, "meutag-20");
    assert.equal(listed.length, 1);
    assert.equal(updated.affiliateId, "affiliate-1");
    assert.equal(deleted.isActive, false);
    assert.deepEqual(listedAfterDelete, []);
  });
});
