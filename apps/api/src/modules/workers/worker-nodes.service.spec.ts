import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { WorkerNodesService } from "./worker-nodes.service";

function makeConfig(values: Record<string, string> = {}) {
  return {
    get: (name: string, fallback?: string) => values[name] ?? fallback,
  };
}

describe("WorkerNodesService", () => {
  it("registers the embedded worker and transitions it to ACTIVE", async () => {
    const statuses: string[] = [];
    const worker = {
      id: "worker-1",
      name: "api-embedded-test",
      status: "STARTING",
      lastHeartbeatAt: new Date(),
      maxSessions: 25,
      currentSessions: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const prisma = {
      workerNode: {
        upsert: async ({
          create,
        }: {
          create: { status: string; name: string };
        }) => {
          statuses.push(create.status);
          return { ...worker, name: create.name };
        },
        update: async ({ data }: { data: { status?: string } }) => {
          if (data.status) {
            statuses.push(data.status);
          }
          return { ...worker, ...data };
        },
      },
      whatsAppSession: {
        count: async () => 0,
      },
    };
    const service = new WorkerNodesService(
      prisma as never,
      makeConfig({ WORKER_NAME: "api-embedded-test" }) as never,
    );

    const registered = await service.registerEmbeddedWorker();

    assert.equal(registered.name, "api-embedded-test");
    assert.equal(registered.status, "ACTIVE");
    assert.deepEqual(statuses, ["STARTING", "ACTIVE"]);
  });

  it("heartbeat updates lastHeartbeatAt", async () => {
    const heartbeatDates: Date[] = [];
    const worker = {
      id: "worker-1",
      name: "api-embedded-1",
      status: "ACTIVE",
      lastHeartbeatAt: new Date("2026-06-10T10:00:00.000Z"),
      maxSessions: 25,
      currentSessions: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const prisma = {
      workerNode: {
        upsert: async () => worker,
        update: async ({ data }: { data: { lastHeartbeatAt?: Date } }) => {
          if (data.lastHeartbeatAt) {
            heartbeatDates.push(data.lastHeartbeatAt);
          }
          return { ...worker, ...data };
        },
        updateMany: async () => ({ count: 0 }),
      },
      whatsAppSession: {
        count: async () => 0,
      },
    };
    const service = new WorkerNodesService(
      prisma as never,
      makeConfig() as never,
    );
    await service.registerEmbeddedWorker();
    const beforeHeartbeat = new Date();

    const updated = await service.heartbeat();

    assert.ok(updated.lastHeartbeatAt >= beforeHeartbeat);
    assert.ok(heartbeatDates.some((heartbeat) => heartbeat >= beforeHeartbeat));
  });

  it("recomputes currentSessions from active leases", async () => {
    let persistedCount = -1;
    const prisma = {
      workerNode: {
        update: async ({ data }: { data: { currentSessions: number } }) => {
          persistedCount = data.currentSessions;
          return {};
        },
      },
      whatsAppSession: {
        count: async () => 7,
      },
    };
    const service = new WorkerNodesService(
      prisma as never,
      makeConfig() as never,
    );

    const count = await service.recomputeCurrentSessions("worker-1");

    assert.equal(count, 7);
    assert.equal(persistedCount, 7);
  });
});
