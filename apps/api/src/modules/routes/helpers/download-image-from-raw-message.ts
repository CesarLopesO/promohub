import type { Prisma } from "@prisma/client";
import {
  downloadMediaMessage,
  type WAMessage,
  type WASocket,
} from "@whiskeysockets/baileys";

export async function downloadImageFromRawMessage(
  rawMessage: Prisma.JsonValue | null,
  sock: WASocket,
): Promise<Buffer> {
  if (!rawMessage || typeof rawMessage !== "object") {
    throw new Error("Missing raw message.");
  }

  const message = reviveBuffers(rawMessage) as WAMessage;

  return downloadMediaMessage(message, "buffer", {}, {
    reuploadRequest: sock.updateMediaMessage,
    logger: sock.logger,
  });
}

function reviveBuffers(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => reviveBuffers(item));
  }

  if (isSerializedBuffer(value)) {
    return Buffer.from(value.data);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, reviveBuffers(entry)]),
    );
  }

  return value;
}

function isSerializedBuffer(value: unknown): value is {
  type: "Buffer";
  data: number[];
} {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (value as { type?: unknown }).type === "Buffer" &&
    Array.isArray((value as { data?: unknown }).data)
  );
}
