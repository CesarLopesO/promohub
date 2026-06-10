export function readCorsOrigins(
  value: string | undefined,
  nodeEnv = process.env.NODE_ENV,
): string[] {
  const configured = (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origins =
    configured.length > 0
      ? configured
      : ["http://localhost:3000", "http://localhost:3002"];

  if (nodeEnv === "production" && origins.includes("*")) {
    throw new Error("CORS_ORIGIN cannot contain '*' in production.");
  }

  return origins;
}

export function createCorsOriginValidator(origins: string[]) {
  const allowed = new Set(origins);

  return (
    origin: string | undefined,
    callback: (error: Error | null, allowed?: boolean) => void,
  ) => {
    if (!origin || allowed.has(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Origin not allowed by CORS."));
  };
}
