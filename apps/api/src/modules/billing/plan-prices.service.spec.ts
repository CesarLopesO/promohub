import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { Plan } from "@prisma/client";

import { AdminController } from "../admin/admin.controller";
import { AdminGuard } from "../auth/admin.guard";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { PlanPricesService } from "./plan-prices.service";

type StoredOverride = {
  plan: string;
  priceCents: number;
  updatedByUserId: string | null;
};

function makeService(initial: StoredOverride[] = []) {
  const overrides = new Map(
    initial.map((override) => [override.plan, override]),
  );
  const auditEntries: unknown[] = [];
  const prisma = {
    planPriceOverride: {
      findMany: async () => [...overrides.values()],
      upsert: ({
        where,
        create,
        update,
      }: {
        where: { plan: string };
        create: StoredOverride;
        update: Partial<StoredOverride>;
      }) => {
        const current = overrides.get(where.plan);
        const next = current
          ? { ...current, ...update }
          : { ...create, updatedByUserId: create.updatedByUserId ?? null };
        overrides.set(where.plan, next);
        return Promise.resolve(next);
      },
    },
    $transaction: async (operations: Array<Promise<unknown>>) =>
      Promise.all(operations),
  };
  const audit = {
    record: async (entry: unknown) => {
      auditEntries.push(entry);
    },
  };

  return {
    service: new PlanPricesService(prisma as never, audit as never),
    overrides,
    auditEntries,
  };
}

describe("PlanPricesService", () => {
  it("allows an ADMIN to update BASIC", async () => {
    const { service } = makeService();

    const result = await service.updatePrices({ BASIC: 8_490 }, "admin-1");

    assert.equal(result.BASIC, 8_490);
    assert.equal(result.PRO, 9_990);
    assert.equal(result.FREE, 0);
  });

  it("allows an ADMIN to update PRO", async () => {
    const { service } = makeService();

    const result = await service.updatePrices({ PRO: 12_990 }, "admin-1");

    assert.equal(result.BASIC, 7_990);
    assert.equal(result.PRO, 12_990);
  });

  it("does not allow a regular user through the admin guard", () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: "user-1", role: "USER" } }),
      }),
    } as ExecutionContext;

    assert.throws(
      () => new AdminGuard().canActivate(context),
      ForbiddenException,
    );
  });

  it("protects plan price endpoints with JWT and ADMIN guards", () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      AdminController,
    ) as unknown[];

    assert.deepEqual(guards, [JwtAuthGuard, AdminGuard]);
  });

  it("does not allow FREE to be changed", async () => {
    const { service } = makeService();

    await assert.rejects(
      () => service.updatePrices({ FREE: 100 }, "admin-1"),
      BadRequestException,
    );
  });

  it("rejects invalid prices", async () => {
    const { service } = makeService();

    for (const price of [0, 1.5, "7990", 1_000_000]) {
      await assert.rejects(
        () => service.updatePrices({ BASIC: price }, "admin-1"),
        BadRequestException,
      );
    }
  });

  it("rejects prices below R$ 1,00 in production", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const { service } = makeService();
    process.env.NODE_ENV = "production";

    try {
      await assert.rejects(
        () => service.updatePrices({ BASIC: 99 }, "admin-1"),
        BadRequestException,
      );
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it("allows R$ 0,01 outside production", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const { service } = makeService();
    process.env.NODE_ENV = "test";

    try {
      const result = await service.updatePrices({ BASIC: 1 }, "admin-1");

      assert.equal(result.BASIC, 1);
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it("creates an audit log without secrets", async () => {
    const { service, auditEntries } = makeService();

    await service.updatePrices({ BASIC: 8_490, PRO: 12_990 }, "admin-1");

    assert.deepEqual(auditEntries, [
      {
        adminUserId: "admin-1",
        action: "PLAN_PRICE_UPDATED",
        targetType: "planPriceOverride",
        metadata: {
          prices: {
            BASIC: 8_490,
            PRO: 12_990,
          },
        },
      },
    ]);
    assert.doesNotMatch(JSON.stringify(auditEntries), /secret|token|key/i);
  });

  it("returns stored overrides with FREE fixed at zero", async () => {
    const { service } = makeService([
      { plan: Plan.BASIC, priceCents: 8_490, updatedByUserId: "admin-1" },
      { plan: Plan.PRO, priceCents: 12_990, updatedByUserId: "admin-1" },
      { plan: Plan.FREE, priceCents: 100, updatedByUserId: "admin-1" },
    ]);

    assert.deepEqual(await service.getPrices(), {
      FREE: 0,
      BASIC: 8_490,
      PRO: 12_990,
    });
  });
});
