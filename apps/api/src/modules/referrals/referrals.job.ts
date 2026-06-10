import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";

import { ReferralsService } from "./referrals.service";

const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ReferralsEligibilityJob implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(private readonly referrals: ReferralsService) {}

  onModuleInit() {
    void this.run();
    this.timer = setInterval(() => void this.run(), DAILY_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async run(now = new Date()) {
    const count = await this.referrals.processEligible(now);

    if (count > 0) {
      console.log(`[REFERRALS] eligible count=${count}`);
    }

    return count;
  }
}
