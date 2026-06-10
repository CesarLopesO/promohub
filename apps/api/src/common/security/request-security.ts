import type { Request } from "express";

export function readClientIp(request: Request): string | undefined {
  const forwarded = request.headers["x-forwarded-for"];
  const firstForwarded = Array.isArray(forwarded)
    ? forwarded[0]
    : forwarded?.split(",")[0];

  return firstForwarded?.trim() || request.ip || request.socket.remoteAddress;
}

const SENSITIVE_KEYS = new Set([
  "access_token",
  "accesstoken",
  "apikey",
  "api_key",
  "apisecret",
  "api_secret",
  "app_encryption_key",
  "asaas_api_key",
  "authorization",
  "cpfcnpj",
  "cpfcnpjhash",
  "jwt_secret",
  "password",
  "passwordhash",
  "secret",
  "sessiontoken",
  "ssid",
  "token",
]);

export function sanitizeSecurityMetadata(value: unknown): unknown {
  if (typeof value === "string") {
    let sanitized = value;
    for (const key of [
      "ASAAS_API_KEY",
      "JWT_SECRET",
      "APP_ENCRYPTION_KEY",
      "ASAAS_WEBHOOK_TOKEN",
    ]) {
      const secret = process.env[key];
      if (secret) {
        sanitized = sanitized.split(secret).join("[REDACTED]");
      }
    }

    return sanitized.replace(
      /([?&](?:access_token|api_key|token|ssid|sessionToken)=)[^&\s]*/gi,
      "$1[REDACTED]",
    );
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeSecurityMetadata);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SENSITIVE_KEYS.has(key.toLowerCase())
        ? "[REDACTED]"
        : sanitizeSecurityMetadata(item),
    ]),
  );
}
