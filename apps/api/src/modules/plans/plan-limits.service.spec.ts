import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { Plan } from "@prisma/client";

import { PLAN_LIMIT_REACHED, PlanLimitsService } from "./plan-limits.service";

type StoredUser = {
  id: string;
  plan: Plan;
};

type StoredSession = {
  userId: string;
  deletedAt: Date | null;
};

type StoredRoute = {
  userId: string;
  sourceGroupJid: string;
  destinationGroupJid: string;
  isActive: boolean;
};

function makeService(options: {
  plan: Plan;
  sessions?: StoredSession[];
  routes?: StoredRoute[];
  forwards?: Array<{
    userId: string;
    status: string;
    sentAt: Date | null;
  }>;
}) {
  const users: StoredUser[] = [{ id: "user-1", plan: options.plan }];
  const sessions = options.sessions ?? [];
  const routes = options.routes ?? [];
  const forwards = options.forwards ?? [];
  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        users.find((user) => user.id === where.id) ?? null,
    },
    whatsAppSession: {
      count: async ({
        where,
      }: {
        where: { userId: string; deletedAt: null };
      }) =>
        sessions.filter(
          (session) =>
            session.userId === where.userId &&
            session.deletedAt === where.deletedAt,
        ).length,
    },
    messageRoute: {
      count: async ({
        where,
      }: {
        where: { userId: string; isActive: boolean };
      }) =>
        routes.filter(
          (route) =>
            route.userId === where.userId && route.isActive === where.isActive,
        ).length,
      findMany: async ({
        where,
        distinct,
      }: {
        where: {
          userId: string;
          isActive: boolean;
          NOT?: { id: string };
        };
        distinct?: ["sourceGroupJid"] | ["destinationGroupJid"];
      }) => {
        const matchingRoutes = routes.filter(
          (route) =>
            route.userId === where.userId && route.isActive === where.isActive,
        );

        if (!distinct) {
          return matchingRoutes.map((route) => ({
            sourceGroupJid: route.sourceGroupJid,
            destinationGroupJid: route.destinationGroupJid,
          }));
        }

        const key = distinct[0];
        const seen = new Set<string>();

        return matchingRoutes
          .filter((route) => {
            const value = route[key];

            if (seen.has(value)) {
              return false;
            }

            seen.add(value);
            return true;
          })
          .map((route) => ({ [key]: route[key] }));
      },
      findFirst: async ({
        where,
      }: {
        where: {
          userId: string;
          isActive: boolean;
          sourceGroupJid?: string;
          destinationGroupJid?: string;
        };
      }) =>
        routes.find(
          (route) =>
            route.userId === where.userId &&
            route.isActive === where.isActive &&
            (where.sourceGroupJid === undefined ||
              route.sourceGroupJid === where.sourceGroupJid) &&
            (where.destinationGroupJid === undefined ||
              route.destinationGroupJid === where.destinationGroupJid),
        ) ?? null,
    },
    forwardedMessage: {
      count: async ({
        where,
      }: {
        where: {
          userId: string;
          status: { in: string[] };
          sentAt: { gte: Date; lt: Date };
        };
      }) =>
        forwards.filter(
          (forward) =>
            forward.userId === where.userId &&
            where.status.in.includes(forward.status) &&
            forward.sentAt !== null &&
            forward.sentAt >= where.sentAt.gte &&
            forward.sentAt < where.sentAt.lt,
        ).length,
    },
  };

  return new PlanLimitsService(prisma as never);
}

function sessions(count: number): StoredSession[] {
  return Array.from({ length: count }, () => ({
    userId: "user-1",
    deletedAt: null,
  }));
}

function routes(sourceCount: number, destinationCount: number): StoredRoute[] {
  return Array.from(
    { length: Math.max(sourceCount, destinationCount) },
    (_, index) => ({
      userId: "user-1",
      sourceGroupJid: `source-${Math.min(index, sourceCount - 1)}@g.us`,
      destinationGroupJid: `destination-${Math.min(index, destinationCount - 1)}@g.us`,
      isActive: true,
    }),
  );
}

