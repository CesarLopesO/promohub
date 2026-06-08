import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { WhatsAppInviteService } from "./whatsapp-invite.service";

describe("WhatsAppInviteService", () => {
  it("uses the manual override without calling Baileys", async () => {
    let calls = 0;
    const service = new WhatsAppInviteService(
      {} as never,
      {
        getConnectedSocket: async () => {
          calls += 1;
          return {} as never;
        },
      } as never,
    );

    assert.equal(
      await service.getDestinationInviteUrl(
        "wa_xxx",
        "destination@g.us",
        "https://chat.whatsapp.com/OVERRIDE",
      ),
      "https://chat.whatsapp.com/OVERRIDE",
    );
    assert.equal(calls, 0);
  });

  it("generates and caches the destination invite URL", async () => {
    let calls = 0;
    const service = new WhatsAppInviteService(
      {
        whatsAppSession: {
          findUnique: async () => ({ id: "session-record-id" }),
        },
      } as never,
      {
        getConnectedSocket: async () => ({
          socket: {
            groupInviteCode: async () => {
              calls += 1;
              return "DESTINO";
            },
          },
        }),
      } as never,
    );

    assert.equal(
      await service.getDestinationInviteUrl("wa_xxx", "destination@g.us"),
      "https://chat.whatsapp.com/DESTINO",
    );
    assert.equal(
      await service.getDestinationInviteUrl("wa_xxx", "destination@g.us"),
      "https://chat.whatsapp.com/DESTINO",
    );
    assert.equal(calls, 1);
  });

  it("returns null when invite generation fails", async () => {
    const service = new WhatsAppInviteService(
      {
        whatsAppSession: {
          findUnique: async () => ({ id: "session-record-id" }),
        },
      } as never,
      {
        getConnectedSocket: async () => ({
          socket: {
            groupInviteCode: async () => {
              throw new Error("not-authorized");
            },
          },
        }),
      } as never,
    );

    assert.equal(
      await service.getDestinationInviteUrl("wa_xxx", "destination@g.us"),
      null,
    );
  });
});
