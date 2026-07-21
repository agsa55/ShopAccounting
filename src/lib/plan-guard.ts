// ============================================================================
// src/lib/plan-guard.ts — Plan Limit Enforcement (v3.0)
// ============================================================================

import { checkSubscriptionStatus, checkPlanLimit, enforcePlanLimit } from '@/lib/plan-limits';
import type { SubscriptionStatusResult, PlanLimitResult } from '@/lib/plan-limits';

export type ResourceType = 'users' | 'products' | 'invoices' | 'customers';

export async function requireActiveSubscription(tenantId: string): Promise<{
  active: boolean;
  subscription: SubscriptionStatusResult;
  message?: string;
}> {
  const subscription = await checkSubscriptionStatus(tenantId);

  if (!subscription.isActive || subscription.isExpired) {
    return {
      active: false,
      subscription,
      message: `اشتراک شما منقضی شده است. لطفاً پلن خود را تمدید کنید.${
        subscription.daysRemaining === 0 ? '' : ` (${subscription.daysRemaining} روز مانده)`
      }`,
    };
  }

  return { active: true, subscription };
}

export async function requirePlanLimit(
  tenantId: string,
  resourceType: ResourceType,
  currentCount?: number
): Promise<{ allowed: boolean; limit: PlanLimitResult; message?: string }> {
  const limit = await checkPlanLimit(tenantId, resourceType, currentCount);

  if (!limit.allowed) {
    return {
      allowed: false,
      limit,
      message: `سقف ${limit.resourceNameFa} (${limit.limit}) تکمیل شده است. لطفاً پلن خود را ارتقا دهید.`,
    };
  }

  return { allowed: true, limit };
}

export async function requireSubscriptionAndLimit(
  tenantId: string,
  resourceType: ResourceType,
  currentCount?: number
): Promise<{
  allowed: boolean;
  subscription: SubscriptionStatusResult;
  limit: PlanLimitResult;
  message?: string;
}> {
  const subCheck = await requireActiveSubscription(tenantId);
  if (!subCheck.active) {
    return {
      allowed: false,
      subscription: subCheck.subscription,
      limit: {} as PlanLimitResult,
      message: subCheck.message,
    };
  }

  const limitCheck = await requirePlanLimit(tenantId, resourceType, currentCount);
  if (!limitCheck.allowed) {
    return {
      allowed: false,
      subscription: subCheck.subscription,
      limit: limitCheck.limit,
      message: limitCheck.message,
    };
  }

  return { allowed: true, subscription: subCheck.subscription, limit: limitCheck.limit };
}

export { enforcePlanLimit } from '@/lib/plan-limits';
