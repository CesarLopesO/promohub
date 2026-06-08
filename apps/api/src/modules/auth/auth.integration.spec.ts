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
  const now = new Date("2026-06-01T12:00:00.000Z");

  before(async () => {
    const prisma = {
      user: {
        create: async ({
          data,
          select,
        }: {
          data: Pick<StoredUser, "email" | "passwordHash"> & {
            name?: string | null;
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
        },
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
      },
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

  it("rejects a protected route without token", async () => {
    const { context } = makeHttpContext();

    await assert.rejects(
      async () => {
        await guard.canActivate(context);
      },
      UnauthorizedException,
    );
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
