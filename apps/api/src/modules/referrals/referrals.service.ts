import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { ReferralStatus, SubscriptionStatus } from "@prisma/client";

import { PrismaService } from "../../prisma.service";
import {
  readReferralEligibilityDays,
  readReferralRewardCents,
} from "./referral.constants";

const CODE_RETRY_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ReferralsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getDashboard(userId: string) {
    const code = await this.getOrCreateCode(userId);
    const [totalReferred, totalEligible, totalPaid, eligibleBalance] =
      await Promise.all([
        this.prisma.referral.count({ where: { referrerUserId: userId } }),
        this.prisma.referral.count({
          where: {
            referrerUserId: userId,
            status: ReferralStatus.ELIGIBLE,
          },
        }),
        this.prisma.referral.count({
          where: {
            referrerUserId: userId,
            status: ReferralStatus.PAID,
          },
        }),
        this.prisma.referral.aggregate({
          where: {
            referrerUserId: userId,
            status: ReferralStatus.ELIGIBLE,
          },
          _sum: { rewardCents: true },
        }),
      ]);

    return {
      code: code.code,
      rewardCents: readReferralRewardCents(this.config),
      totalReferred,
      totalEligible,
      totalPaid,
      eligibleBalanceCents: eligibleBalance._sum.rewardCents ?? 0,
    };
  }

  async confirmPayment(referredUserId: string, confirmedAt = new Date()) {
    const referral = await this.prisma.referral.findUnique({
      where: { referredUserId },
      select: {
        id: true,
        status: true,
        paymentConfirmedAt: true,
      },
    });

    if (
      !referral ||
      referral.status === ReferralStatus.ELIGIBLE ||
      referral.status === ReferralStatus.PAID ||
      referral.paymentConfirmedAt
    ) {
      return referral;
    }

    return this.prisma.referral.update({
      where: { id: referral.id },
      data: {
        status: ReferralStatus.PENDING_WAITING_PERIOD,
        paymentConfirmedAt: confirmedAt,
        eligibleAt: new Date(
          confirmedAt.getTime() +
            readReferralEligibilityDays(this.config) * DAY_MS,
        ),
      },
    });
  }

  async processEligible(now = new Date()): Promise<number> {
    const candidates = await this.prisma.referral.findMany({
      where: {
        status: ReferralStatus.PENDING_WAITING_PERIOD,
        eligibleAt: { lte: now },
      },
      select: {
        id: true,
        referrerUserId: true,
        referredUserId: true,
        paymentConfirmedAt: true,
        eligibleAt: true,
        referred: {
          select: {
            referredByUserId: true,
            cpfCnpjHash: true,
            isActive: true,
            subscriptionStatus: true,
          },
        },
      },
    });
    const hashesInBatch = new Map<string, number>();

    for (const candidate of candidates) {
      const hash = candidate.referred.cpfCnpjHash;

      if (hash) {
        hashesInBatch.set(hash, (hashesInBatch.get(hash) ?? 0) + 1);
      }
    }

    let processed = 0;

    for (const candidate of candidates) {
      if (
        !candidate.referred.isActive ||
        candidate.referred.subscriptionStatus !== SubscriptionStatus.ACTIVE
      ) {
        continue;
      }

      const reason = await this.readAntifraudReason(candidate, hashesInBatch);

      await this.prisma.referral.update({
        where: { id: candidate.id },
        data: reason
          ? {
              status: ReferralStatus.NEEDS_REVIEW,
              antifraudReason: reason,
            }
          : {
              status: ReferralStatus.ELIGIBLE,
              antifraudReason: null,
            },
      });
      processed += 1;
    }

    return processed;
  }

  async resetWaitingPeriod(referredUserId: string): Promise<number> {
    const result = await this.prisma.referral.updateMany({
      where: {
        referredUserId,
        status: ReferralStatus.PENDING_WAITING_PERIOD,
      },
      data: {
        status: ReferralStatus.PENDING_PAYMENT,
        paymentConfirmedAt: null,
        eligibleAt: null,
      },
    });

    return result.count;
  }

  async listAdmin() {
    const referrals = await this.prisma.referral.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        rewardCents: true,
        createdAt: true,
        paymentConfirmedAt: true,
        eligibleAt: true,
        paidAt: true,
        notes: true,
        antifraudReason: true,
        referrer: {
          select: { id: true, email: true, name: true },
        },
        referred: {
          select: {
            id: true,
            email: true,
            name: true,
            plan: true,
            subscriptionStatus: true,
            cpfCnpj: true,
          },
        },
      },
    });

    return referrals.map(({ referred, ...referral }) => ({
      ...referral,
      cpfCnpjMasked: referred.cpfCnpj,
      referred: {
        id: referred.id,
        email: referred.email,
        name: referred.name,
        plan: referred.plan,
        subscriptionStatus: referred.subscriptionStatus,
      },
    }));
  }

  async markPaid(id: string, notes?: unknown) {
    const referral = await this.prisma.referral.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!referral) {
      throw new NotFoundException("Referral not found.");
    }

    if (referral.status !== ReferralStatus.ELIGIBLE) {
      throw new BadRequestException(
        "Only eligible referrals can be marked as paid.",
      );
    }

    if (notes !== undefined && typeof notes !== "string") {
      throw new BadRequestException("notes must be a string.");
    }

    return this.prisma.referral.update({
      where: { id },
      data: {
        status: ReferralStatus.PAID,
        paidAt: new Date(),
        ...(typeof notes === "string" ? { notes: notes.trim() || null } : {}),
      },
    });
  }

  async reject(id: string, notes?: unknown) {
    const referral = await this.prisma.referral.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!referral) {
      throw new NotFoundException("Referral not found.");
    }

    if (referral.status === ReferralStatus.PAID) {
      throw new BadRequestException("Paid referrals cannot be rejected.");
    }

    if (notes !== undefined && typeof notes !== "string") {
      throw new BadRequestException("notes must be a string.");
    }

    return this.prisma.referral.update({
      where: { id },
      data: {
        status: ReferralStatus.REJECTED,
        ...(typeof notes === "string" ? { notes: notes.trim() || null } : {}),
      },
    });
  }

  private async getOrCreateCode(userId: string) {
    const existing = await this.prisma.referralCode.findUnique({
      where: { userId },
      select: { code: true },
    });

    if (existing) {
      return existing;
    }

    for (let attempt = 0; attempt < CODE_RETRY_LIMIT; attempt += 1) {
      try {
        return await this.prisma.referralCode.create({
          data: {
            userId,
            code: randomBytes(6).toString("base64url"),
          },
          select: { code: true },
        });
      } catch (error) {
        if (!this.isUniqueConstraint(error)) {
          throw error;
        }

        const concurrent = await this.prisma.referralCode.findUnique({
          where: { userId },
          select: { code: true },
        });

        if (concurrent) {
          return concurrent;
        }
      }
    }

    throw new BadRequestException("Could not generate referral code.");
  }

  private isUniqueConstraint(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    );
  }

  private async readAntifraudReason(
    candidate: {
      id: string;
      referrerUserId: string;
      referredUserId: string;
      paymentConfirmedAt: Date | null;
      eligibleAt: Date | null;
      referred: {
        referredByUserId: string | null;
        cpfCnpjHash: string | null;
      };
    },
    hashesInBatch: Map<string, number>,
  ): Promise<string | null> {
    if (!candidate.paymentConfirmedAt || !candidate.eligibleAt) {
      return "MISSING_PAYMENT_CONFIRMATION";
    }

    if (!candidate.referred.referredByUserId) {
      return "MISSING_REFERRER_LINK";
    }

    if (
      candidate.referrerUserId === candidate.referredUserId ||
      candidate.referred.referredByUserId === candidate.referredUserId
    ) {
      return "SELF_REFERRAL";
    }

    if (candidate.referred.referredByUserId !== candidate.referrerUserId) {
      return "REFERRER_LINK_MISMATCH";
    }

    const cpfCnpjHash = candidate.referred.cpfCnpjHash;

    if (!cpfCnpjHash) {
      return "MISSING_CPF_CNPJ_HASH";
    }

    if ((hashesInBatch.get(cpfCnpjHash) ?? 0) > 1) {
      return "DUPLICATE_CPF_CNPJ";
    }

    const rewarded = await this.prisma.referral.findFirst({
      where: {
        id: { not: candidate.id },
        status: { in: [ReferralStatus.ELIGIBLE, ReferralStatus.PAID] },
        referred: { cpfCnpjHash },
      },
      select: { id: true },
    });

    return rewarded ? "DUPLICATE_CPF_CNPJ" : null;
  }
}
