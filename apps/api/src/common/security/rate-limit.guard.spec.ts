import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HttpException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { AuthController } from "../../modules/auth/auth.controller";
import { BillingController } from "../../modules/billing/billing.controller";
import {
  RATE_LIMIT_METADATA,
  type RateLimitPolicy,
} from "./rate-limit.decorator";
import { RateLimitGuard } from "./rate-limit.guard";

function context(handler: object, request: Record<string, unknown>) {
  return {
    getHandler: () => handler,
    getClass: () => AuthController,
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

describe("RateLimitGuard", () => {
  it("rate limits login by IP and email", async () => {
    const counts = new Map<string, number>();
    const guard = new RateLimitGuard(new Reflector(), {
      enabled: () => true,
      increment: async (key: string) => {
        const count = (counts.get(key) ?? 0) + 1;
        counts.set(key, count);
        return count;
      },
    } as never);
    const request = {
      headers: {},
      ip: "127.0.0.1",
      socket: {},
      body: { email: "USER@example.com" },
    };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      assert.equal(
        await guard.canActivate(
          context(AuthController.prototype.login, request),
        ),
        true,
      );
    }

    await assert.rejects(
      () => guard.canActivate(context(AuthController.prototype.login, request)),
      (error) => {
        assert.ok(error instanceof HttpException);
        assert.equal(error.getStatus(), 429);
        assert.deepEqual(error.getResponse(), {
          code: "RATE_LIMITED",
          message: "Muitas tentativas. Tente novamente em instantes.",
        });
        return true;
      },
    );
  });

  it("rate limits registration by IP", async () => {
    let count = 0;
    const guard = new RateLimitGuard(new Reflector(), {
      enabled: () => true,
      increment: async () => ++count,
    } as never);
    const request = {
      headers: {},
      ip: "127.0.0.2",
      socket: {},
      body: { email: "new@example.com" },
    };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      assert.equal(
        await guard.canActivate(
          context(AuthController.prototype.register, request),
        ),
        true,
      );
    }
    await assert.rejects(
      () =>
        guard.canActivate(context(AuthController.prototype.register, request)),
      (error) => error instanceof HttpException && error.getStatus() === 429,
    );
  });

  it("rate limits checkout by authenticated user", async () => {
    let count = 0;
    const guard = new RateLimitGuard(new Reflector(), {
      enabled: () => true,
      increment: async () => ++count,
    } as never);
    const request = {
      headers: {},
      ip: "127.0.0.3",
      socket: {},
      body: {},
      user: { id: "user-1" },
    };

    for (let attempt = 0; attempt < 10; attempt += 1) {
      assert.equal(
        await guard.canActivate(
          context(BillingController.prototype.checkout, request),
        ),
        true,
      );
    }
    await assert.rejects(
      () =>
        guard.canActivate(
          context(BillingController.prototype.checkout, request),
        ),
      (error) => error instanceof HttpException && error.getStatus() === 429,
    );
  });

  it("declares register and checkout production policies", () => {
    const register = Reflect.getMetadata(
      RATE_LIMIT_METADATA,
      AuthController.prototype.register,
    ) as RateLimitPolicy;
    const checkout = Reflect.getMetadata(
      RATE_LIMIT_METADATA,
      BillingController.prototype.checkout,
    ) as RateLimitPolicy;

    assert.deepEqual(register, {
      name: "auth-register",
      limit: 5,
      windowMs: 60 * 60 * 1000,
      key: "ip",
    });
    assert.deepEqual(checkout, {
      name: "billing-checkout",
      limit: 10,
      windowMs: 60 * 60 * 1000,
      key: "user",
    });
  });
});
