import type { ConfigService } from "@nestjs/config";

export const REFERRAL_REWARD_CENTS = 3000;
export const REFERRAL_WAITING_PERIOD_DAYS = 7;

export function readReferralRewardCents(config: ConfigService): number {
  return readPositiveInteger(
    config.get<string>("REFERRAL_REWARD_CENTS"),
    REFERRAL_REWARD_CENTS,
  );
}

export function readReferralEligibilityDays(config: ConfigService): number {
  return readPositiveInteger(
    config.get<string>("REFERRAL_ELIGIBILITY_DAYS"),
    REFERRAL_WAITING_PERIOD_DAYS,
  );
}

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
