import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export function encryptSecret(value: string): string {
  if (!value) {
    return value;
  }

  if (isEncryptedSecret(value)) {
    return value;
  }

  const key = readEncryptionKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, {
    authTagLength: AUTH_TAG_BYTES,
  });
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${PREFIX}${Buffer.concat([iv, tag, encrypted]).toString("base64")}`;
}

export function decryptSecret(value: string): string {
  if (!isEncryptedSecret(value)) {
    return value;
  }

  const key = readEncryptionKey();
  const payload = Buffer.from(value.slice(PREFIX.length), "base64");

  if (payload.length <= IV_BYTES + AUTH_TAG_BYTES) {
    throw new Error("Invalid encrypted secret payload.");
  }

  const iv = payload.subarray(0, IV_BYTES);
  const tag = payload.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
  const encrypted = payload.subarray(IV_BYTES + AUTH_TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv, {
    authTagLength: AUTH_TAG_BYTES,
  });

  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");
}

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(PREFIX);
}

function readEncryptionKey(): Buffer {
  const rawKey = process.env.APP_ENCRYPTION_KEY;

  if (!rawKey) {
    throw new Error(
      "APP_ENCRYPTION_KEY is required to save or read encrypted secrets. Generate one with: npm run crypto:generate-key -w @promohub/api",
    );
  }

  const key = Buffer.from(rawKey, "base64");

  if (key.length !== 32) {
    throw new Error("APP_ENCRYPTION_KEY must be a 32-byte base64 value.");
  }

  return key;
}
