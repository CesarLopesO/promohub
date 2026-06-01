import type { WAMessage, WAMessageContent } from "@whiskeysockets/baileys";
import { normalizeMessageContent } from "@whiskeysockets/baileys";

type SupportedMessageType =
  | "text"
  | "image"
  | "video"
  | "document"
  | "audio"
  | "sticker"
  | "unknown";

const LINK_PATTERN =
  /(?:https?:\/\/[^\s<>"']+|(?:amzn\.to\/|www\.amazon\.|amazon\.|meli\.la\/|mercadolivre\.com|mercadolivre\.|shope\.ee\/|shopee\.)[^\s<>"']*)/gi;

const TRAILING_PUNCTUATION_PATTERN = /[.,)\]!]+$/;

export function extractMessageText(message: WAMessage): string | undefined {
  const content = getNormalizedContent(message);

  return (
    content?.conversation ??
    content?.extendedTextMessage?.text ??
    content?.imageMessage?.caption ??
    content?.videoMessage?.caption ??
    undefined
  );
}

export function extractLinks(text?: string | null): string[] {
  if (!text?.trim()) {
    return [];
  }

  const links: string[] = [];
  const seen = new Set<string>();
  const matches = text.matchAll(LINK_PATTERN);

  for (const match of matches) {
    const link = normalizeLink(match[0]);

    if (!link || seen.has(link)) {
      continue;
    }

    seen.add(link);
    links.push(link);
  }

  return links;
}

export function getMessageType(message: WAMessage): SupportedMessageType {
  const content = getNormalizedContent(message);

  if (!content) {
    return "unknown";
  }

  if (content.conversation || content.extendedTextMessage) {
    return "text";
  }

  if (content.imageMessage) {
    return "image";
  }

  if (content.videoMessage) {
    return "video";
  }

  if (content.documentMessage) {
    return "document";
  }

  if (content.audioMessage) {
    return "audio";
  }

  if (content.stickerMessage) {
    return "sticker";
  }

  return "unknown";
}

export function messageHasMedia(messageType: SupportedMessageType): boolean {
  return ["image", "video", "document", "audio", "sticker"].includes(
    messageType,
  );
}

export function isReactionMessage(message: WAMessage): boolean {
  return Boolean(getNormalizedContent(message)?.reactionMessage);
}

function getNormalizedContent(message: WAMessage): WAMessageContent | undefined {
  return normalizeMessageContent(message.message);
}

function normalizeLink(value: string): string {
  const trimmed = value.trim().replace(TRAILING_PUNCTUATION_PATTERN, "");

  if (!trimmed) {
    return "";
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}
