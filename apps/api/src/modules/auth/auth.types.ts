import type { Plan, SubscriptionStatus } from "@prisma/client";

export type AuthenticatedUser = {
  id: string;
  email: string;
  role: string;
  plan: Plan;
  subscriptionStatus: SubscriptionStatus;
};

export type AuthenticatedRequest = {
  user: AuthenticatedUser;
};
