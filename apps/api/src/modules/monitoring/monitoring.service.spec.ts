import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MonitoringService } from "./monitoring.service";

type StoredSession = {
  id: string;
  userId: string;
  sessionId: string;
  status: string;
};

type StoredGroup = {
  id: string;
  sessionId: string;
};

type StoredMessage = {
  id: string;
  sessionId: string;
  groupJid: string;
  messageType: string;
  text: string | null;
  links: unknown;
  marketplaces: unknown;
  rawMessage?: unknown;
  createdAt: Date;
};

type StoredRoute = {
  id: string;
  userId: string;
  sessionId: string;
  sourceGroupJid: string;
  destinationGroupJid: string;
  isActive: boolean;
  createdAt: Date;
};

type StoredForward = {
  id: string;
  userId: string;
  sessionId: string;
  sourceMessageId: string;
  destinationGroupJid: string;
  status: string;
  mode: string | null;
  sentMessageType: string | null;
  mediaForwarded: boolean;
  error: string | null;
  sentAt: Date | null;
  createdAt: Date;
};

function makePrisma() {
  const sessions: StoredSession[] = [
    {
      id: "session-record-id",
      userId: "test-user",
      sessionId: "wa_xxx",
      status: "CONNECTED",
    },
    {
      id: "session-record-id-2",
      userId: "other-user",
      sessionId: "wa_other",
      status: "DISCONNECTED",
    },
  ];
  const groups: StoredGroup[] = [
    {
      id: "group-1",
      sessionId: "wa_xxx",
    },
    {
      id: "group-2",
      sessionId: "wa_xxx",
    },
    {
      id: "group-3",
      sessionId: "wa_other",
    },
  ];
  const messages: StoredMessage[] = [
    {
      id: "message-1",
      sessionId: "wa_xxx",
      groupJid: "source@g.us",
      messageType: "image",
      text: "Promo https://amzn.to/abc",
      links: ["https://amzn.to/abc"],
      marketplaces: ["amazon"],
      rawMessage: {
        shouldNotLeak: true,
      },
      createdAt: new Date("2026-06-01T12:00:00.000Z"),
    },
    {
      id: "message-2",
      sessionId: "wa_xxx",
      groupJid: "source@g.us",
      messageType: "text",
      text: "Sem link",
      links: [],
      marketplaces: [],
      rawMessage: {
        shouldNotLeak: true,
      },
      createdAt: new Date("2026-06-01T11:00:00.000Z"),
    },
    {
      id: "message-3",
      sessionId: "wa_other",
      groupJid: "other@g.us",
      messageType: "image",
      text: "Outra promo https://meli.la/abc",
      links: ["https://meli.la/abc"],
      marketplaces: ["mercado_livre"],
      createdAt: new Date("2026-06-01T10:00:00.000Z"),
    },
  ];
  const routes: StoredRoute[] = [
    {
      id: "route-1",
      userId: "test-user",
      sessionId: "wa_xxx",
      sourceGroupJid: "source@g.us",
      destinationGroupJid: "destination@g.us",
      isActive: true,
      createdAt: new Date("2026-06-01T12:00:00.000Z"),
    },
    {
      id: "route-2",
      userId: "test-user",
      sessionId: "wa_xxx",
      sourceGroupJid: "source@g.us",
      destinationGroupJid: "destination-2@g.us",
      isActive: false,
      createdAt: new Date("2026-06-01T12:00:00.000Z"),
    },
  ];
  const forwards: StoredForward[] = [
    {
      id: "forward-1",
      userId: "test-user",
      sessionId: "wa_xxx",
      sourceMessageId: "message-1",
      destinationGroupJid: "destination@g.us",
      status: "SENT",
      mode: "AUTO",
      sentMessageType: "image",
      mediaForwarded: true,
      error: null,
      sentAt: new Date("2026-06-01T12:01:00.000Z"),
      createdAt: new Date("2026-06-01T12:01:00.000Z"),
    },
    {
      id: "forward-2",
      userId: "test-user",
      sessionId: "wa_xxx",
      sourceMessageId: "message-2",
      destinationGroupJid: "destination@g.us",
      status: "SENT_TEXT_FALLBACK",
      mode: "MANUAL",
      sentMessageType: "text_fallback",
      mediaForwarded: false,
      error: null,
      sentAt: new Date("2026-06-01T12:02:00.000Z"),
      createdAt: new Date("2026-06-01T12:02:00.000Z"),
    },
    {
      id: "forward-3",
      userId: "test-user",
      sessionId: "wa_xxx",
      sourceMessageId: "message-3",
      destinationGroupJid: "destination@g.us",
      status: "FAILED",
      mode: "AUTO",
      sentMessageType: "text",
      mediaForwarded: false,
      error: "send failed",
      sentAt: null,
      createdAt: new Date("2026-06-01T12:03:00.000Z"),
    },
  ];

  return {
    $queryRaw: async () => [{ "?column?": 1 }],
    whatsAppSession: {
      count: async ({ where }: { where?: Partial<StoredSession> } = {}) =>
        sessions.filter((row) => matchesWhere(row, where)).length,
      findMany: async ({
        where,
        select,
      }: {
        where?: Partial<StoredSession>;
        select?: Record<string, boolean>;
      } = {}) => applySelect(
        sessions.filter((row) => matchesWhere(row, where)),
        select,
      ),
    },
    whatsAppGroup: {
      count: async ({ where }: { where?: Record<string, unknown> } = {}) =>
        groups.filter((row) => matchesWhere(row, where)).length,
    },
    whatsAppMessage: {
      count: async ({ where }: { where?: Record<string, unknown> } = {}) =>
        messages.filter((row) => matchesWhere(row, where)).length,
      findMany: async ({
        where,
        orderBy,
        take,
        select,
      }: {
        where?: Record<string, unknown>;
        orderBy?: Record<string, "asc" | "desc">;
        take?: number;
        select?: Record<string, boolean>;
      } = {}) => applySelect(
        sortRows(messages.filter((row) => matchesWhere(row, where)), orderBy)
          .slice(0, take),
        select,
      ),
      findFirst: async ({
        where,
        orderBy,
        select,
      }: {
        where?: Record<string, unknown>;
        orderBy?: Record<string, "asc" | "desc">;
        select?: Record<string, boolean>;
      } = {}) =>
        applySelect(
          sortRows(messages.filter((row) => matchesWhere(row, where)), orderBy),
          select,
        )[0] ?? null,
    },
    messageRoute: {
      count: async ({ where }: { where?: Record<string, unknown> } = {}) =>
        routes.filter((row) => matchesWhere(row, where)).length,
    },
    forwardedMessage: {
      count: async ({ where }: { where?: Record<string, unknown> } = {}) =>
        forwards.filter((row) => matchesWhere(row, where)).length,
      findMany: async ({
        where,
        orderBy,
        take,
        select,
      }: {
        where?: Record<string, unknown>;
        orderBy?: Record<string, "asc" | "desc">;
        take?: number;
        select?: Record<string, boolean>;
      } = {}) => applySelect(
        sortRows(forwards.filter((row) => matchesWhere(row, where)), orderBy)
          .slice(0, take),
        select,
      ),
      findFirst: async ({
        where,
        orderBy,
        select,
      }: {
        where?: Record<string, unknown>;
        orderBy?: Record<string, "asc" | "desc">;
        select?: Record<string, boolean>;
      } = {}) =>
        applySelect(
          sortRows(forwards.filter((row) => matchesWhere(row, where)), orderBy),
          select,
        )[0] ?? null,
    },
  };
}

