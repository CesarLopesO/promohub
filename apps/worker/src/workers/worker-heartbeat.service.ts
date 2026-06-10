import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";

import { WorkerNodeService } from "./worker-node.service";

@Injectable()
export class WorkerHeartbeatService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private heartbeatTimer?: NodeJS.Timeout;

  constructor(private readonly workerNode: WorkerNodeService) {}

  async onApplicationBootstrap(): Promise<void> {
    const worker = await this.workerNode.register();
    console.log(`[WORKER] started name=${worker.name}`);

    this.heartbeatTimer = setInterval(() => {
      void this.sendHeartbeat();
    }, this.workerNode.heartbeatIntervalMs());
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }

    const workerName = this.workerNode.getCurrentWorker()?.name;
    await this.workerNode.stop().catch(() => undefined);
    console.log(`[WORKER] stopped${workerName ? ` name=${workerName}` : ""}`);
  }

  private async sendHeartbeat(): Promise<void> {
    try {
      const worker = await this.workerNode.heartbeat();
      console.log(`[WORKER] heartbeat name=${worker.name}`);
    } catch (error) {
      console.error(
        `[WORKER] heartbeat_failed error=${error instanceof Error ? error.name : "UnknownError"}`,
      );
    }
  }
}
