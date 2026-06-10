import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";

import { AppModule } from "./app.module";
import {
  createCorsOriginValidator,
  readCorsOrigins,
} from "./common/security/cors";
import { installConsoleRedaction } from "./common/security/log-redaction";

async function bootstrap() {
  installConsoleRedaction();
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const port = configService.get<number>("API_PORT", 3001);
  const corsOrigins = readCorsOrigins(
    configService.get<string>("CORS_ORIGIN"),
    configService.get<string>("NODE_ENV"),
  );

  app.enableShutdownHooks();
  app.getHttpAdapter().getInstance().set("trust proxy", 1);
  app.enableCors({
    origin: createCorsOriginValidator(corsOrigins),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  await app.listen(port);
}

void bootstrap();
