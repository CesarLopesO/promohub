const WHATSAPP_LINK_PATTERN =
  /(?:https?:\/\/)?(?:chat\.whatsapp\.com\/[^\s<]+|(?:www\.)?whatsapp\.com\/channel\/[^\s<]+|wa\.me\/[^\s<]+|api\.whatsapp\.com\/[^\s<]+)|whatsapp:\/\/[^\s<]+/gi;

const TRAILING_PUNCTUATION = /[),.!?:;\]}]+$/;

export function detectWhatsAppInviteLinks(text: string): string[] {
  if (!text) {
    return [];
  }

  return [...text.matchAll(WHATSAPP_LINK_PATTERN)]
    .map((match) => trimTrailingPunctuation(match[0]))
    .filter(Boolean);
}

export function replaceWhatsAppLinks(
  text: string,
  replacementInviteUrl?: string | null,
): {
  text: string;
  links: string[];
  changed: boolean;
  warning?: "WHATSAPP_INVITE_REPLACEMENT_NOT_CONFIGURED";
} {
  const links = detectWhatsAppInviteLinks(text);

  if (links.length === 0) {
    return { text, links, changed: false };
  }

  const replacement = replacementInviteUrl?.trim();
  if (!replacement) {
    return {
      text,
      links,
      changed: false,
      warning: "WHATSAPP_INVITE_REPLACEMENT_NOT_CONFIGURED",
    };
  }

  return {
    text: text.replace(WHATSAPP_LINK_PATTERN, (raw) => {
      const link = trimTrailingPunctuation(raw);
      return `${replacement}${raw.slice(link.length)}`;
    }),
    links,
    changed: true,
  };
}

function trimTrailingPunctuation(value: string): string {
  return value.replace(TRAILING_PUNCTUATION, "");
}
