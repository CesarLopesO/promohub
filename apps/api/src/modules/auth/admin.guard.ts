import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";

import type { AuthenticatedRequest } from "./auth.types";

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (request.user.role !== "ADMIN") {
      throw new ForbiddenException("Admin access required.");
    }

    return true;
  }
}