function matchesWhere(row: Record<string, unknown>, where?: Record<string, unknown>) {
  if (!where) {
    return true;
  }

  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) {
      return true;
    }

    if (isRecord(value) && Array.isArray(value.in)) {
      return value.in.includes(row[key]);
    }

    if (isRecord(value) && "not" in value) {
      return row[key] !== value.not;
    }

    return row[key] === value;
  });
}

function sortRows<T extends Record<string, unknown>>(
  rows: T[],
  orderBy?: Record<string, "asc" | "desc">,
): T[] {
  if (!orderBy) {
    return rows;
  }

  const [[field, direction]] = Object.entries(orderBy);

  return [...rows].sort((left, right) => {
    const leftValue = left[field];
    const rightValue = right[field];

    if (leftValue instanceof Date && rightValue instanceof Date) {
      return direction === "asc"
        ? leftValue.getTime() - rightValue.getTime()
        : rightValue.getTime() - leftValue.getTime();
    }

    return 0;
  });
}

function applySelect<T extends Record<string, unknown>>(
  rows: T[],
  select?: Record<string, boolean>,
) {
  if (!select) {
    return rows;
  }

  return rows.map((row) => {
    const selected: Record<string, unknown> = {};

    for (const [key, enabled] of Object.entries(select)) {
      if (enabled) {
        selected[key] = row[key];
      }
    }

    return selected;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

describe("MonitoringService", () => {
  it("returns health", async () => {
    const service = new MonitoringService(makePrisma() as never);

    const health = await service.health();

    assert.equal(health.status, "ok");
    assert.equal(health.database, "ok");
    assert.equal(health.redis, "unknown");
    assert.equal(health.connectedSessions, 1);
    assert.equal(health.activeRoutes, 1);
    assert.deepEqual(
      health.lastForwardAt,
      new Date("2026-06-01T12:02:00.000Z"),
    );
  });

  it("returns stats scoped by user", async () => {
    const service = new MonitoringService(makePrisma() as never);

    const stats = await service.stats("test-user");

    assert.equal(stats.userId, "test-user");
    assert.deepEqual(stats.sessions, {
      total: 1,
      connected: 1,
    });
    assert.deepEqual(stats.groups, {
      total: 2,
    });
    assert.deepEqual(stats.messages, {
      total: 2,
      withLinks: 1,
      images: 1,
      lastCapturedAt: new Date("2026-06-01T12:00:00.000Z"),
    });
    assert.deepEqual(stats.routes, {
      total: 2,
      active: 1,
    });
    assert.deepEqual(stats.forwards, {
      total: 3,
      sent: 2,
      failed: 1,
      auto: 2,
      manual: 1,
      images: 1,
      text: 1,
      fallbacks: 1,
      lastSentAt: new Date("2026-06-01T12:02:00.000Z"),
    });
  });

  it("returns recent forward errors", async () => {
    const service = new MonitoringService(makePrisma() as never);

    const errors = await service.forwardErrors("test-user");

    assert.deepEqual(errors, [
      {
        id: "forward-3",
        sourceMessageId: "message-3",
        destinationGroupJid: "destination@g.us",
        error: "send failed",
        createdAt: new Date("2026-06-01T12:03:00.000Z"),
      },
    ]);
  });

  it("returns recent activity without rawMessage", async () => {
    const service = new MonitoringService(makePrisma() as never);

    const activity = await service.recentActivity("test-user");

    assert.equal(activity.recentMessages.length, 2);
    assert.deepEqual(activity.recentMessages[0], {
      id: "message-1",
      sessionId: "wa_xxx",
      groupJid: "source@g.us",
      messageType: "image",
      text: "Promo https://amzn.to/abc",
      links: ["https://amzn.to/abc"],
      marketplaces: ["amazon"],
      createdAt: new Date("2026-06-01T12:00:00.000Z"),
    });
    assert.equal("rawMessage" in activity.recentMessages[0], false);
    assert.equal(activity.recentForwards[0]?.id, "forward-3");
    assert.equal("rawMessage" in activity.recentForwards[0], false);
  });
});
