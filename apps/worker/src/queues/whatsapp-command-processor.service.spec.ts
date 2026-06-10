import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { WhatsAppCommandProcessorService } from "./whatsapp-command-processor.service";

describe("WhatsAppCommandProcessorService", () => {
  const service = new WhatsAppCommandProcessorService({} as never);

  it("accepts valid command payloads in dry-run mode", () => {
    const received = service.processCommand("SESSION_START", {
      sessionId: "wa_test",
      requestedAt: "2026-06-10T12:00:00.000Z",
    });

    assert.equal(received, true);
  });

  it("rejects invalid payloads without throwing", () => {
    assert.doesNotThrow(() => {
      const received = service.processCommand("SESSION_STOP", {
        sessionId: "",
        requestedAt: "invalid",
        token: "must-not-be-accepted",
      });
      assert.equal(received, false);
    });
  });
});
