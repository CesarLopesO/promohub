import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";

import type { AuthenticatedUser } from "../../modules/auth/auth.types";
import { readClientIp } from "./request-security";
import {
  RATE_LIMIT_METADATA,
  type RateLimitPolicy,
} from "./rate-limit.decorator";
import { RateLimitService } from "./rate-limit.service";

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limits: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<RateLimitPolicy>(
      RATE_LIMIT_METADATA,
      [context.getHandler(), context.getClass()],
    );

    if (!policy || !this.limits.enabled()) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const identity = this.readIdentity(request, policy);
    const count = await this.limits.increment(
      `rate-limit:${policy.name}:${identity}`,
      policy.windowMs,
    );

    if (count > policy.limit) {
      throw new HttpException(
        {
          code: "RATE_LIMITED",
          message: "Muitas tentativas. Tente novamente em instantes.",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private readIdentity(
    request: Request & { user?: AuthenticatedUser },
    policy: RateLimitPolicy,
  ): string {
    if (policy.key === "user") {
      return request.user?.id ?? readClientIp(request) ?? "unknown";
    }

    const ip = readClientIp(request) ?? "unknown";
    if (policy.key === "ip-email") {
      const body = request.body as { email?: unknown } | undefined;
      const email =
        typeof body?.email === "string"
          ? body.email.trim().toLowerCase()
          : "unknown";
      return `${ip}:${email}`;
    }

    return ip;
  }
}
