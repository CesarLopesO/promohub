import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { Plan, SubscriptionStatus } from "@prisma/client";
import * as bcrypt from "bcrypt";

import { PrismaService } from "../../prisma.service";
import { readReferralRewardCents } from "../referrals/referral.constants";
import type { AuthenticatedUser } from "./auth.types";

export type RegisterDto = {
  email: string;
  password: string;
  name?: string;
  ref?: string;
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
    private readonly config: ConfigService,
  ) {}

  async register(body: RegisterDto): Promise<{ id: string; email: string }> {
    const email = this.normalizeEmail(body.email);
    const password = this.normalizePassword(body.password);
    const passwordHash = await bcrypt.hash(password, 12);
    const referralCode = body.ref?.trim();

    try {
      const codeOwner = referralCode
        ? await this.prisma.referralCode.findUnique({
            where: { code: referralCode },
            select: {
              userId: true,
              user: {
                select: { email: true },
              },
            },
          })
        : null;
      const referrerUserId =
        codeOwner && codeOwner.user.email.toLowerCase() !== email
          ? codeOwner.userId
          : undefined;

      return await this.prisma.$transaction(async (transaction) => {
        const user = await transaction.user.create({
          data: {
            email,
            passwordHash,
            name: body.name?.trim() || undefined,
            referredByUserId: referrerUserId,
          },
          select: {
            id: true,
            email: true,
          },
        });

        if (referrerUserId && referrerUserId !== user.id) {
          await transaction.referral.create({
            data: {
              referrerUserId,
              referredUserId: user.id,
              status: "PENDING_PAYMENT",
              rewardCents: readReferralRewardCents(this.config),
            },
          });
        }

        return user;
      });
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
    await this.expireCanceledSubscription(userId);
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

  private async expireCanceledSubscription(userId: string): Promise<void> {
    const now = new Date();
    const subscription = await this.prisma.billingSubscription.findFirst({
      where: {
        userId,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: { lte: now },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!subscription) {
      return;
    }

    await this.prisma.$transaction([
      this.prisma.billingSubscription.update({
        where: { id: subscription.id },
        data: {
          status: SubscriptionStatus.CANCELED,
          cancelAtPeriodEnd: false,
          canceledAt: subscription.canceledAt ?? now,
        },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          plan: Plan.FREE,
          subscriptionStatus: SubscriptionStatus.CANCELED,
        },
      }),
    ]);
  }
}
