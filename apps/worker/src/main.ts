import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { WorkerModule } from "./worker.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ["error", "warn"],
  });

  app.enableShutdownHooks();
}

void bootstrap();
