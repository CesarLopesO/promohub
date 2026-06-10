import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from "@nestjs/common";

import { AdminGuard } from "../auth/admin.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { ReferralsService } from "./referrals.service";

@UseGuards(JwtAuthGuard)
@Controller("referrals")
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get("me")
  dashboard(@Req() req: AuthenticatedRequest) {
    return this.referrals.getDashboard(req.user.id);
  }
}

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin/referrals")
export class AdminReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get()
  list() {
    return this.referrals.listAdmin();
  }

  @Patch(":id/paid")
  markPaid(@Param("id") id: string, @Body() body: { notes?: unknown }) {
    return this.referrals.markPaid(id, body.notes);
  }

  @Patch(":id/rejected")
  reject(@Param("id") id: string, @Body() body: { notes?: unknown }) {
    return this.referrals.reject(id, body.notes);
  }
}
