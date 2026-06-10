import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";

import { AdminGuard } from "../auth/admin.guard";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { PlanLimitsService } from "../plans/plan-limits.service";
import { UpsertAffiliateGeneratorConfigDto } from "../affiliate/dto/upsert-affiliate-generator-config.dto";
import { AffiliateGeneratorConfigService } from "../affiliate/services/affiliate-generator-config.service";
import { WorkerNodesService } from "../workers/worker-nodes.service";
import { AdminService } from "./admin.service";

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin")
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly planLimits: PlanLimitsService,
    private readonly generatorConfigs: AffiliateGeneratorConfigService,
    private readonly workers: WorkerNodesService,
  ) {}

  @Get("affiliate-generator-configs")
  affiliateGeneratorConfigs() {
    return this.generatorConfigs.list();
  }

  @Get("affiliate-generator-configs/:marketplace")
  affiliateGeneratorConfig(@Param("marketplace") marketplace: string) {
    return this.generatorConfigs.findByMarketplace(marketplace);
  }

  @Put("affiliate-generator-configs/:marketplace")
  upsertAffiliateGeneratorConfig(
    @Param("marketplace") marketplace: string,
    @Body() body: UpsertAffiliateGeneratorConfigDto,
  ) {
    return this.generatorConfigs.upsert(marketplace, body);
  }

  @Get("overview")
  overview() {
    return this.adminService.overview();
  }

  @Get("users")
  users(
    @Query("search") search?: string,
    @Query("plan") plan?: string,
    @Query("subscriptionStatus") subscriptionStatus?: string,
  ) {
    return this.adminService.users({ search, plan, subscriptionStatus });
  }

  @Get("users/:id")
  user(@Param("id") id: string) {
    return this.adminService.user(id);
  }

  @Get("users/:id/usage")
  usage(@Param("id") id: string) {
    return this.planLimits.getUsage(id);
  }

  @Patch("users/:id")
  updateUser(@Param("id") id: string, @Body() body: object) {
    return this.adminService.updateUser(id, body);
  }

  @Post("users/:id/pause")
  pauseUser(@Param("id") id: string) {
    return this.adminService.pauseUser(id);
  }

  @Post("users/:id/resume")
  resumeUser(@Param("id") id: string) {
    return this.adminService.resumeUser(id);
  }

  @Get("forwards")
  forwards(
    @Query("userId") userId?: string,
    @Query("status") status?: string,
    @Query("mode") mode?: string,
  ) {
    return this.adminService.forwards({ userId, status, mode });
  }

  @Get("errors")
  errors() {
    return this.adminService.errors();
  }

  @Get("sessions")
  sessions() {
    return this.adminService.sessions();
  }

  @Get("workers")
  workersList() {
    return this.workers.listWorkers();
  }
}
