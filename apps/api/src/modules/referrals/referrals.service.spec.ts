import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExecutionContext } from "@nestjs/common";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { ReferralStatus, SubscriptionStatus } from "@prisma/client";

import { AdminGuard } from "../auth/admin.guard";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { REFERRAL_REWARD_CENTS } from "./referral.constants";
import { AdminReferralsController } from "./referrals.controller";
import { ReferralsService } from "./referrals.service";

type StoredReferral = {
  id: string;
  referrerUserId: string;
  referredUserId: string;
  status: ReferralStatus;
  rewardCents: number;
  paymentConfirmedAt: Date | null;
  eligibleAt: Date | null;
  paidAt: Date | null;
  notes: string | null;
  antifraudReason: string | null;
  referred: {
    referredByUserId: string | null;
    cpfCnpjHash: string | null;
    cpfCnpj: string | null;
    isActive: boolean;
    subscriptionStatus: SubscriptionStatus;
  };
};

function makeService() {
  const codes = new Map<string, string>();
  const referrals: StoredReferral[] = [
    {
      id: "referral-1",
      referrerUserId: "referrer-1",
      referredUserId: "referred-1",
      status: ReferralStatus.PENDING_PAYMENT,
      rewardCents: REFERRAL_REWARD_CENTS,
      paymentConfirmedAt: null as Date | null,
      eligibleAt: null as Date | null,
      paidAt: null as Date | null,
      notes: null as string | null,
      antifraudReason: null,
      referred: {
        referredByUserId: "referrer-1",
        cpfCnpjHash: "hash-1",
        cpfCnpj: "***.***.***-09",
        isActive: true,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
      },
    },
  ];
  const prisma = {
    referralCode: {
      findUnique: async ({
        where,
      }: {
        where: { userId?: string; code?: string };
      }) => {
        if (where.userId) {
          const code = codes.get(where.userId);
          return code ? { code } : null;
        }

        return null;
      },
      create: async ({ data }: { data: { userId: string; code: string } }) => {
        codes.set(data.userId, data.code);
        return { code: data.code };
      },
    },
    referral: {
      count: async ({
        where,
      }: {
        where: { referrerUserId: string; status?: ReferralStatus };
      }) =>
        referrals.filter(
          (item) =>
            item.referrerUserId === where.referrerUserId &&
            (!where.status || item.status === where.status),
        ).length,
      aggregate: async ({
        where,
      }: {
        where: { referrerUserId: string; status: ReferralStatus };
      }) => ({
        _sum: {
          rewardCents: referrals
            .filter(
              (item) =>
                item.referrerUserId === where.referrerUserId &&
                item.status === where.status,
            )
            .reduce((sum, item) => sum + item.rewardCents, 0),
        },
      }),
      findUnique: async ({
        where,
      }: {
        where: { id?: string; referredUserId?: string };
      }) =>
        referrals.find(
          (item) =>
            (where.id && item.id === where.id) ||
            (where.referredUserId &&
              item.referredUserId === where.referredUserId),
        ) ?? null,
      findFirst: async ({
        where,
      }: {
        where: {
          id: { not: string };
          status: { in: ReferralStatus[] };
          referred: { cpfCnpjHash: string };
        };
      }) =>
        referrals.find(
          (item) =>
            item.id !== where.id.not &&
            where.status.in.includes(item.status) &&
            item.referred.cpfCnpjHash === where.referred.cpfCnpjHash,
        ) ?? null,
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<(typeof referrals)[number]>;
      }) => {
        const referral = referrals.find((item) => item.id === where.id)!;
        Object.assign(referral, data);
        return referral;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          status: ReferralStatus;
          eligibleAt?: { lte: Date };
          referredUserId?: string;
          referred?: {
            isActive: boolean;
            subscriptionStatus: SubscriptionStatus;
          };
        };
        data: {
          status: ReferralStatus;
          paymentConfirmedAt?: null;
          eligibleAt?: null;
        };
      }) => {
        const matches = referrals.filter(
          (item) =>
            item.status === where.status &&
            (!where.referredUserId ||
              item.referredUserId === where.referredUserId) &&
            (!where.eligibleAt ||
              (!!item.eligibleAt && item.eligibleAt <= where.eligibleAt.lte)) &&
            (!where.referred ||
              (item.referred.isActive === where.referred.isActive &&
                item.referred.subscriptionStatus ===
                  where.referred.subscriptionStatus)),
        );
        matches.forEach((item) => {
          item.status = data.status;
          if (data.paymentConfirmedAt === null) {
            item.paymentConfirmedAt = null;
          }
          if (data.eligibleAt === null) {
            item.eligibleAt = null;
          }
        });
        return { count: matches.length };
      },
      findMany: async ({
        where,
      }: {
        where?: {
          status?: ReferralStatus;
          eligibleAt?: { lte: Date };
        };
      } = {}) =>
        referrals.filter(
          (item) =>
            (!where?.status || item.status === where.status) &&
            (!where?.eligibleAt ||
              (!!item.eligibleAt && item.eligibleAt <= where.eligibleAt.lte)),
        ),
    },
  };

  return {
    service: new ReferralsService(
      prisma as never,
      {
        get: (key: string) => {
          if (key === "REFERRAL_REWARD_CENTS") {
            return "3000";
          }
          if (key === "REFERRAL_ELIGIBILITY_DAYS") {
            return "7";
          }
          return undefined;
        },
      } as never,
    ),
    referrals,
    codes,
  };
}

