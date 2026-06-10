import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { WorkerLeaseService } from "./worker-lease.service";

type StoredLease = {
  sessionId: string;
  workerId: string | null;
  workerLeaseToken: string | null;
  workerLeaseExpiresAt: Date | null;
  lastHeartbeatAt: Date | null;
  deletedAt: Date | null;
};

const worker = {
  id: "worker-current",
  name: "api-embedded-1",
  status: "ACTIVE",
  lastHeartbeatAt: new Date(),
  maxSessions: 25,
  currentSessions: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeHarness(initial: Partial<StoredLease> = {}) {
  const row: StoredLease = {
    sessionId: "wa_test",
    workerId: null,
    workerLeaseToken: null,
    workerLeaseExpiresAt: null,
    lastHeartbeatAt: null,
    deletedAt: null,
    ...initial,
  };
  let recomputes = 0;
  const workers = {
    getCurrentWorker: () => worker,
    registerEmbeddedWorker: async () => worker,
    sessionLeaseMs: () => 30_000,
    recomputeCurrentSessions: async () => {
      recomputes += 1;
      return 1;
    },
  };
  const prisma = {
    whatsAppSession: {
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Partial<StoredLease>;
      }) => {
        if (!matches(row, where)) {
          return { count: 0 };
        }

        Object.assign(row, data);
        return { count: 1 };
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        matches(row, where) ? { workerLeaseToken: row.workerLeaseToken } : null,
    },
  };

  return {
    row,
    workers,
    service: new WorkerLeaseService(prisma as never, workers as never),
    recomputes: () => recomputes,
  };
}

function matches(row: StoredLease, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "OR" && Array.isArray(condition)) {
      return condition.some((item) =>
        matches(row, item as Record<string, unknown>),
      );
    }

    if (condition === null || typeof condition !== "object") {
      return row[key as keyof StoredLease] === condition;
    }

    const value = row[key as keyof StoredLease];
    const operators = condition as {
      lte?: Date;
      gt?: Date;
    };

    if (operators.lte) {
      return value instanceof Date && value <= operators.lte;
    }

    if (operators.gt) {
      return value instanceof Date && value > operators.gt;
    }

    return false;
  });
}

describe("WorkerLeaseService", () => {
  it("acquires a lease when the session has no owner", async () => {
    const harness = makeHarness();

    const lease = await harness.service.acquireSessionLease("wa_test");

    assert.ok(lease);
    assert.equal(harness.row.workerId, worker.id);
    assert.match(lease.leaseToken, /^[a-f0-9]{64}$/u);
    assert.equal(harness.recomputes(), 1);
  });

  it("refuses a lease owned by another worker while it is valid", async () => {
    const harness = makeHarness({
      workerId: "worker-other",
      workerLeaseToken: "a".repeat(64),
      workerLeaseExpiresAt: new Date(Date.now() + 60_000),
    });

    const lease = await harness.service.acquireSessionLease("wa_test");

    assert.equal(lease, null);
    assert.equal(harness.row.workerId, "worker-other");
  });

  it("reacquires an expired lease from another worker", async () => {
    const harness = makeHarness({
      workerId: "worker-other",
      workerLeaseToken: "a".repeat(64),
      workerLeaseExpiresAt: new Date(Date.now() - 1_000),
    });

    const lease = await harness.service.acquireSessionLease("wa_test");

    assert.ok(lease);
    assert.equal(harness.row.workerId, worker.id);
  });

  it("does not renew a lease with the wrong token", async () => {
    const harness = makeHarness({
      workerId: worker.id,
      workerLeaseToken: "a".repeat(64),
      workerLeaseExpiresAt: new Date(Date.now() + 30_000),
    });

    const renewed = await harness.service.renewSessionLease(
      "wa_test",
      "b".repeat(64),
    );

    assert.equal(renewed, false);
  });

  it("does not release a lease with the wrong token", async () => {
    const harness = makeHarness({
      workerId: worker.id,
      workerLeaseToken: "a".repeat(64),
      workerLeaseExpiresAt: new Date(Date.now() + 30_000),
    });

    const released = await harness.service.releaseSessionLease(
      "wa_test",
      "b".repeat(64),
    );

    assert.equal(released, false);
    assert.equal(harness.row.workerId, worker.id);
  });

  it("releases a lease with the correct token", async () => {
    const token = "a".repeat(64);
    const harness = makeHarness({
      workerId: worker.id,
      workerLeaseToken: token,
      workerLeaseExpiresAt: new Date(Date.now() + 30_000),
    });

    const released = await harness.service.releaseSessionLease(
      "wa_test",
      token,
    );

    assert.equal(released, true);
    assert.equal(harness.row.workerId, null);
    assert.equal(harness.row.workerLeaseToken, null);
    assert.equal(harness.recomputes(), 1);
  });
});
