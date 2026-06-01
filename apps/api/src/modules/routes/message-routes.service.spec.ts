import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MessageRoute } from "@prisma/client";

import { Marketplace } from "../affiliate/helpers/detect-marketplace";
import { MessageForwardingService } from "./message-forwarding.service";
import { MessageRoutesService } from "./message-routes.service";

type StoredMessage = {
  id: string;
  sessionId: string;
  groupJid: string;
  text: string | null;
  links?: unknown;
  messageType?: string;
  hasMedia?: boolean;
  rawMessage?: unknown;
};

type StoredForwarded = {
  id: string;
  userId: string;
  sessionId: string;
  sourceMessageId: string;
  sourceGroupJid: string;
  destinationGroupJid: string;
  originalText: string | null;
  rewrittenText: string;
  status: string;
  error: string | null;
  mode?: string | null;
  sentMessageType?: string | null;
  mediaForwarded: boolean;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function makeRoute(overrides: Partial<MessageRoute> = {}): MessageRoute {
  return {
    id: "route-id",
    userId: "test-user",
    sessionId: "wa_xxx",
    sourceGroupJid: "source@g.us",
    destinationGroupJid: "destination@g.us",
    isActive: true,
    createdAt: new Date("2026-06-01T12:00:00.000Z"),
    updatedAt: new Date("2026-06-01T12:00:00.000Z"),
    ...overrides,
  };
}

function makeService(options?: {
  routes?: MessageRoute[];
  messages?: StoredMessage[];
  forwarded?: StoredForwarded[];
  rewrittenText?: string;
  sessionStatus?: string;
  sendMessageError?: Error;
}) {
  const routes = [...(options?.routes ?? [])];
  const messages = options?.messages ?? [];
  const forwarded = [...(options?.forwarded ?? [])];
  const sentMessages: Array<{
    jid: string;
    content: unknown;
  }> = [];
  const prisma = {
    messageRoute: {
      upsert: async ({
        create,
        update,
      }: {
        create: Omit<MessageRoute, "id" | "createdAt" | "updatedAt">;
        update: Partial<MessageRoute>;
      }) => {
        const existing = routes.find(
          (route) =>
            route.sessionId === create.sessionId &&
            route.sourceGroupJid === create.sourceGroupJid &&
            route.destinationGroupJid === create.destinationGroupJid,
        );

        if (existing) {
          Object.assign(existing, update);
          return existing;
        }

        const route = makeRoute({ ...create, id: `route-${routes.length + 1}` });
        routes.push(route);

        return route;
      },
      findMany: async ({ where }: { where: Partial<MessageRoute> }) =>
        routes.filter((route) =>
          Object.entries(where).every(
            ([key, value]) =>
              value === undefined ||
              route[key as keyof MessageRoute] === value,
          ),
        ),
      findUnique: async ({ where }: { where: { id: string } }) =>
        routes.find((route) => route.id === where.id) ?? null,
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<MessageRoute>;
      }) => {
        const route = routes.find((item) => item.id === where.id);

        assert.ok(route);
        Object.assign(route, data);

        return route;
      },
    },
    whatsAppMessage: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        messages.find((message) => message.id === where.id) ?? null,
    },
    whatsAppSession: {
      findUnique: async ({ where }: { where: { sessionId: string } }) => ({
        id: "session-record-id",
        sessionId: where.sessionId,
        status: options?.sessionStatus ?? "CONNECTED",
      }),
    },
    forwardedMessage: {
      findFirst: async ({
        where,
      }: {
        where: {
          sourceMessageId: string;
          destinationGroupJid: string;
          status: string;
        };
      }) =>
        forwarded.find(
          (message) =>
            message.sourceMessageId === where.sourceMessageId &&
            message.destinationGroupJid === where.destinationGroupJid &&
            message.status === where.status,
        ) ?? null,
      create: async ({ data }: { data: Omit<StoredForwarded, "id" | "createdAt" | "updatedAt"> }) => {
        const message = {
          id: `forwarded-${forwarded.length + 1}`,
          createdAt: new Date("2026-06-01T12:00:00.000Z"),
          updatedAt: new Date("2026-06-01T12:00:00.000Z"),
          ...data,
        };
        forwarded.push(message);

        return message;
      },
      findMany: async ({ where }: { where: { userId?: string } }) =>
        forwarded.filter(
          (message) => !where.userId || message.userId === where.userId,
        ),
    },
  };
  const linkRewriter = {
    rewriteMessageForUser: async (_userId: string, messageId: string) => {
      const message = messages.find((item) => item.id === messageId);

      return {
        messageId,
        changed: Boolean(options?.rewrittenText),
        originalText: message?.text ?? "",
        rewrittenText: options?.rewrittenText ?? message?.text ?? "",
        rewrites: [
          {
            originalUrl: "https://amzn.to/abc",
            rewrittenUrl: "https://amzn.to/abc?tag=meutag-20",
            marketplace: Marketplace.AMAZON,
            changed: Boolean(options?.rewrittenText),
          },
        ],
      };
    },
  };
  const sessionManager = {
    getConnectedSocket: async () => ({
      socket: {
        sendMessage: async (jid: string, content: unknown) => {
          if (options?.sendMessageError) {
            throw options.sendMessageError;
          }

          sentMessages.push({ jid, content });
        },
      },
    }),
  };
  const forwardingService = new MessageForwardingService(
    prisma as never,
    linkRewriter as never,
    sessionManager as never,
  );

  return {
    service: new MessageRoutesService(
      prisma as never,
      linkRewriter as never,
      forwardingService,
    ),
    forwardingService,
    forwarded,
    sentMessages,
  };
}

