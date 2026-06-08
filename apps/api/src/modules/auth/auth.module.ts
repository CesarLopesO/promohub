import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import type { SignOptions } from "jsonwebtoken";

import { PrismaService } from "../../prisma.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AdminGuard } from "./admin.guard";
import { JwtAuthGuard } from "./jwt.guard";
import { JwtStrategy } from "./jwt.strategy";

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const expiresIn = configService.get<string>(
          "JWT_EXPIRES_IN",
          "7d",
        ) as SignOptions["expiresIn"];

        return {
          secret: configService.get<string>("JWT_SECRET", "dev-secret"),
          signOptions: {
            expiresIn,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [PrismaService, AuthService, JwtStrategy, JwtAuthGuard, AdminGuard],
  exports: [JwtAuthGuard, AdminGuard, AuthService],
})
export class AuthModule {}
