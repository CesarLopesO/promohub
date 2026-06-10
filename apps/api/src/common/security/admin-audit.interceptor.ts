import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import type { Request } from "express";
import type { Observable } from "rxjs";
import { catchError, concatMap, from, map, of } from "rxjs";

import type { AuthenticatedUser } from "../../modules/auth/auth.types";
import { AdminAuditService } from "./admin-audit.service";
import { readClientIp, sanitizeSecurityMetadata } from "./request-security";

const MUTATING_METHODS = new Set(["DELETE", "PATCH", "POST", "PUT"]);

@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AdminAuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const path = request.path || request.url.split("?")[0] || "";

    if (
      !request.user ||
      request.user.role !== "ADMIN" ||
      !MUTATING_METHODS.has(request.method) ||
      !path.startsWith("/admin")
    ) {
      return next.handle();
    }

    const routePath =
      (
        request.route as
          | { path?: string | RegExp | Array<string | RegExp> }
          | undefined
      )?.path?.toString() ?? path;
    const targetType = this.readTargetType(path);
    const targetId =
      typeof request.params?.id === "string"
        ? request.params.id
        : typeof request.params?.marketplace === "string"
          ? request.params.marketplace
          : undefined;
    const metadata = sanitizeSecurityMetadata({
      route: routePath,
      body: request.body,
    });

    return next.handle().pipe(
      concatMap((value) =>
        from(
          this.audit.record({
            adminUserId: request.user!.id,
            action: `${request.method} ${path}`,
            targetType,
            targetId,
            metadata,
            ipAddress: readClientIp(request),
            userAgent: request.get("user-agent") || undefined,
          }),
        ).pipe(
          map(() => value),
          catchError(() => of(value)),
        ),
      ),
    );
  }

  private readTargetType(path: string): string {
    const segment = path.split("/").filter(Boolean)[1];
    return segment || "admin";
  }
}
