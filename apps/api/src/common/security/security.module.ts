import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";

import { PrismaService } from "../../prisma.service";
import { AdminAuditInterceptor } from "./admin-audit.interceptor";
import { AdminAuditService } from "./admin-audit.service";
import { RateLimitGuard } from "./rate-limit.guard";
import { RateLimitService } from "./rate-limit.service";

@Global()
@Module({
  providers: [
    PrismaService,
    AdminAuditService,
    RateLimitGuard,
    RateLimitService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AdminAuditInterceptor,
    },
  ],
  exports: [AdminAuditService, RateLimitGuard, RateLimitService],
})
export class SecurityModule {}
