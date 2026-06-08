import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

import { PrismaService } from "../../prisma.service";
import type { AuthenticatedUser } from "./auth.types";

type JwtPayload = {
  sub: string;
  email: string;
  role?: string;
  plan?: string;
  subscriptionStatus?: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>("JWT_SECRET", "dev-secret"),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: {
        id: payload.sub,
      },
      select: {
        id: true,
        email: true,
        role: true,
        plan: true,
        subscriptionStatus: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException("Invalid token.");
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      plan: user.plan,
      subscriptionStatus: user.subscriptionStatus,
    };
  }
}
