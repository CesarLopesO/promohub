import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";

import { PrismaService } from "../../prisma.service";
import type { AuthenticatedUser } from "./auth.types";

export type RegisterDto = {
  email: string;
  password: string;
  name?: string;
};

export type LoginDto = {
  email: string;
  password: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(body: RegisterDto): Promise<{ id: string; email: string }> {
    const email = this.normalizeEmail(body.email);
    const password = this.normalizePassword(body.password);
    const passwordHash = await bcrypt.hash(password, 12);

    try {
      const user = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          name: body.name?.trim() || undefined,
        },
        select: {
          id: true,
          email: true,
        },
      });

      return user;
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        throw new ConflictException("Email already registered.");
      }

      throw error;
    }
  }

  async login(body: LoginDto): Promise<{ accessToken: string }> {
    const email = this.normalizeEmail(body.email);
    const password = this.normalizePassword(body.password);
    const user = await this.prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException("Invalid credentials.");
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException("Invalid credentials.");
    }

    return {
      accessToken: await this.jwtService.signAsync({
        sub: user.id,
        email: user.email,
        role: user.role,
        plan: user.plan,
        subscriptionStatus: user.subscriptionStatus,
      }),
    };
  }

  async me(userId: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
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

  private normalizeEmail(value: string): string {
    if (!value || typeof value !== "string" || !value.trim()) {
      throw new UnauthorizedException("Email is required.");
    }

    return value.trim().toLowerCase();
  }

  private normalizePassword(value: string): string {
    if (!value || typeof value !== "string" || !value.trim()) {
      throw new UnauthorizedException("Password is required.");
    }

    return value;
  }
}
