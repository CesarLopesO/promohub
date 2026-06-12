import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { Test, TestingModule } from "@nestjs/testing";

import { PrismaService } from "../../prisma.service";
import { AuthService } from "./auth.service";
import type { AuthenticatedRequest } from "./auth.types";
import { JwtAuthGuard } from "./jwt.guard";
import { JwtStrategy } from "./jwt.strategy";

type StoredUser = {
  id: string;
  email: string;
  passwordHash: string;
  name: string | null;
  referredByUserId: string | null;
  role: string;
  plan: string;
  subscriptionStatus: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

describe("Auth JWT integration", () => {
  let moduleRef: TestingModule;
  let authService: AuthService;
  let jwtService: JwtService;
  let guard: JwtAuthGuard;
  const users: StoredUser[] = [];
  const referralCodes: Array<{
    userId: string;
    code: string;
  }> = [];
  const referrals: Array<{
    referrerUserId: string;
    referredUserId: string;
    status: string;
    rewardCents: number;
  }> = [];
  const billingSubscriptions: Array<{
    id: string;
    userId: string;
    status: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: Date | null;
    canceledAt: Date | null;
    createdAt: Date;
  }> = [];
  const now = new Date("2026-06-01T12:00:00.000Z");

  before(async () => {
    const createUser = async ({
      data,
      select,
    }: {
      data: Pick<StoredUser, "email" | "passwordHash"> & {
        name?: string | null;
        referredByUserId?: string;
      };
      select?: object;
    }) => {
      if (users.some((user) => user.email === data.email)) {
        throw Object.assign(new Error("Unique constraint failed"), {
          code: "P2002",
        });
      }

      const user = {
        id: `user-${users.length + 1}`,
        email: data.email,
        passwordHash: data.passwordHash,
        name: data.name ?? null,
        referredByUserId: data.referredByUserId ?? null,
        role: "USER",
        plan: "FREE",
        subscriptionStatus: "NONE",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      users.push(user);

      if (select) {
        return {
          id: user.id,
          email: user.email,
        };
      }

      return user;
    };
    const createReferral = async ({
      data,
    }: {
      data: (typeof referrals)[number];
    }) => {
      if (
        referrals.some((item) => item.referredUserId === data.referredUserId)
      ) {
        throw Object.assign(new Error("Unique constraint failed"), {
          code: "P2002",
        });
      }

      referrals.push(data);
      return data;
    };
    const transactionClient = {
      user: { create: createUser },
      referral: { create: createReferral },
    };
    const prisma = {
      user: {
        create: createUser,
        findUnique: async ({
          where,
        }: {
          where: { email?: string; id?: string };
        }) =>
          users.find(
            (user) =>
              (where.email && user.email === where.email) ||
              (where.id && user.id === where.id),
          ) ?? null,
        update: async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<StoredUser>;
        }) => {
          const user = users.find((item) => item.id === where.id);
          assert.ok(user);
          Object.assign(user, data);
          return user;
        },
      },
      referralCode: {
        findUnique: async ({ where }: { where: { code: string } }) => {
          const referralCode = referralCodes.find(
            (item) => item.code === where.code,
          );
          const owner = users.find((user) => user.id === referralCode?.userId);

          return referralCode && owner
            ? {
                userId: referralCode.userId,
                user: { email: owner.email },
              }
            : null;
        },
      },
      referral: {
        create: createReferral,
      },
      billingSubscription: {
        findFirst: async ({
          where,
        }: {
          where: {
            userId: string;
            cancelAtPeriodEnd: boolean;
            currentPeriodEnd: { lte: Date };
          };
        }) =>
          billingSubscriptions.find(
            (subscription) =>
              subscription.userId === where.userId &&
              subscription.cancelAtPeriodEnd === where.cancelAtPeriodEnd &&
              subscription.currentPeriodEnd !== null &&
              subscription.currentPeriodEnd <= where.currentPeriodEnd.lte,
          ) ?? null,
        update: async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<(typeof billingSubscriptions)[number]>;
        }) => {
          const subscription = billingSubscriptions.find(
            (item) => item.id === where.id,
          );
          assert.ok(subscription);
          Object.assign(subscription, data);
          return subscription;
        },
      },
      $transaction: async <T>(
        work:
          | Array<Promise<unknown>>
          | ((transaction: typeof transactionClient) => Promise<T>),
      ) =>
        typeof work === "function"
          ? work(transactionClient)
          : Promise.all(work),
    };

    moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({
          secret: "test-secret",
          signOptions: {
            expiresIn: "7d",
          },
        }),
      ],
      providers: [
        AuthService,
        JwtStrategy,
        JwtAuthGuard,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback?: string) =>
              key === "JWT_SECRET" ? "test-secret" : fallback,
          },
        },
      ],
    }).compile();

    authService = moduleRef.get(AuthService);
    jwtService = moduleRef.get(JwtService);
    guard = moduleRef.get(JwtAuthGuard);
  });

  it("registers a user", async () => {
    const user = await authService.register({
      email: "User@Email.com",
      password: "123456",
    });

    assert.deepEqual(user, {
      id: "user-1",
      email: "user@email.com",
    });
  });

  it("logs in and returns a JWT", async () => {
    const result = await authService.login({
      email: "user@email.com",
      password: "123456",
    });

    assert.match(result.accessToken, /^[^.]+\.[^.]+\.[^.]+$/);
  });

  it("registers a referred user with a direct immutable link", async () => {
    referralCodes.push({
      userId: "user-1",
      code: "REFERRER1",
    });

    const referred = await authService.register({
      email: "referred@example.com",
      password: "123456",
      ref: "REFERRER1",
    });

    assert.equal(referred.email, "referred@example.com");
    assert.equal(
      users.find((user) => user.id === referred.id)?.referredByUserId,
      "user-1",
    );
    assert.deepEqual(referrals, [
      {
        referrerUserId: "user-1",
        referredUserId: referred.id,
        status: "PENDING_PAYMENT",
        rewardCents: 3000,
      },
    ]);
  });

  it("does not change an existing account or accept self-referral", async () => {
    const originalReferrer = users[0]?.referredByUserId;

    await assert.rejects(
      () =>
        authService.register({
          email: "user@email.com",
          password: "123456",
          ref: "REFERRER1",
        }),
      /Email already registered/,
    );
    assert.equal(users[0]?.referredByUserId, originalReferrer);
    assert.equal(referrals.length, 1);
  });

  it("continues registration when the referral code is invalid", async () => {
    const user = await authService.register({
      email: "no-ref@example.com",
      password: "123456",
      ref: "INVALID",
    });

    assert.equal(
      users.find((stored) => stored.id === user.id)?.referredByUserId,
      null,
    );
    assert.equal(referrals.length, 1);
  });

  it("accepts a valid JWT", async () => {
    const accessToken = await login();
    const payload = await jwtService.verifyAsync(accessToken, {
      secret: "test-secret",
    });

    assert.equal(payload.sub, "user-1");
    assert.equal(payload.email, "user@email.com");
  });

  it("rejects an invalid JWT", async () => {
    await assert.rejects(
      () =>
        jwtService.verifyAsync("invalid-token", {
          secret: "test-secret",
        }),
      /jwt malformed/,
    );
  });

  it("returns auth/me for the current user", async () => {
    const me = await authService.me("user-1");

    assert.deepEqual(me, {
      id: "user-1",
      email: "user@email.com",
      role: "USER",
      plan: "FREE",
      subscriptionStatus: "NONE",
    });
  });

  it("expires a scheduled cancellation in auth/me", async () => {
    const registered = await authService.register({
      email: "expired-subscription@example.com",
      password: "123456",
    });
    const storedUser = users.find((user) => user.id === registered.id);
    assert.ok(storedUser);
    storedUser.plan = "BASIC";
    storedUser.subscriptionStatus = "ACTIVE";
    billingSubscriptions.push({
      id: "expired-billing",
      userId: registered.id,
      status: "CANCELED",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date(Date.now() - 1_000),
      canceledAt: new Date(Date.now() - 86_400_000),
      createdAt: new Date(),
    });

    const result = await authService.me(registered.id);

    assert.equal(result.plan, "FREE");
    assert.equal(result.subscriptionStatus, "CANCELED");
    assert.equal(billingSubscriptions.at(-1)?.cancelAtPeriodEnd, false);
  });

  it("rejects a protected route without token", async () => {
    const { context } = makeHttpContext();

    await assert.rejects(async () => {
      await guard.canActivate(context);
    }, UnauthorizedException);
  });

  it("accepts a protected route with token", async () => {
    const accessToken = await login();
    const { context, request } = makeHttpContext(accessToken);

    const canActivate = await guard.canActivate(context);

    assert.equal(canActivate, true);
    assert.deepEqual(request.user, {
      id: "user-1",
      email: "user@email.com",
      role: "USER",
      plan: "FREE",
      subscriptionStatus: "NONE",
    });
  });

  async function login(): Promise<string> {
    const result = await authService.login({
      email: "user@email.com",
      password: "123456",
    });

    return result.accessToken;
  }

  function makeHttpContext(token?: string): {
    context: ExecutionContext;
    request: Partial<AuthenticatedRequest> & {
      headers: Record<string, string>;
      authInfo?: unknown;
    };
  } {
    const headers: Record<string, string> = {};

    if (token) {
      headers.authorization = `Bearer ${token}`;
    }

    const request = {
      headers,
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
      }),
    } as ExecutionContext;

    return {
      context,
      request,
    };
  }
});
