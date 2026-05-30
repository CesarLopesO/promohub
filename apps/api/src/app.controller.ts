import { Controller, Get } from "@nestjs/common";
import type { HealthStatus } from "@promohub/types";

@Controller()
export class AppController {
  @Get("health")
  health(): HealthStatus {
    return {
      status: "ok",
      service: "promohub-api",
      timestamp: new Date().toISOString()
    };
  }
}
