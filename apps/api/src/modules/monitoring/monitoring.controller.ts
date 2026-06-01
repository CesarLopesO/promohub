import { Controller, Get, Query } from "@nestjs/common";

import { MonitoringService } from "./monitoring.service";

@Controller("monitoring")
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Get("health")
  health() {
    return this.monitoringService.health();
  }

  @Get("stats")
  stats(@Query("userId") userId?: string) {
    return this.monitoringService.stats(userId);
  }

  @Get("forward-errors")
  forwardErrors(@Query("userId") userId?: string) {
    return this.monitoringService.forwardErrors(userId);
  }

  @Get("recent-activity")
  recentActivity(@Query("userId") userId?: string) {
    return this.monitoringService.recentActivity(userId);
  }
}
