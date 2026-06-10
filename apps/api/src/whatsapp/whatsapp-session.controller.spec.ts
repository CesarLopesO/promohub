import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { WhatsAppSessionController } from "./whatsapp-session.controller";

describe("WhatsAppSessionController queue commands", () => {
  it("keeps direct embedded flows and publishes successful commands", async () => {
    const published: string[] = [];
    const session = {
      id: "session-record-id",
      userId: "test-user",
      sessionId: "wa_test",
      status: "CONNECTED" as const,
      updatedAt: new Date(),
    };
    const sessionManager = {
      createSession: async () => session,
      reconnectSession: async () => session,
      deleteSession: async () => ({
        ...session,
        status: "DISCONNECTED" as const,
      }),
    };
    const groupDiscovery = {
      syncGroups: async () => ({
        sessionId: session.sessionId,
        syncedCount: 0,
        groups: [],
      }),
    };
    const commands = {
      publishSessionStart: async (sessionId: string) => {
        published.push(`start:${sessionId}`);
        return true;
      },
      publishSessionReconnect: async (sessionId: string) => {
        published.push(`reconnect:${sessionId}`);
        return true;
      },
      publishSessionStop: async (sessionId: string) => {
        published.push(`stop:${sessionId}`);
        return true;
      },
      publishGroupsSync: async (sessionId: string) => {
        published.push(`sync:${sessionId}`);
        return true;
      },
    };
    const controller = new WhatsAppSessionController(
      sessionManager as never,
      groupDiscovery as never,
      commands as never,
    );
    const request = { user: { id: "test-user" } } as never;

    assert.equal(
      (await controller.create({}, request)).sessionId,
      session.sessionId,
    );
    assert.equal(
      (await controller.reconnect(session.id, request)).sessionId,
      session.sessionId,
    );
    assert.equal(
      (await controller.delete(session.id, request)).sessionId,
      session.sessionId,
    );
    assert.equal(
      (await controller.syncGroups(session.id, request)).sessionId,
      session.sessionId,
    );
    assert.deepEqual(published, [
      "start:wa_test",
      "reconnect:wa_test",
      "stop:wa_test",
      "sync:wa_test",
    ]);
  });

  it("does not depend on a queued job result in embedded mode", async () => {
    const session = {
      id: "session-record-id",
      userId: "test-user",
      sessionId: "wa_test",
      status: "CONNECTED" as const,
      updatedAt: new Date(),
    };
    const controller = new WhatsAppSessionController(
      {
        createSession: async () => session,
      } as never,
      {} as never,
      {
        publishSessionStart: async () => false,
      } as never,
    );

    const result = await controller.create({}, {
      user: { id: "test-user" },
    } as never);

    assert.equal(result, session);
  });
});
