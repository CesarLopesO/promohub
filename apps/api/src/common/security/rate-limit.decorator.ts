import { SetMetadata } from "@nestjs/common";

export const RATE_LIMIT_METADATA = "peppabot:rate-limit";

export type RateLimitKey = "ip" | "ip-email" | "user";

export type RateLimitPolicy = {
  name: string;
  limit: number;
  windowMs: number;
  key: RateLimitKey;
};

export const RateLimit = (policy: RateLimitPolicy) =>
  SetMetadata(RATE_LIMIT_METADATA, policy);
