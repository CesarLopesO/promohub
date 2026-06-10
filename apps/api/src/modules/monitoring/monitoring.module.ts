import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { WorkerNodesModule } from "../workers/worker-nodes.module";
import { PrismaService } from "../../prisma.service";
import { MonitoringController } from "./monitoring.controller";
import { MonitoringService } from "./monitoring.service";

@Module({
  imports: [AuthModule, WorkerNodesModule],
  controllers: [MonitoringController],
  providers: [PrismaService, MonitoringService],
})
export class MonitoringModule {}