describe("ReferralsService", () => {
  it("protects admin referrals from regular users", () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      AdminReferralsController,
    ) as unknown[];
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: "user-1", role: "USER" } }),
      }),
    } as ExecutionContext;

    assert.deepEqual(guards, [JwtAuthGuard, AdminGuard]);
    assert.throws(
      () => new AdminGuard().canActivate(context),
      ForbiddenException,
    );
  });

  it("generates one reusable referral code for every user", async () => {
    const { service, codes } = makeService();

    const first = await service.getDashboard("referrer-1");
    const second = await service.getDashboard("referrer-1");

    assert.equal(first.code, second.code);
    assert.equal(codes.size, 1);
    assert.equal(first.rewardCents, 3000);
  });

  it("moves a paid referral to the seven-day waiting period once", async () => {
    const { service, referrals } = makeService();
    const confirmedAt = new Date("2026-06-10T12:00:00.000Z");

    await service.confirmPayment("referred-1", confirmedAt);
    await service.confirmPayment(
      "referred-1",
      new Date("2026-06-11T12:00:00.000Z"),
    );

    assert.equal(referrals[0]?.status, ReferralStatus.PENDING_WAITING_PERIOD);
    assert.equal(
      referrals[0]?.paymentConfirmedAt?.toISOString(),
      confirmedAt.toISOString(),
    );
    assert.equal(
      referrals[0]?.eligibleAt?.toISOString(),
      "2026-06-17T12:00:00.000Z",
    );
  });

  it("makes referrals eligible only after seven days while still active", async () => {
    const { service, referrals } = makeService();
    referrals[0]!.status = ReferralStatus.PENDING_WAITING_PERIOD;
    referrals[0]!.paymentConfirmedAt = new Date("2026-06-10T12:00:00.000Z");
    referrals[0]!.eligibleAt = new Date("2026-06-17T12:00:00.000Z");

    assert.equal(
      await service.processEligible(new Date("2026-06-17T11:59:59.000Z")),
      0,
    );
    assert.equal(
      await service.processEligible(new Date("2026-06-17T12:00:00.000Z")),
      1,
    );
    assert.equal(referrals[0]?.status, ReferralStatus.ELIGIBLE);
  });

  it("does not make an inactive subscription eligible", async () => {
    const { service, referrals } = makeService();
    referrals[0]!.status = ReferralStatus.PENDING_WAITING_PERIOD;
    referrals[0]!.paymentConfirmedAt = new Date("2026-06-10T12:00:00.000Z");
    referrals[0]!.eligibleAt = new Date("2026-06-17T12:00:00.000Z");
    referrals[0]!.referred.subscriptionStatus = SubscriptionStatus.CANCELED;

    assert.equal(
      await service.processEligible(new Date("2026-06-18T12:00:00.000Z")),
      0,
    );
    assert.equal(referrals[0]?.status, ReferralStatus.PENDING_WAITING_PERIOD);
  });

  it("moves duplicate CPF/CNPJ referrals to review", async () => {
    const { service, referrals } = makeService();
    referrals[0]!.status = ReferralStatus.PENDING_WAITING_PERIOD;
    referrals[0]!.paymentConfirmedAt = new Date("2026-06-10T12:00:00.000Z");
    referrals[0]!.eligibleAt = new Date("2026-06-17T12:00:00.000Z");
    referrals.push({
      ...referrals[0]!,
      id: "referral-2",
      referredUserId: "referred-2",
      referred: {
        ...referrals[0]!.referred,
        referredByUserId: "referrer-2",
      },
      referrerUserId: "referrer-2",
    });

    assert.equal(
      await service.processEligible(new Date("2026-06-18T12:00:00.000Z")),
      2,
    );
    assert.equal(referrals[0]?.status, ReferralStatus.NEEDS_REVIEW);
    assert.equal(referrals[1]?.status, ReferralStatus.NEEDS_REVIEW);
    assert.equal(referrals[0]?.antifraudReason, "DUPLICATE_CPF_CNPJ");
  });

  it("resets the waiting period after cancellation", async () => {
    const { service, referrals } = makeService();
    referrals[0]!.status = ReferralStatus.PENDING_WAITING_PERIOD;
    referrals[0]!.paymentConfirmedAt = new Date("2026-06-10T12:00:00.000Z");
    referrals[0]!.eligibleAt = new Date("2026-06-17T12:00:00.000Z");

    assert.equal(await service.resetWaitingPeriod("referred-1"), 1);
    assert.equal(referrals[0]?.status, ReferralStatus.PENDING_PAYMENT);
    assert.equal(referrals[0]?.paymentConfirmedAt, null);
    assert.equal(referrals[0]?.eligibleAt, null);
  });

  it("calculates eligible balance without counting pending or paid rewards", async () => {
    const { service, referrals } = makeService();
    referrals[0]!.status = ReferralStatus.ELIGIBLE;
    referrals.push({
      ...referrals[0]!,
      id: "referral-2",
      referredUserId: "referred-2",
      status: ReferralStatus.PAID,
    });

    const dashboard = await service.getDashboard("referrer-1");

    assert.equal(dashboard.totalReferred, 2);
    assert.equal(dashboard.totalEligible, 1);
    assert.equal(dashboard.totalPaid, 1);
    assert.equal(dashboard.eligibleBalanceCents, 3000);
  });

  it("marks only eligible referrals as paid", async () => {
    const { service, referrals } = makeService();

    await assert.rejects(
      () => service.markPaid("referral-1"),
      BadRequestException,
    );

    referrals[0]!.status = ReferralStatus.ELIGIBLE;
    await service.markPaid("referral-1", "Pago manualmente");

    assert.equal(referrals[0]?.status, ReferralStatus.PAID);
    assert.ok(referrals[0]?.paidAt);
    assert.equal(referrals[0]?.notes, "Pago manualmente");
  });
});
