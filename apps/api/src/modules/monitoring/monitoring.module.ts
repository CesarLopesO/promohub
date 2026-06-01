import { Module } from "@nestjs/common";

import { PrismaService } from "../../prisma.service";
import { MonitoringController } from "./monitoring.controller";
import { MonitoringService } from "./monitoring.service";

@Module({
  controllers: [MonitoringController],
  providers: [PrismaService, MonitoringService],
})
export class MonitoringModule {}
