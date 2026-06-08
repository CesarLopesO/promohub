import type { AffiliateCredential, Prisma } from "@prisma/client";

import { decryptSecret, encryptSecret } from "../../common/crypto/secret-crypto";

const SESSION_TOKEN_KEYS = ["sessionToken", "ssid", "mlSessionToken"];

export function encryptCredentialSecrets(input: {
  apiKey?: string | null;
  apiSecret?: string | null;
  metadata?: Prisma.InputJsonValue;
}): {
  apiKey?: string | null;
  apiSecret?: string | null;
  metadata?: Prisma.InputJsonValue;
} {
  return {
    ...(input.apiKey === undefined
      ? {}
      : { apiKey: input.apiKey ? encryptSecret(input.apiKey) : input.apiKey }),
    ...(input.apiSecret === undefined
      ? {}
      : {
          apiSecret: input.apiSecret
            ? encryptSecret(input.apiSecret)
            : input.apiSecret,
        }),
    ...(input.metadata === undefined
      ? {}
      : { metadata: encryptMetadataSecrets(input.metadata) }),
  };
}

export function decryptAffiliateCredential(
  credential: AffiliateCredential,
): AffiliateCredential {
  return {
    ...credential,
    apiKey: credential.apiKey ? decryptSecret(credential.apiKey) : null,
    apiSecret: credential.apiSecret ? decryptSecret(credential.apiSecret) : null,
    metadata: decryptMetadataSecrets(credential.metadata),
  };
}

export function hasSessionToken(metadata: Prisma.JsonValue | null): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }

  return SESSION_TOKEN_KEYS.some((key) => {
    const value = metadata[key as keyof typeof metadata];

    return typeof value === "string" && value.trim().length > 0;
  });
}

function encryptMetadataSecrets(
  metadata: Prisma.InputJsonValue | undefined,
): Prisma.InputJsonValue | undefined {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return metadata;
  }

  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      SESSION_TOKEN_KEYS.includes(key) && typeof value === "string" && value
        ? encryptSecret(value)
        : value,
    ]),
  ) as Prisma.InputJsonObject;
}

function decryptMetadataSecrets(
  metadata: Prisma.JsonValue | null,
): Prisma.JsonValue | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return metadata;
  }

  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      SESSION_TOKEN_KEYS.includes(key) && typeof value === "string" && value
        ? decryptSecret(value)
        : value,
    ]),
  ) as Prisma.JsonObject;
}
