import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";

import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const port = configService.get<number>("API_PORT", 3001);

  app.enableCors({
    origin: configService.get<string>("WEB_URL", "http://localhost:3000")
  });

  await app.listen(port);
}

void bootstrap();
