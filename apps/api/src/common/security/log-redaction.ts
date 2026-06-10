import { sanitizeSecurityMetadata } from "./request-security";

const SECRET_ENV_KEYS = [
  "ASAAS_API_KEY",
  "JWT_SECRET",
  "APP_ENCRYPTION_KEY",
  "ASAAS_WEBHOOK_TOKEN",
];

export function redactLogValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return sanitizeSecurityMetadata(value);
  }

  let sanitized = value;
  for (const key of SECRET_ENV_KEYS) {
    const secret = process.env[key];
    if (secret) {
      sanitized = sanitized.split(secret).join("[REDACTED]");
    }
  }

  return sanitized
    .replace(
      /((?:ssid|sessionToken|access_token|authorization)["'=:\s]+)([^"',\s}]+)/gi,
      "$1[REDACTED]",
    )
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "***.***.***-**")
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "**.***.***/****-**");
}

export function installConsoleRedaction(): void {
  for (const method of ["log", "warn", "error", "debug"] as const) {
    const original = console[method].bind(console);
    console[method] = (...values: unknown[]) => {
      original(...values.map(redactLogValue));
    };
  }
}
