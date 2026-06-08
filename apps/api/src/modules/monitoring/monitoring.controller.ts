import { Controller, Get, Req, UseGuards } from "@nestjs/common";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { MonitoringService } from "./monitoring.service";

@Controller("monitoring")
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Get("health")
  health() {
    return this.monitoringService.health();
  }

  @UseGuards(JwtAuthGuard)
  @Get("stats")
  stats(@Req() req: AuthenticatedRequest) {
    return this.monitoringService.stats(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get("forward-errors")
  forwardErrors(@Req() req: AuthenticatedRequest) {
    return this.monitoringService.forwardErrors(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get("recent-activity")
  recentActivity(@Req() req: AuthenticatedRequest) {
    return this.monitoringService.recentActivity(req.user.id);
  }
}
