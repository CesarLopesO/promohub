import { Module } from "@nestjs/common";

import { PrismaService } from "../../prisma.service";
import { WorkerLeaseService } from "./worker-lease.service";
import { WorkerNodesService } from "./worker-nodes.service";

@Module({
  providers: [PrismaService, WorkerNodesService, WorkerLeaseService],
  exports: [WorkerNodesService, WorkerLeaseService],
})
export class WorkerNodesModule {}