describe("PlanLimitsService", () => {
  it("FREE blocks a second WhatsApp", async () => {
    const service = makeService({ plan: Plan.FREE, sessions: sessions(1) });

    await assert.rejects(
      () => service.assertCanCreateWhatsAppSession("user-1"),
      (error: unknown) => {
        assert.ok(error instanceof ForbiddenException);
        assert.deepEqual(error.getResponse(), {
          code: PLAN_LIMIT_REACHED,
          message:
            "Seu plano FREE permite no máximo 1 sessão de WhatsApp cadastrada.",
        });
        return true;
      },
    );
  });

  it("BASIC blocks a second WhatsApp", async () => {
    const service = makeService({ plan: Plan.BASIC, sessions: sessions(1) });

    await assert.rejects(
      () => service.assertCanCreateWhatsAppSession("user-1"),
      ForbiddenException,
    );
  });

  it("PRO allows up to 5 WhatsApps", async () => {
    const service = makeService({ plan: Plan.PRO, sessions: sessions(4) });

    await service.assertCanCreateWhatsAppSession("user-1");
  });

  it("deleted WhatsApp sessions do not count toward the limit", async () => {
    const service = makeService({
      plan: Plan.FREE,
      sessions: [
        {
          userId: "user-1",
          deletedAt: new Date("2026-06-10T12:00:00.000Z"),
        },
      ],
    });

    await service.assertCanCreateWhatsAppSession("user-1");
  });

  it("FREE blocks a fourth source group", async () => {
    const service = makeService({ plan: Plan.FREE, routes: routes(3, 1) });

    await assert.rejects(
      () =>
        service.assertCanCreateRoute(
          "user-1",
          "source-3@g.us",
          "destination-0@g.us",
        ),
      ForbiddenException,
    );
  });

  it("FREE blocks a second destination group", async () => {
    const service = makeService({ plan: Plan.FREE, routes: routes(1, 1) });

    await assert.rejects(
      () =>
        service.assertCanCreateRoute(
          "user-1",
          "source-0@g.us",
          "destination-1@g.us",
        ),
      ForbiddenException,
    );
  });

  it("BASIC blocks an eleventh source group", async () => {
    const service = makeService({ plan: Plan.BASIC, routes: routes(10, 1) });

    await assert.rejects(
      () =>
        service.assertCanCreateRoute(
          "user-1",
          "source-10@g.us",
          "destination-0@g.us",
        ),
      ForbiddenException,
    );
  });

  it("BASIC blocks a sixth destination group", async () => {
    const service = makeService({ plan: Plan.BASIC, routes: routes(1, 5) });

    await assert.rejects(
      () =>
        service.assertCanCreateRoute(
          "user-1",
          "source-0@g.us",
          "destination-5@g.us",
        ),
      ForbiddenException,
    );
  });

  it("PRO does not block groups", async () => {
    const service = makeService({ plan: Plan.PRO, routes: routes(30, 20) });

    await service.assertCanCreateRoute(
      "user-1",
      "source-31@g.us",
      "destination-21@g.us",
    );
  });

  it("inactive routes do not count toward group limits", async () => {
    const service = makeService({
      plan: Plan.FREE,
      routes: [
        ...routes(2, 1),
        {
          userId: "user-1",
          sourceGroupJid: "inactive-source@g.us",
          destinationGroupJid: "inactive-destination@g.us",
          isActive: false,
        },
      ],
    });

    await service.assertCanCreateRoute(
      "user-1",
      "source-2@g.us",
      "destination-0@g.us",
    );
  });

  it("returns billing usage correctly", async () => {
    const service = makeService({
      plan: Plan.BASIC,
      sessions: sessions(1),
      routes: [
        ...routes(2, 2),
        {
          userId: "user-1",
          sourceGroupJid: "inactive-source@g.us",
          destinationGroupJid: "inactive-destination@g.us",
          isActive: false,
        },
      ],
    });

    const usage = await service.getUsage("user-1");

    assert.equal(usage.plan, Plan.BASIC);
    assert.equal(usage.usage.whatsappSessions, 1);
    assert.equal(usage.usage.sourceGroups, 2);
    assert.equal(usage.usage.destinationGroups, 2);
    assert.equal(usage.usage.activeRoutes, 2);
    assert.equal(usage.limits.dailyForwardLimit, null);
    assert.equal(usage.usage.forwardsToday, 0);
    assert.equal(usage.usage.dailyForwardRemaining, null);
  });

  it("counts only successful forwards from today in America/Sao_Paulo", async () => {
    const service = makeService({
      plan: Plan.FREE,
      forwards: [
        {
          userId: "user-1",
          status: "SENT",
          sentAt: new Date("2026-06-10T03:00:00.000Z"),
        },
        {
          userId: "user-1",
          status: "SENT_TEXT_FALLBACK",
          sentAt: new Date("2026-06-11T02:59:59.999Z"),
        },
        {
          userId: "user-1",
          status: "SENT",
          sentAt: new Date("2026-06-10T02:59:59.999Z"),
        },
        {
          userId: "user-1",
          status: "FAILED",
          sentAt: new Date("2026-06-10T12:00:00.000Z"),
        },
      ],
    });

    const count = await service.countForwardsToday(
      "user-1",
      new Date("2026-06-10T15:00:00.000Z"),
    );

    assert.equal(count, 2);
  });

  it("returns FREE daily limit and remaining usage", async () => {
    const now = new Date();
    const forwards = Array.from({ length: 99 }, () => ({
      userId: "user-1",
      status: "SENT",
      sentAt: now,
    }));
    const service = makeService({ plan: Plan.FREE, forwards });
    const usage = await service.getUsage("user-1");

    assert.equal(usage.limits.dailyForwardLimit, 100);
    assert.equal(usage.usage.forwardsToday, 99);
    assert.equal(usage.usage.dailyForwardRemaining, 1);
  });
});
