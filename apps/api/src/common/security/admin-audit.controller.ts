import { Controller, Get, UseGuards } from "@nestjs/common";

import { AdminGuard } from "../../modules/auth/admin.guard";
import { JwtAuthGuard } from "../../modules/auth/jwt.guard";
import { AdminAuditService } from "./admin-audit.service";

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin/audit-logs")
export class AdminAuditController {
  constructor(private readonly audit: AdminAuditService) {}

  @Get()
  list() {
    return this.audit.list();
  }
}
