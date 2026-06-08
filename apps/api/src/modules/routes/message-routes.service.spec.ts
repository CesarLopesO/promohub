import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, ConflictException } from "@nestjs/common";
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
  sentProviderMessageId?: string | null;
  sentProviderRaw?: unknown;
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
    destinationInviteUrl: null,
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
  rewriteMode?: "real" | "legacy" | "disabled";
  rewriteMarketplace?: Marketplace;
  rewriteSameProduct?: boolean;
  rewriteCanForward?: boolean;
  rewriteReason?: string;
  rewriteResults?: Array<{
    originalUrl: string;
    rewrittenUrl: string;
    marketplace: Marketplace;
    changed: boolean;
    canForward?: boolean;
    reason?: string;
  }>;
  sessionStatus?: string;
  sendMessageError?: Error;
  sendMessageResult?: unknown;
  generatedInviteUrls?: Record<string, string | null>;
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
      create: async ({
        data,
      }: {
        data: Omit<MessageRoute, "id" | "createdAt" | "updatedAt">;
      }) => {
        const route = makeRoute({ ...data, id: `route-${routes.length + 1}` });
        routes.push(route);

        return route;
      },
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

        const route = makeRoute({
          ...create,
          id: `route-${routes.length + 1}`,
        });
        routes.push(route);

        return route;
      },
      findMany: async ({ where }: { where: Partial<MessageRoute> }) =>
        routes.filter((route) =>
          Object.entries(where).every(
            ([key, value]) =>
              value === undefined || route[key as keyof MessageRoute] === value,
          ),
        ),
      findUnique: async ({ where }: { where: { id: string } }) =>
        routes.find((route) => route.id === where.id) ?? null,
      findFirst: async ({ where }: { where: Partial<MessageRoute> }) =>
        routes.find((route) =>
          Object.entries(where).every(
            ([key, value]) =>
              value === undefined || route[key as keyof MessageRoute] === value,
          ),
        ) ?? null,
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
      findFirst: async ({ where }: { where: { sessionId: string } }) => ({
        id: "session-record-id",
        sessionId: where.sessionId,
        status: options?.sessionStatus ?? "CONNECTED",
      }),
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
      create: async ({
        data,
      }: {
        data: Omit<StoredForwarded, "id" | "createdAt" | "updatedAt">;
      }) => {
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
      const isMercadoLivre =
        options?.rewriteMarketplace === Marketplace.MERCADO_LIVRE;

      return {
        messageId,
        changed: Boolean(options?.rewrittenText),
        canForward:
          Boolean(options?.rewrittenText) &&
          options?.rewriteCanForward !== false,
        originalText: message?.text ?? "",
        rewrittenText: options?.rewrittenText ?? message?.text ?? "",
        rewrites: options?.rewriteResults ?? [
          {
            originalUrl: isMercadoLivre
              ? "https://meli.la/original"
              : "https://amzn.to/abc",
            rewrittenUrl: isMercadoLivre
              ? (options?.rewrittenText ?? "https://meli.la/generated")
              : "https://amzn.to/abc?tag=meutag-20",
            marketplace: options?.rewriteMarketplace ?? Marketplace.AMAZON,
            changed: Boolean(options?.rewrittenText),
            ...(options?.rewriteMode ? { mode: options.rewriteMode } : {}),
            ...(options?.rewriteSameProduct !== undefined
              ? { sameProduct: options.rewriteSameProduct }
              : {}),
            ...(options?.rewriteCanForward !== undefined
              ? { canForward: options.rewriteCanForward }
              : {}),
            ...(options?.rewriteReason
              ? { reason: options.rewriteReason }
              : {}),
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
          return (
            options?.sendMessageResult ?? {
              key: {
                id: "provider-message-id",
                remoteJid: jid,
                fromMe: true,
              },
              messageTimestamp: 1_717_171_717,
              status: 1,
              message: content,
            }
          );
        },
      },
    }),
  };
  const inviteCalls: string[] = [];
  const inviteService = {
    getDestinationInviteUrl: async (
      _sessionId: string,
      destinationGroupJid: string,
      overrideUrl?: string | null,
    ) => {
      inviteCalls.push(destinationGroupJid);
      return (
        overrideUrl ??
        options?.generatedInviteUrls?.[destinationGroupJid] ??
        null
      );
    },
  };
  const forwardingService = new MessageForwardingService(
    prisma as never,
    linkRewriter as never,
    sessionManager as never,
    inviteService as never,
  );
  const planLimits = {
    assertCanCreateRoute: async () => undefined,
  };

  return {
    service: new MessageRoutesService(
      prisma as never,
      linkRewriter as never,
      forwardingService,
      planLimits as never,
      inviteService as never,
    ),
    forwardingService,
    forwarded,
    sentMessages,
    inviteCalls,
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
      destinationInviteUrl: "https://chat.whatsapp.com/DESTINO",
    });

    assert.equal(route.isActive, true);
    assert.equal(route.destinationGroupJid, "destination@g.us");
    assert.equal(
      route.destinationInviteUrl,
      "https://chat.whatsapp.com/DESTINO",
    );
  });

  it("blocks an exact active duplicate route", async () => {
    const { service } = makeService({ routes: [makeRoute()] });

    await assert.rejects(
      () =>
        service.create({
          userId: "test-user",
          sessionId: "wa_xxx",
          sourceGroupJid: "source@g.us",
          destinationGroupJid: "destination@g.us",
        }),
      ConflictException,
    );
  });

  it("allows same groups in another session", async () => {
    const { service } = makeService({ routes: [makeRoute()] });

    const route = await service.create({
      userId: "test-user",
      sessionId: "wa_other",
      sourceGroupJid: "source@g.us",
      destinationGroupJid: "destination@g.us",
    });

    assert.equal(route.sessionId, "wa_other");
  });

  it("allows same groups for another user", async () => {
    const { service } = makeService({ routes: [makeRoute()] });

    const route = await service.create({
      userId: "other-user",
      sessionId: "wa_xxx",
      sourceGroupJid: "source@g.us",
      destinationGroupJid: "destination@g.us",
    });

    assert.equal(route.userId, "other-user");
  });

  it("reactivates an inactive exact route", async () => {
    const { service } = makeService({
      routes: [makeRoute({ isActive: false })],
    });

    const route = await service.create({
      userId: "test-user",
      sessionId: "wa_xxx",
      sourceGroupJid: "source@g.us",
      destinationGroupJid: "destination@g.us",
    });

    assert.equal(route.id, "route-id");
    assert.equal(route.isActive, true);
  });

  it("blocks source and destination with the same group", async () => {
    const { service } = makeService();

    await assert.rejects(
      () =>
        service.create({
          userId: "test-user",
          sessionId: "wa_xxx",
          sourceGroupJid: "same@g.us",
          destinationGroupJid: "same@g.us",
        }),
      BadRequestException,
    );
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
    assert.equal(
      preview.rewrittenText,
      "Promo https://amzn.to/abc?tag=meutag-20",
    );
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

  it("replaces WhatsApp links in preview with the route invite URL", async () => {
    const destinationInviteUrl = "https://chat.whatsapp.com/DESTINO";
    const { service } = makeService({
      routes: [makeRoute({ destinationInviteUrl })],
      messages: [
        {
          id: "message-id",
          sessionId: "wa_xxx",
          groupJid: "source@g.us",
          text: "Entre em https://whatsapp.com/channel/terceiro",
        },
      ],
    });

    const preview = await service.preview({
      messageId: "message-id",
      userId: "test-user",
    });

    assert.equal(preview.rewrittenText, `Entre em ${destinationInviteUrl}`);
    assert.deepEqual(preview.rewrites.at(-1), {
      originalUrl: "https://whatsapp.com/channel/terceiro",
      rewrittenUrl: destinationInviteUrl,
      marketplace: Marketplace.WHATSAPP,
      changed: true,
      canForward: true,
    });
    assert.equal(preview.canForward, true);
  });

  it("automatically generates the invite URL when the route has no override", async () => {
    const originalUrl = "https://chat.whatsapp.com/terceiro";
    const generatedInviteUrl = "https://chat.whatsapp.com/GERADO";
    const { service } = makeService({
      routes: [makeRoute()],
      generatedInviteUrls: {
        "destination@g.us": generatedInviteUrl,
      },
      messages: [
        {
          id: "message-id",
          sessionId: "wa_xxx",
          groupJid: "source@g.us",
          text: `Entre em ${originalUrl}`,
        },
      ],
    });

    const preview = await service.preview({
      messageId: "message-id",
      userId: "test-user",
    });

    assert.equal(preview.rewrittenText, `Entre em ${generatedInviteUrl}`);
    assert.deepEqual(preview.warnings, []);
    assert.equal(preview.rewrites.at(-1)?.changed, true);
    assert.equal(preview.canForward, true);
  });

  it("keeps WhatsApp links and warns when invite generation fails", async () => {
    const originalUrl = "https://chat.whatsapp.com/terceiro";
    const { service } = makeService({
      routes: [makeRoute()],
      generatedInviteUrls: {
        "destination@g.us": null,
      },
      messages: [
        {
          id: "message-id",
          sessionId: "wa_xxx",
          groupJid: "source@g.us",
          text: `Entre em ${originalUrl}`,
        },
      ],
    });

    const preview = await service.preview({
      messageId: "message-id",
      userId: "test-user",
    });

    assert.equal(preview.rewrittenText, `Entre em ${originalUrl}`);
    assert.deepEqual(preview.warnings, ["WHATSAPP_INVITE_CODE_FAILED"]);
    assert.equal(preview.rewrites.at(-1)?.changed, false);
    assert.equal(
      preview.rewrites.at(-1)?.warning,
      "WHATSAPP_INVITE_CODE_FAILED",
    );
    assert.equal(preview.canForward, true);
  });

  it("returns a different preview for each destination", async () => {
    const { service } = makeService({
      routes: [
        makeRoute({
          id: "route-1",
          destinationGroupJid: "destination-1@g.us",
        }),
        makeRoute({
          id: "route-2",
          destinationGroupJid: "destination-2@g.us",
        }),
      ],
      generatedInviteUrls: {
        "destination-1@g.us": "https://chat.whatsapp.com/DESTINO1",
        "destination-2@g.us": "https://chat.whatsapp.com/DESTINO2",
      },
      messages: [
        {
          id: "message-id",
          sessionId: "wa_xxx",
          groupJid: "source@g.us",
          text: "Entre em https://chat.whatsapp.com/terceiro",
        },
      ],
    });

    const preview = await service.preview({
      messageId: "message-id",
      userId: "test-user",
    });

    assert.deepEqual(
      preview.destinationPreviews.map((item) => item.rewrittenText),
      [
        "Entre em https://chat.whatsapp.com/DESTINO1",
        "Entre em https://chat.whatsapp.com/DESTINO2",
      ],
    );
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
    assert.equal(forwarded[0]?.sentProviderMessageId, "provider-message-id");
    assert.deepEqual(forwarded[0]?.sentProviderRaw, {
      key: {
        id: "provider-message-id",
        remoteJid: "120363424647658210@g.us",
        fromMe: true,
      },
      messageTimestamp: 1_717_171_717,
      status: 1,
    });
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

  it("forwards Amazon affiliate and replaces the WhatsApp link", async () => {
    const destinationInviteUrl = "https://chat.whatsapp.com/DESTINO";
    const { forwardingService, sentMessages } = makeService({
      routes: [makeRoute({ destinationInviteUrl })],
      messages: [
        {
          id: "message-id",
          sessionId: "wa_xxx",
          groupJid: "source@g.us",
          text: "Oferta https://amzn.to/abc https://wa.me/559999",
          links: ["https://amzn.to/abc", "https://wa.me/559999"],
        },
      ],
      rewrittenText:
        "Oferta https://amzn.to/abc?tag=meutag-20 https://wa.me/559999",
    });
    (
      forwardingService as unknown as {
        waitRandomDelay: () => Promise<void>;
      }
    ).waitRandomDelay = async () => undefined;

    await forwardingService.forwardMessageById("test-user", "message-id", {
      mode: "auto",
    });

    assert.equal(
      (sentMessages[0]?.content as { text?: string }).text,
      `Oferta https://amzn.to/abc?tag=meutag-20 ${destinationInviteUrl}`,
    );
  });

  it("forwards Mercado Livre affiliate and replaces the WhatsApp link", async () => {
    const destinationInviteUrl = "https://chat.whatsapp.com/DESTINO";
    const { forwardingService, sentMessages } = makeService({
      routes: [makeRoute({ destinationInviteUrl })],
      messages: [
        {
          id: "message-id",
          sessionId: "wa_xxx",
          groupJid: "source@g.us",
          text: "Oferta https://meli.la/original chat.whatsapp.com/terceiro",
          links: ["https://meli.la/original", "chat.whatsapp.com/terceiro"],
        },
      ],
      rewrittenText:
        "Oferta https://meli.la/generated chat.whatsapp.com/terceiro",
      rewriteResults: [
        {
          originalUrl: "https://meli.la/original",
          rewrittenUrl: "https://meli.la/generated",
          marketplace: Marketplace.MERCADO_LIVRE,
          changed: true,
          canForward: true,
        },
      ],
    });
    (
      forwardingService as unknown as {
        waitRandomDelay: () => Promise<void>;
      }
    ).waitRandomDelay = async () => undefined;

    await forwardingService.forwardMessageById("test-user", "message-id", {
      mode: "auto",
    });

    assert.equal(
      (sentMessages[0]?.content as { text?: string }).text,
      `Oferta https://meli.la/generated ${destinationInviteUrl}`,
    );
  });

  it("generates distinct invite links while forwarding to multiple destinations", async () => {
    const { forwardingService, sentMessages, forwarded } = makeService({
      routes: [
        makeRoute({
          id: "route-1",
          destinationGroupJid: "destination-1@g.us",
        }),
        makeRoute({
          id: "route-2",
          destinationGroupJid: "destination-2@g.us",
        }),
      ],
      generatedInviteUrls: {
        "destination-1@g.us": "https://chat.whatsapp.com/DESTINO1",
        "destination-2@g.us": "https://chat.whatsapp.com/DESTINO2",
      },
      messages: [
        {
          id: "message-id",
          sessionId: "wa_xxx",
          groupJid: "source@g.us",
          text: "Oferta https://amzn.to/abc https://wa.me/terceiro",
          links: ["https://amzn.to/abc", "https://wa.me/terceiro"],
        },
      ],
      rewrittenText:
        "Oferta https://amzn.to/abc?tag=meutag-20 https://wa.me/terceiro",
    });
    (
      forwardingService as unknown as {
        waitRandomDelay: () => Promise<void>;
      }
    ).waitRandomDelay = async () => undefined;

    await forwardingService.forwardMessageById("test-user", "message-id", {
      mode: "auto",
    });

    assert.deepEqual(
      sentMessages.map(
        (message) => (message.content as { text?: string }).text,
      ),
      [
        "Oferta https://amzn.to/abc?tag=meutag-20 https://chat.whatsapp.com/DESTINO1",
        "Oferta https://amzn.to/abc?tag=meutag-20 https://chat.whatsapp.com/DESTINO2",
      ],
    );
    assert.deepEqual(
      forwarded.map((message) => message.rewrittenText),
      [
        "Oferta https://amzn.to/abc?tag=meutag-20 https://chat.whatsapp.com/DESTINO1",
        "Oferta https://amzn.to/abc?tag=meutag-20 https://chat.whatsapp.com/DESTINO2",
      ],
    );
  });

  it("keeps the external link and warns when automatic invite generation fails", async () => {
    const originalText = "Oferta https://wa.me/terceiro";
    const { forwardingService, sentMessages } = makeService({
      routes: [makeRoute()],
      generatedInviteUrls: {
        "destination@g.us": null,
      },
      messages: [
        {
          id: "message-id",
          sessionId: "wa_xxx",
          groupJid: "source@g.us",
          text: originalText,
          links: ["https://wa.me/terceiro"],
        },
      ],
    });

    const result = await forwardingService.forwardMessageById(
      "test-user",
      "message-id",
    );

    assert.equal(
      (sentMessages[0]?.content as { text?: string }).text,
      originalText,
    );
    assert.deepEqual(result.results[0]?.warnings, [
      "WHATSAPP_INVITE_CODE_FAILED",
    ]);
  });

  it("auto forward sends when all Mercado Livre links were converted", async () => {
    const { forwardingService, forwarded, sentMessages } = makeService({
      routes: [makeRoute()],
      messages: [
        {
          id: "message-id",
          sessionId: "wa_xxx",
          groupJid: "source@g.us",
          text: "https://meli.la/one https://meli.la/two",
          links: ["https://meli.la/one", "https://meli.la/two"],
        },
      ],
      rewrittenText:
        "https://meli.la/generated-one https://meli.la/generated-two",
      rewriteResults: [
        {
          originalUrl: "https://meli.la/one",
          rewrittenUrl: "https://meli.la/generated-one",
          marketplace: Marketplace.MERCADO_LIVRE,
          changed: true,
          canForward: true,
        },
        {
          originalUrl: "https://meli.la/two",
          rewrittenUrl: "https://meli.la/generated-two",
          marketplace: Marketplace.MERCADO_LIVRE,
          changed: true,
          canForward: true,
        },
      ],
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
    assert.equal(sentMessages.length, 1);
    assert.equal(forwarded[0]?.status, "SENT");
  });

  it("auto forward skips when any Mercado Livre link fails conversion", async () => {
    const { forwardingService, forwarded, sentMessages } = makeService({
      routes: [makeRoute()],
      messages: [
        {
          id: "message-id",
          sessionId: "wa_xxx",
          groupJid: "source@g.us",
          text: "https://meli.la/good https://meli.la/bad",
          links: ["https://meli.la/good", "https://meli.la/bad"],
        },
      ],
      rewrittenText: "https://meli.la/generated-good",
      rewriteResults: [
        {
          originalUrl: "https://meli.la/good",
          rewrittenUrl: "https://meli.la/generated-good",
          marketplace: Marketplace.MERCADO_LIVRE,
          changed: true,
          canForward: true,
        },
        {
          originalUrl: "https://meli.la/bad",
          rewrittenUrl: "https://meli.la/bad",
          marketplace: Marketplace.MERCADO_LIVRE,
          changed: false,
          canForward: false,
          reason: "MERCADO_LIVRE_GENERATION_FAILED",
        },
      ],
    });

    const response = await forwardingService.forwardMessageById(
      "test-user",
      "message-id",
      { mode: "auto" },
    );

    assert.equal(response.sentCount, 0);
    assert.equal(response.skippedCount, 1);
    assert.equal(response.results[0]?.error, "MERCADO_LIVRE_GENERATION_FAILED");
    assert.equal(forwarded[0]?.status, "SKIPPED");
    assert.equal(forwarded[0]?.error, "MERCADO_LIVRE_GENERATION_FAILED");
    assert.deepEqual(sentMessages, []);
  });

  it("auto forward skips when generation from the selected candidate fails", async () => {
    const { forwardingService, forwarded, sentMessages } = makeService({
      routes: [makeRoute()],
      messages: [
        {
          id: "message-id",
          sessionId: "wa_xxx",
          groupJid: "source@g.us",
          text: "https://meli.la/social",
          links: ["https://meli.la/social"],
        },
      ],
      rewriteResults: [
        {
          originalUrl: "https://meli.la/social",
          rewrittenUrl: "https://meli.la/social",
          marketplace: Marketplace.MERCADO_LIVRE,
          changed: false,
          canForward: false,
          reason: "MERCADO_LIVRE_GENERATION_FAILED",
        },
      ],
    });

    const response = await forwardingService.forwardMessageById(
      "test-user",
      "message-id",
      { mode: "auto" },
    );

    assert.equal(response.sentCount, 0);
    assert.equal(forwarded[0]?.status, "SKIPPED");
    assert.deepEqual(sentMessages, []);
  });

  it("auto forward sends a short URL generated from a social candidate", async () => {
    const { forwardingService, forwarded, sentMessages } = makeService({
      routes: [makeRoute()],
      messages: [
        {
          id: "message-id",
          sessionId: "wa_xxx",
          groupJid: "source@g.us",
          text: "https://meli.la/social-original",
          links: ["https://meli.la/social-original"],
        },
      ],
      rewrittenText: "https://meli.la/generated-from-candidate",
      rewriteResults: [
        {
          originalUrl: "https://meli.la/social-original",
          rewrittenUrl: "https://meli.la/generated-from-candidate",
          marketplace: Marketplace.MERCADO_LIVRE,
          changed: true,
          canForward: true,
        },
      ],
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
    assert.equal(forwarded[0]?.status, "SENT");
    assert.equal(
      (sentMessages[0]?.content as { text?: string }).text,
      "https://meli.la/generated-from-candidate",
    );
  });

  it("auto forward sends a cached Mercado Livre conversion", async () => {
    const { forwardingService, sentMessages } = makeService({
      routes: [makeRoute()],
      messages: [
        {
          id: "message-id",
          sessionId: "wa_xxx",
          groupJid: "source@g.us",
          text: "https://meli.la/repeated",
          links: ["https://meli.la/repeated"],
        },
      ],
      rewrittenText: "https://meli.la/cached-affiliate",
      rewriteResults: [
        {
          originalUrl: "https://meli.la/repeated",
          rewrittenUrl: "https://meli.la/cached-affiliate",
          marketplace: Marketplace.MERCADO_LIVRE,
          changed: true,
          canForward: true,
          reason: "CACHE_HIT",
        },
      ],
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
    assert.equal(
      (sentMessages[0]?.content as { text?: string }).text,
      "https://meli.la/cached-affiliate",
    );
  });

  it("auto forward sends image with the short URL generated from the product", async () => {
    const { forwardingService, forwarded, sentMessages } = makeService({
      routes: [makeRoute()],
      messages: [
        {
          id: "message-id",
          sessionId: "wa_xxx",
          groupJid: "source@g.us",
          text: "Oferta https://meli.la/social-original",
          links: ["https://meli.la/social-original"],
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
      rewrittenText: "Oferta https://meli.la/generated-from-product",
      rewriteResults: [
        {
          originalUrl: "https://meli.la/social-original",
          rewrittenUrl: "https://meli.la/generated-from-product",
          marketplace: Marketplace.MERCADO_LIVRE,
          changed: true,
          canForward: true,
        },
      ],
    });
    (
      forwardingService as unknown as {
        waitRandomDelay: () => Promise<void>;
        downloadImage: () => Promise<Buffer>;
      }
    ).waitRandomDelay = async () => undefined;
    (
      forwardingService as unknown as {
        downloadImage: () => Promise<Buffer>;
      }
    ).downloadImage = async () => Buffer.from("image");

    const response = await forwardingService.forwardMessageById(
      "test-user",
      "message-id",
      { mode: "auto" },
    );

    assert.equal(response.sentCount, 1);
    assert.equal(forwarded[0]?.mediaForwarded, true);
    assert.deepEqual(sentMessages[0]?.content, {
      image: Buffer.from("image"),
      caption: "Oferta https://meli.la/generated-from-product",
    });
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
      rewrittenText: "https://meli.la/affiliate-real",
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
        caption: "https://meli.la/affiliate-real",
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
      rewrittenText: "https://meli.la/affiliate-real",
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
      "https://meli.la/affiliate-real",
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
      rewrittenText: "https://meli.la/affiliate-real",
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
        text: "https://meli.la/affiliate-real",
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

  it("auto forward blocks legacy Mercado Livre rewrites by default", async () => {
    delete process.env.MERCADO_LIVRE_LEGACY_FORWARD_ENABLED;
    const { forwardingService, sentMessages } = makeService({
      routes: [makeRoute()],
      messages: [
        {
          id: "message-id",
          sessionId: "wa_xxx",
          groupJid: "source@g.us",
          text: "https://meli.la/abc",
          links: ["https://meli.la/abc"],
        },
      ],
      rewrittenText: "https://meli.la/abc?aff_id=ml-aff",
      rewriteMode: "legacy",
      rewriteMarketplace: Marketplace.MERCADO_LIVRE,
      rewriteSameProduct: false,
      rewriteCanForward: false,
      rewriteReason: "MERCADO_LIVRE_LEGACY_NOT_VERIFIED",
    });

    const response = await forwardingService.forwardMessageById(
      "test-user",
      "message-id",
      { mode: "auto" },
    );

    assert.equal(response.sentCount, 0);
    assert.equal(response.skippedCount, 1);
    assert.equal(response.results[0]?.error, "MERCADO_LIVRE_GENERATION_FAILED");
    assert.deepEqual(sentMessages, []);
  });

  it("auto forward blocks legacy rewrites even when the old flag is enabled", async () => {
    process.env.MERCADO_LIVRE_LEGACY_FORWARD_ENABLED = "true";
    const { forwardingService, sentMessages } = makeService({
      routes: [makeRoute()],
      messages: [
        {
          id: "message-id",
          sessionId: "wa_xxx",
          groupJid: "source@g.us",
          text: "https://meli.la/abc",
          links: ["https://meli.la/abc"],
        },
      ],
      rewrittenText: "https://meli.la/abc?aff_id=ml-aff",
      rewriteMode: "legacy",
      rewriteMarketplace: Marketplace.MERCADO_LIVRE,
      rewriteSameProduct: false,
      rewriteCanForward: false,
      rewriteReason: "MERCADO_LIVRE_LEGACY_NOT_VERIFIED",
    });
    (
      forwardingService as unknown as {
        waitRandomDelay: () => Promise<void>;
      }
    ).waitRandomDelay = async () => undefined;

    try {
      const response = await forwardingService.forwardMessageById(
        "test-user",
        "message-id",
        { mode: "auto" },
      );

      assert.equal(response.sentCount, 0);
      assert.equal(response.skippedCount, 1);
      assert.equal(sentMessages.length, 0);
    } finally {
      delete process.env.MERCADO_LIVRE_LEGACY_FORWARD_ENABLED;
    }
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
