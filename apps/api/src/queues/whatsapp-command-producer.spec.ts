import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { WhatsAppCommandProducer } from "./whatsapp-command-producer";

function makeConfig(enabled: boolean) {
  return {
    get: (name: string, fallback?: string) =>
      name === "WHATSAPP_QUEUE_COMMANDS_ENABLED" ? String(enabled) : fallback,
  };
}

describe("WhatsAppCommandProducer", () => {
  it("does not require Redis when queue commands are disabled", async () => {
    const producer = new WhatsAppCommandProducer(makeConfig(false) as never);

    assert.equal(await producer.publishSessionStart("wa_test"), false);
  });

  it("publishes minimal payloads with deterministic BullMQ-safe job IDs", async () => {
    const published: Array<{
      name: string;
      data: Record<string, unknown>;
      options: { jobId: string };
    }> = [];
    const queue = {
      add: async (
        name: string,
        data: Record<string, unknown>,
        options: { jobId: string },
      ) => {
        published.push({ name, data, options });
      },
      close: async () => undefined,
    };
    const producer = new WhatsAppCommandProducer(makeConfig(true) as never);
    const internals = producer as unknown as {
      queues: Map<string, typeof queue>;
    };

    for (const queueName of [
      "whatsapp.session.start",
      "whatsapp.session.stop",
      "whatsapp.session.reconnect",
      "whatsapp.groups.sync",
    ]) {
      internals.queues.set(queueName, queue);
    }

    await producer.publishSessionStart("wa_test");
    await producer.publishSessionStop("wa_test");
    await producer.publishSessionReconnect("wa_test");
    await producer.publishGroupsSync("wa_test");

    assert.deepEqual(
      published.map((job) => job.options.jobId),
      [
        "session-start-wa_test",
        "session-stop-wa_test",
        "session-reconnect-wa_test",
        "groups-sync-wa_test",
      ],
    );
    assert.deepEqual(
      published.map((job) => job.name),
      ["SESSION_START", "SESSION_STOP", "SESSION_RECONNECT", "GROUPS_SYNC"],
    );

    for (const job of published) {
      assert.deepEqual(Object.keys(job.data).sort(), [
        "requestedAt",
        "sessionId",
      ]);
      assert.equal(job.data.sessionId, "wa_test");
      assert.equal("token" in job.data, false);
      assert.equal("credentials" in job.data, false);
      assert.equal("qrCode" in job.data, false);
    }
  });
});
