import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { WhatsAppCommandProcessorService } from "./queues/whatsapp-command-processor.service";
import { WorkerHeartbeatService } from "./workers/worker-heartbeat.service";
import { WorkerNodeService } from "./workers/worker-node.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["apps/worker/.env", ".env"],
    }),
  ],
  providers: [
    WorkerNodeService,
    WorkerHeartbeatService,
    WhatsAppCommandProcessorService,
  ],
})
export class WorkerModule {}
