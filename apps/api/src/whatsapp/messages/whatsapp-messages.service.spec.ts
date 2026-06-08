import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@prisma/client";
import type { WAMessage } from "@whiskeysockets/baileys";

import { MessageForwardingService } from "../../modules/routes/message-forwarding.service";
import { WhatsAppMessagesService } from "./whatsapp-messages.service";

function makeModuleRef(calls: Array<{ userId: string; messageId: string }>) {
  return {
    get: (token: unknown) => {
      assert.equal(token, MessageForwardingService);

      return {
        forwardMessageById: async (userId: string, messageId: string) => {
          calls.push({ userId, messageId });
        },
      };
    },
  };
}

async function flushAsyncWork(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe("WhatsAppMessagesService", () => {
  it("persists links extracted from a Baileys image caption", async () => {
    let createData: unknown;
    const prisma = {
      whatsAppMessage: {
        create: async ({ data }: { data: unknown }) => {
          createData = data;
          return {
            id: "saved-message-id",
            sessionId: "session-id",
            groupJid: "120363000000000000@g.us",
            session: {
              userId: "test-user",
            },
          };
        },
      },
      messageRoute: {
        findFirst: async () => ({ id: "route-id" }),
      },
    };
    const autoForwardCalls: Array<{ userId: string; messageId: string }> = [];
    const service = new WhatsAppMessagesService(
      prisma as never,
      makeModuleRef(autoForwardCalls) as never,
    );
    const message = {
      key: {
        remoteJid: "120363000000000000@g.us",
        id: "message-id",
        fromMe: false,
        participant: "5511999999999@s.whatsapp.net",
      },
      message: {
        imageMessage: {
          caption: "Oferta https://amzn.to/teste",
        },
      },
    } as WAMessage;

    await service.recordIncomingGroupMessage("session-id", message);
    await flushAsyncWork();

    assert.deepEqual(createData, {
      sessionId: "session-id",
      groupJid: "120363000000000000@g.us",
      senderJid: "5511999999999@s.whatsapp.net",
      messageId: "message-id",
      messageType: "image",
      text: "Oferta https://amzn.to/teste",
      hasMedia: true,
      links: ["https://amzn.to/teste"],
      marketplaces: ["amazon"],
      rawMessage: JSON.parse(JSON.stringify(message)),
    });
    assert.deepEqual(autoForwardCalls, [
      {
        userId: "test-user",
        messageId: "saved-message-id",
      },
    ]);
  });

  it("persists links and marketplaces extracted from a Baileys text message", async () => {
    let createData:
      | {
          links?: unknown;
          marketplaces?: unknown;
        }
      | undefined;
    const prisma = {
      whatsAppMessage: {
        create: async ({
          data,
        }: {
          data: {
            links?: unknown;
            marketplaces?: unknown;
          };
        }) => {
          createData = data;
          return {
            id: "saved-message-id",
            sessionId: "session-id",
            groupJid: "120363000000000000@g.us",
            session: {
              userId: "test-user",
            },
          };
        },
      },
      messageRoute: {
        findFirst: async () => ({ id: "route-id" }),
      },
    };
    const service = new WhatsAppMessagesService(
      prisma as never,
      makeModuleRef([]) as never,
    );
    const message = {
      key: {
        remoteJid: "120363000000000000@g.us",
        id: "message-id",
        fromMe: false,
        participant: "5511999999999@s.whatsapp.net",
      },
      message: {
        conversation: "Oferta https://amzn.to/teste e https://meli.la/teste",
      },
    } as WAMessage;

    await service.recordIncomingGroupMessage("session-id", message);

    assert.deepEqual(createData?.links, [
      "https://amzn.to/teste",
      "https://meli.la/teste",
    ]);
    assert.deepEqual(createData?.marketplaces, ["amazon", "mercado_livre"]);
  });

  it("backfills links when a duplicate message already exists", async () => {
    let updateData: unknown;
    const prisma = {
      whatsAppMessage: {
        create: async () => {
          throw new Prisma.PrismaClientKnownRequestError("Unique constraint", {
            code: "P2002",
            clientVersion: "test",
          });
        },
        update: async ({ data }: { data: unknown }) => {
          updateData = data;
          return data;
        },
      },
    };
    const service = new WhatsAppMessagesService(
      prisma as never,
      makeModuleRef([]) as never,
    );
    const message = {
      key: {
        remoteJid: "120363000000000000@g.us",
        id: "message-id",
        fromMe: false,
        participant: "5511999999999@s.whatsapp.net",
      },
      message: {
        conversation: "Loja oficial Amazon: https://amzn.to/4wZO1pR",
      },
    } as WAMessage;

    await service.recordIncomingGroupMessage("session-id", message);

    assert.deepEqual(updateData, {
      text: "Loja oficial Amazon: https://amzn.to/4wZO1pR",
      links: ["https://amzn.to/4wZO1pR"],
      marketplaces: ["amazon"],
    });
  });

  it("does not call auto forward when a captured message has no links", async () => {
    const autoForwardCalls: Array<{ userId: string; messageId: string }> = [];
    const prisma = {
      whatsAppMessage: {
        create: async () => ({
          id: "saved-message-id",
          sessionId: "session-id",
          groupJid: "120363000000000000@g.us",
          session: {
            userId: "test-user",
          },
        }),
      },
      messageRoute: {
        findFirst: async () => ({ id: "route-id" }),
      },
    };
    const service = new WhatsAppMessagesService(
      prisma as never,
      makeModuleRef(autoForwardCalls) as never,
    );
    const message = {
      key: {
        remoteJid: "120363000000000000@g.us",
        id: "message-id",
        fromMe: false,
        participant: "5511999999999@s.whatsapp.net",
      },
      message: {
        conversation: "Mensagem sem link",
      },
    } as WAMessage;

    await service.recordIncomingGroupMessage("session-id", message);

    assert.deepEqual(autoForwardCalls, []);
  });

  it("does not call auto forward when there is no active route", async () => {
    const autoForwardCalls: Array<{ userId: string; messageId: string }> = [];
    const prisma = {
      whatsAppMessage: {
        create: async () => ({
          id: "saved-message-id",
          sessionId: "session-id",
          groupJid: "120363000000000000@g.us",
          session: {
            userId: "test-user",
          },
        }),
      },
      messageRoute: {
        findFirst: async () => null,
      },
    };
    const service = new WhatsAppMessagesService(
      prisma as never,
      makeModuleRef(autoForwardCalls) as never,
    );
    const message = {
      key: {
        remoteJid: "120363000000000000@g.us",
        id: "message-id",
        fromMe: false,
        participant: "5511999999999@s.whatsapp.net",
      },
      message: {
        conversation: "Oferta https://amzn.to/teste",
      },
    } as WAMessage;

    await service.recordIncomingGroupMessage("session-id", message);
    await flushAsyncWork();

    assert.deepEqual(autoForwardCalls, []);
  });

  it("skips fromMe, private, reaction, and protocol messages", async () => {
    let createCount = 0;
    const service = new WhatsAppMessagesService(
      {
        whatsAppMessage: {
          create: async () => {
            createCount += 1;
          },
        },
      } as never,
      makeModuleRef([]) as never,
    );
    const messages = [
      {
        key: {
          remoteJid: "120363000000000000@g.us",
          id: "from-me",
          fromMe: true,
        },
        message: { conversation: "ignored" },
      },
      {
        key: {
          remoteJid: "5511999999999@s.whatsapp.net",
          id: "private",
          fromMe: false,
        },
        message: { conversation: "ignored" },
      },
      {
        key: {
          remoteJid: "120363000000000000@g.us",
          id: "reaction",
          fromMe: false,
        },
        message: { reactionMessage: { text: "👍" } },
      },
      {
        key: {
          remoteJid: "120363000000000000@g.us",
          id: "protocol",
          fromMe: false,
        },
        message: { protocolMessage: { type: 0 } },
      },
    ] as WAMessage[];

    for (const message of messages) {
      await service.recordIncomingGroupMessage("wa_current", message);
    }

    assert.equal(createCount, 0);
  });

  it("persists the public wa sessionId for ephemeral text messages", async () => {
    let storedSessionId = "";
    const service = new WhatsAppMessagesService(
      {
        whatsAppMessage: {
          create: async ({ data }: { data: { sessionId: string } }) => {
            storedSessionId = data.sessionId;
            return {
              id: "saved-message-id",
              sessionId: data.sessionId,
              groupJid: "120363000000000000@g.us",
              session: { userId: "test-user" },
            };
          },
        },
      } as never,
      makeModuleRef([]) as never,
    );

    await service.recordIncomingGroupMessage(
      "wa_5032495467bb4aa09dce5c851d78672a",
      {
        key: {
          remoteJid: "120363000000000000@g.us",
          id: "ephemeral-message",
          fromMe: false,
        },
        message: {
          ephemeralMessage: {
            message: {
              extendedTextMessage: { text: "Mensagem nova" },
            },
          },
        },
      } as WAMessage,
    );

    assert.equal(
      storedSessionId,
      "wa_5032495467bb4aa09dce5c851d78672a",
    );
  });
});