describe("MessageRoutesService", () => {
  it("creates a route", async () => {
    const { service } = makeService();

    const route = await service.create({
      userId: "test-user",
      sessionId: "wa_xxx",
      sourceGroupJid: "source@g.us",
      destinationGroupJid: "destination@g.us",
    });

    assert.equal(route.isActive, true);
    assert.equal(route.destinationGroupJid, "destination@g.us");
  });

  it("lists routes", async () => {
    const { service } = makeService({
      routes: [
        makeRoute({ id: "route-1", userId: "test-user" }),
        makeRoute({ id: "route-2", userId: "other-user" }),
      ],
    });

    const routes = await service.list({ userId: "test-user" });

    assert.deepEqual(
      routes.map((route) => route.id),
      ["route-1"],
    );
  });

  it("soft deletes a route", async () => {
    const { service } = makeService({ routes: [makeRoute()] });

    const route = await service.softDelete("route-id");

    assert.equal(route.isActive, false);
  });

  it("previews without active routes", async () => {
    const { service } = makeService({
      messages: [
        {
          id: "message-id",
          sessionId: "wa_xxx",
          groupJid: "source@g.us",
          text: "Promo https://amzn.to/abc",
        },
      ],
      rewrittenText: "Promo https://amzn.to/abc?tag=meutag-20",
    });

    const preview = await service.preview({
      messageId: "message-id",
      userId: "test-user",
    });

    assert.deepEqual(preview.destinationGroups, []);
    assert.equal(preview.canForward, false);
  });

  it("previews with one active route", async () => {
    const { service } = makeService({
      routes: [makeRoute()],
      messages: [
        {
          id: "message-id",
          sessionId: "wa_xxx",
          groupJid: "source@g.us",
          text: "Promo https://amzn.to/abc",
        },
      ],
      rewrittenText: "Promo https://amzn.to/abc?tag=meutag-20",
    });

    const preview = await service.preview({
      messageId: "message-id",
      userId: "test-user",
    });

    assert.deepEqual(preview.destinationGroups, ["destination@g.us"]);
    assert.equal(preview.rewrittenText, "Promo https://amzn.to/abc?tag=meutag-20");
    assert.equal(preview.canForward, true);
  });

  it("previews with multiple active routes", async () => {
    const { service } = makeService({
      routes: [
        makeRoute({ id: "route-1", destinationGroupJid: "destination-1@g.us" }),
        makeRoute({ id: "route-2", destinationGroupJid: "destination-2@g.us" }),
      ],
      messages: [
        {
          id: "message-id",
          sessionId: "wa_xxx",
          groupJid: "source@g.us",
          text: "Promo https://amzn.to/abc",
        },
      ],
    });

    const preview = await service.preview({
      messageId: "message-id",
      userId: "test-user",
    });

    assert.deepEqual(preview.destinationGroups, [
      "destination-1@g.us",
      "destination-2@g.us",
    ]);
  });

  it("forwards with a valid route", async () => {
    const { service, forwarded, sentMessages } = makeService({
      routes: [makeRoute({ destinationGroupJid: "120363424647658210@g.us" })],
      messages: [
        {
          id: "message-id",
          sessionId: "wa_xxx",
          groupJid: "source@g.us",
          text: "Promo https://amzn.to/abc",
          links: ["https://amzn.to/abc"],
        },
      ],
      rewrittenText: "Promo https://amzn.to/abc?tag=meutag-20",
    });

    const response = await service.forward("message-id", {
      userId: "test-user",
    });

    assert.equal(response.sentCount, 1);
    assert.equal(forwarded[0]?.mode, "MANUAL");
    assert.deepEqual(sentMessages, [
      {
        jid: "120363424647658210@g.us",
        content: {
          text: "Promo https://amzn.to/abc?tag=meutag-20",
        },
      },
    ]);
  });

  it("does not forward without an active route", async () => {
    const { service, sentMessages } = makeService({
      messages: [
        {
          id: "message-id",
          sessionId: "wa_xxx",
          groupJid: "source@g.us",
          text: "Promo https://amzn.to/abc",
          links: ["https://amzn.to/abc"],
        },
      ],
    });

    const response = await service.forward("message-id", {
      userId: "test-user",
    });

    assert.equal(response.sentCount, 0);
    assert.equal(response.skippedCount, 0);
    assert.deepEqual(sentMessages, []);
  });

  it("auto forward skips when there are no active routes", async () => {
    const { forwardingService, sentMessages } = makeService({
      messages: [
        {
          id: "message-id",
          sessionId: "wa_xxx",
          groupJid: "source@g.us",
          text: "Promo https://amzn.to/abc",
          links: ["https://amzn.to/abc"],
        },
      ],
    });

    const response = await forwardingService.forwardMessageById(
      "test-user",
      "message-id",
      { mode: "auto" },
    );

    assert.equal(response.sentCount, 0);
    assert.deepEqual(sentMessages, []);
  });

  it("auto forward sends and stores AUTO mode", async () => {
    const { forwardingService, forwarded, sentMessages } = makeService({
      routes: [makeRoute()],
      messages: [
        {
          id: "message-id",
          sessionId: "wa_xxx",
          groupJid: "source@g.us",
          text: "Promo https://amzn.to/abc",
          links: ["https://amzn.to/abc"],
        },
      ],
      rewrittenText: "Promo https://amzn.to/abc?tag=meutag-20",
    });
    (
      forwardingService as unknown as {
        waitRandomDelay: () => Promise<void>;
      }
    ).waitRandomDelay = async () => undefined;

    const response = await forwardingService.forwardMessageById(
      "test-user",
      "message-id",
      { mode: "auto" },
    );

    assert.equal(response.sentCount, 1);
    assert.equal(forwarded[0]?.mode, "AUTO");
    assert.equal(sentMessages.length, 1);
  });

  it("forwards image messages with rewritten caption", async () => {
    const { forwardingService, forwarded, sentMessages } = makeService({
      routes: [makeRoute()],
      messages: [
        {
          id: "message-id",
          sessionId: "wa_xxx",
          groupJid: "source@g.us",
          text: "https://meli.la/abc",
          links: ["https://meli.la/abc"],
          messageType: "image",
          hasMedia: true,
          rawMessage: {
            message: {
              imageMessage: {
                url: "https://example.com/image.jpg",
              },
            },
          },
        },
      ],
      rewrittenText: "https://meli.la/abc?aff_id=ml-aff-123",
    });
    (
      forwardingService as unknown as {
        downloadImage: () => Promise<Buffer>;
      }
    ).downloadImage = async () => Buffer.from("image");

    const response = await forwardingService.forwardMessageById(
      "test-user",
      "message-id",
      { mode: "manual" },
    );

    assert.equal(response.sentCount, 1);
    assert.equal(response.results[0]?.sentMessageType, "image");
    assert.equal(response.results[0]?.mediaForwarded, true);
    assert.equal(forwarded[0]?.sentMessageType, "image");
    assert.equal(forwarded[0]?.mediaForwarded, true);
    assert.deepEqual(sentMessages[0], {
      jid: "destination@g.us",
      content: {
        image: Buffer.from("image"),
        caption: "https://meli.la/abc?aff_id=ml-aff-123",
      },
    });
  });

  it("forwards image messages from ephemeral raw messages", async () => {
    let rawMessage: unknown;
    const { forwardingService, sentMessages } = makeService({
      routes: [makeRoute()],
      messages: [
        {
          id: "message-id",
          sessionId: "wa_xxx",
          groupJid: "source@g.us",
          text: "https://meli.la/abc",
          links: ["https://meli.la/abc"],
          messageType: "image",
          hasMedia: true,
          rawMessage: {
            message: {
              ephemeralMessage: {
                message: {
                  imageMessage: {
                    url: "https://example.com/image.jpg",
                  },
                },
              },
            },
          },
        },
      ],
      rewrittenText: "https://meli.la/abc?aff_id=ml-aff-123",
    });
    (
      forwardingService as unknown as {
        downloadImage: (value: unknown) => Promise<Buffer>;
      }
    ).downloadImage = async (value: unknown) => {
      rawMessage = value;
      return Buffer.from("image");
    };

    await forwardingService.forwardMessageById("test-user", "message-id");

    assert.deepEqual(rawMessage, {
      message: {
        ephemeralMessage: {
          message: {
            imageMessage: {
              url: "https://example.com/image.jpg",
            },
          },
        },
      },
    });
    assert.equal(
      (sentMessages[0]?.content as { caption?: string }).caption,
      "https://meli.la/abc?aff_id=ml-aff-123",
    );
  });

  it("falls back to text when image download fails", async () => {
    const { forwardingService, forwarded, sentMessages } = makeService({
      routes: [makeRoute()],
      messages: [
        {
          id: "message-id",
          sessionId: "wa_xxx",
          groupJid: "source@g.us",
          text: "https://meli.la/abc",
          links: ["https://meli.la/abc"],
          messageType: "image",
          hasMedia: true,
          rawMessage: {
            message: {
              imageMessage: {
                url: "https://example.com/image.jpg",
              },
            },
          },
        },
      ],
      rewrittenText: "https://meli.la/abc?aff_id=ml-aff-123",
    });
    (
      forwardingService as unknown as {
        downloadImage: () => Promise<Buffer>;
      }
    ).downloadImage = async () => {
      throw new Error("download failed");
    };

    const response = await forwardingService.forwardMessageById(
      "test-user",
      "message-id",
    );

    assert.equal(response.results[0]?.status, "SENT_TEXT_FALLBACK");
    assert.equal(response.results[0]?.sentMessageType, "text_fallback");
    assert.equal(forwarded[0]?.status, "SENT_TEXT_FALLBACK");
    assert.equal(forwarded[0]?.mediaForwarded, false);
    assert.deepEqual(sentMessages[0], {
      jid: "destination@g.us",
      content: {
        text: "https://meli.la/abc?aff_id=ml-aff-123",
      },
    });
  });

  it("auto forward skips when no links were rewritten", async () => {
    const { forwardingService, sentMessages } = makeService({
      routes: [makeRoute()],
      messages: [
        {
          id: "message-id",
          sessionId: "wa_xxx",
          groupJid: "source@g.us",
          text: "Promo https://amzn.to/abc",
        },
      ],
    });

    const response = await forwardingService.forwardMessageById(
      "test-user",
      "message-id",
      { mode: "auto" },
    );

    assert.equal(response.sentCount, 0);
    assert.deepEqual(sentMessages, []);
  });

  it("rejects forward when the session is not connected", async () => {
    const { service } = makeService({
      routes: [makeRoute()],
      messages: [
        {
          id: "message-id",
          sessionId: "wa_xxx",
          groupJid: "source@g.us",
          text: "Promo https://amzn.to/abc",
        },
      ],
      sessionStatus: "DISCONNECTED",
    });

    await assert.rejects(
      () => service.forward("message-id", { userId: "test-user" }),
      /not connected/,
    );
  });

  it("records failed sends", async () => {
    const { service, forwarded } = makeService({
      routes: [makeRoute()],
      messages: [
        {
          id: "message-id",
          sessionId: "wa_xxx",
          groupJid: "source@g.us",
          text: "Promo https://amzn.to/abc",
        },
      ],
      sendMessageError: new Error("send failed"),
    });

    const response = await service.forward("message-id", {
      userId: "test-user",
    });

    assert.equal(response.failedCount, 1);
    assert.equal(forwarded[0]?.status, "FAILED");
    assert.equal(forwarded[0]?.error, "send failed");
  });

  it("avoids duplicate successful forwards", async () => {
    const { service, sentMessages } = makeService({
      routes: [makeRoute()],
      messages: [
        {
          id: "message-id",
          sessionId: "wa_xxx",
          groupJid: "source@g.us",
          text: "Promo https://amzn.to/abc",
        },
      ],
      forwarded: [
        {
          id: "forwarded-id",
          userId: "test-user",
          sessionId: "wa_xxx",
          sourceMessageId: "message-id",
          sourceGroupJid: "source@g.us",
          destinationGroupJid: "destination@g.us",
          originalText: "Promo https://amzn.to/abc",
          rewrittenText: "Promo https://amzn.to/abc?tag=meutag-20",
          status: "SENT",
          error: null,
          mode: "MANUAL",
          sentMessageType: "text",
          mediaForwarded: false,
          sentAt: new Date("2026-06-01T12:00:00.000Z"),
          createdAt: new Date("2026-06-01T12:00:00.000Z"),
          updatedAt: new Date("2026-06-01T12:00:00.000Z"),
        },
      ],
    });

    const response = await service.forward("message-id", {
      userId: "test-user",
    });

    assert.equal(response.skippedCount, 1);
    assert.equal(response.results[0]?.status, "SKIPPED_ALREADY_SENT");
    assert.deepEqual(sentMessages, []);
  });

  it("lists forwarded messages", async () => {
    const { service } = makeService({
      forwarded: [
        {
          id: "forwarded-id",
          userId: "test-user",
          sessionId: "wa_xxx",
          sourceMessageId: "message-id",
          sourceGroupJid: "source@g.us",
          destinationGroupJid: "destination@g.us",
          originalText: "Promo https://amzn.to/abc",
          rewrittenText: "Promo https://amzn.to/abc?tag=meutag-20",
          status: "SENT",
          error: null,
          mode: "MANUAL",
          sentMessageType: "text",
          mediaForwarded: false,
          sentAt: new Date("2026-06-01T12:00:00.000Z"),
          createdAt: new Date("2026-06-01T12:00:00.000Z"),
          updatedAt: new Date("2026-06-01T12:00:00.000Z"),
        },
      ],
    });

    const messages = await service.listForwarded({ userId: "test-user" });

    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.status, "SENT");
  });
});
