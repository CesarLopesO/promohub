import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import type { WAMessage } from "@whiskeysockets/baileys";

import { WhatsAppSessionManager } from "./whatsapp-session.manager";

const workers = {
  registerEmbeddedWorker: async () => ({
    id: "worker-1",
    name: "api-embedded-1",
  }),
  getCurrentWorker: () => ({
    id: "worker-1",
    name: "api-embedded-1",
  }),
  heartbeatIntervalMs: () => 10_000,
};

const leases = {
  acquireSessionLease: async () => ({
    sessionId: "wa_test",
    leaseToken: "a".repeat(64),
    workerId: "worker-1",
    workerName: "api-embedded-1",
    expiresAt: new Date(Date.now() + 30_000),
  }),
  renewSessionLease: async () => true,
  releaseSessionLease: async () => true,
};

describe("WhatsAppSessionManager listener", () => {
  it("does not create a session when the plan limit is reached", async () => {
    let createCalled = false;
    const manager = new WhatsAppSessionManager(
      {
        whatsAppSession: {
          create: async () => {
            createCalled = true;
          },
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {
        assertCanCreateWhatsAppSession: async () => {
          throw new ForbiddenException({
            code: "PLAN_LIMIT_REACHED",
            message: "Limite atingido.",
          });
        },
      } as never,
      workers as never,
      leases as never,
    );

    await assert.rejects(
      () => manager.createSession("test-user"),
      ForbiddenException,
    );
    assert.equal(createCalled, false);
  });

  it("registers one messages.upsert listener with the public sessionId", async () => {
    const handlers = new Map<string, (event: unknown) => void>();
    const calls: Array<{ sessionId: string; message: WAMessage }> = [];
    const socket = {
      ev: {
        on: (event: string, handler: (value: unknown) => void) => {
          handlers.set(event, handler);
        },
      },
    };
    const manager = new WhatsAppSessionManager(
      {} as never,
      {} as never,
      {} as never,
      {
        recordIncomingGroupMessage: async (
          sessionId: string,
          message: WAMessage,
        ) => {
          calls.push({ sessionId, message });
        },
      } as never,
      {} as never,
      workers as never,
      leases as never,
    );
    const internals = manager as unknown as {
      sessions: Map<
        string,
        {
          socket: unknown;
          listenerRegistered: boolean;
          leaseToken: string;
        }
      >;
      registerMessageListener: (sessionId: string, socket: unknown) => void;
    };
    const sessionId = "wa_5032495467bb4aa09dce5c851d78672a";

    internals.sessions.set(sessionId, {
      socket,
      listenerRegistered: false,
      leaseToken: "a".repeat(64),
    });
    internals.registerMessageListener(sessionId, socket);
    const firstHandler = handlers.get("messages.upsert");
    internals.registerMessageListener(sessionId, socket);

    assert.ok(firstHandler);
    assert.equal(handlers.get("messages.upsert"), firstHandler);
    firstHandler({
      type: "notify",
      messages: [{ key: { id: "message-id" } }],
    });
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.sessionId, sessionId);
  });

  it("reports debug counts using the public sessionId", async () => {
    const sessionId = "wa_5032495467bb4aa09dce5c851d78672a";
    const manager = new WhatsAppSessionManager(
      {
        whatsAppSession: {
          findFirst: async () => ({
            id: "cmq4927se0000cp4ts8gebryl",
            userId: "test-user",
            sessionId,
            status: "CONNECTED",
            deletedAt: null,
          }),
        },
        whatsAppGroup: {
          count: async ({ where }: { where: { sessionId: string } }) => {
            assert.equal(where.sessionId, sessionId);
            return 8;
          },
        },
        whatsAppMessage: {
          count: async ({ where }: { where: { sessionId: string } }) => {
            assert.equal(where.sessionId, sessionId);
            return 3;
          },
          findFirst: async () => ({
            createdAt: new Date("2026-06-07T12:00:00.000Z"),
          }),
        },
        messageRoute: {
          count: async ({ where }: { where: { sessionId: string } }) => {
            assert.equal(where.sessionId, sessionId);
            return 2;
          },
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      workers as never,
      leases as never,
    );
    const internals = manager as unknown as {
      sessions: Map<
        string,
        {
          socket: unknown;
          listenerRegistered: boolean;
          leaseToken: string;
        }
      >;
    };
    internals.sessions.set(sessionId, {
      socket: {},
      listenerRegistered: true,
      leaseToken: "a".repeat(64),
    });

    assert.deepEqual(
      await manager.readDebug("cmq4927se0000cp4ts8gebryl", "test-user"),
      {
        id: "cmq4927se0000cp4ts8gebryl",
        sessionId,
        status: "CONNECTED",
        hasSocket: true,
        listenerRegistered: true,
        groupsCount: 8,
        messagesCount: 3,
        lastMessageAt: new Date("2026-06-07T12:00:00.000Z"),
        routesCount: 2,
      },
    );
  });

  it("does not open the socket when session lease acquisition fails", async () => {
    let authStateRequested = false;
    const manager = new WhatsAppSessionManager(
      {
        whatsAppSession: {
          findFirst: async () => ({
            id: "session-record-id",
            userId: "test-user",
            sessionId: "wa_owned",
            status: "CONNECTED",
            deletedAt: null,
          }),
        },
      } as never,
      {
        getAuthState: async () => {
          authStateRequested = true;
          throw new Error("must not be called");
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      workers as never,
      {
        ...leases,
        acquireSessionLease: async () => null,
      } as never,
    );
    const internals = manager as unknown as {
      startRuntime: (sessionId: string) => Promise<unknown>;
    };

    await assert.rejects(() => internals.startRuntime("wa_owned"));
    assert.equal(authStateRequested, false);
  });

  it("keeps CONNECTED status readable after an embedded restart", async () => {
    const connectedAt = new Date("2026-06-10T12:00:00.000Z");
    const manager = new WhatsAppSessionManager(
      {
        whatsAppSession: {
          findFirst: async () => ({
            id: "session-record-id",
            userId: "test-user",
            sessionId: "wa_connected",
            status: "CONNECTED",
            qrCode: null,
            qrCodeDataUrl: null,
            phoneNumber: "5511999999999",
            connectedAt,
            disconnectedAt: null,
            deletedAt: null,
            updatedAt: connectedAt,
          }),
        },
      } as never,
      {} as never,
      {
        setSession: async () => undefined,
      } as never,
      {} as never,
      {} as never,
      workers as never,
      leases as never,
    );

    const status = await manager.readStatus("session-record-id", "test-user");

    assert.equal(status.status, "CONNECTED");
    assert.equal(status.connectedAt, connectedAt);
  });
});
