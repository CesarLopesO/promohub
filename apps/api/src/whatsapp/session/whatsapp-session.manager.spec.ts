import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WAMessage } from "@whiskeysockets/baileys";

import { WhatsAppSessionManager } from "./whatsapp-session.manager";

describe("WhatsAppSessionManager listener", () => {
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
    );
    const internals = manager as unknown as {
      sessions: Map<
        string,
        { socket: unknown; listenerRegistered: boolean }
      >;
      registerMessageListener: (sessionId: string, socket: unknown) => void;
    };
    const sessionId = "wa_5032495467bb4aa09dce5c851d78672a";

    internals.sessions.set(sessionId, {
      socket,
      listenerRegistered: false,
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
    );
    const internals = manager as unknown as {
      sessions: Map<
        string,
        { socket: unknown; listenerRegistered: boolean }
      >;
    };
    internals.sessions.set(sessionId, {
      socket: {},
      listenerRegistered: true,
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
});
