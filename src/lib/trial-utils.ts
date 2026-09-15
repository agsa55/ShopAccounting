// ============================================================================
// src/lib/trial-utils.ts — Subscription Utilities
// ★ v2.1: محاسبه دقیق روزها بر اساس ساعت
// ★ v2.1: رفع مشکل Math.ceil برای اعداد اعشاری
// ============================================================================

import { db } from '@/lib/db'
import { USER_MESSAGES } from '@/lib/user-messages'
export interface SubscriptionStatus {
  status: 'active' | 'needs_update' | 'locked'
  daysUntilUpdate: number
  needsUpdate: boolean
  isLocked: boolean
  canCreate: boolean
  canRead: boolean
  discountPercent: number
  nextUpdateDate: Date | null
  message: string
  billingCycle?: string
  isLifetime?: boolean
  hoursRemaining?: number
}

/**
 * محاسبه دقیق روزهای باقی‌مانده بر اساس ساعت
 */
function calculateDaysRemaining(endDate: Date, now: Date): { days: number; hours: number } {
  const diffMs = endDate.getTime() - now.getTime()
  const hoursRemaining = diffMs / (1000 * 60 * 60)
  
  // اگر منقضی شده
  if (hoursRemaining <= 0) {
    return { days: 0, hours: 0 }
  }
  
  // محاسبه بر اساس بازه‌های ۲۴ ساعته
  if (hoursRemaining <= 24) {
    return { days: 1, hours: Math.ceil(hoursRemaining) }
  } else if (hoursRemaining <= 48) {
    return { days: 2, hours: Math.ceil(hoursRemaining) }
  } else if (hoursRemaining <= 72) {
    return { days: 3, hours: Math.ceil(hoursRemaining) }
  } else {
    return { days: Math.ceil(hoursRemaining / 24), hours: Math.ceil(hoursRemaining) }
  }
}

/**
 * محاسبه وضعیت اشتراک
 * ★ v2.1: محاسبه دقیق روزها + رفع مشکل Math.ceil
 */
export async function getSubscriptionStatus(tenantId: string): Promise<SubscriptionStatus> {
  const tenant = await db.client.tenant.findUnique({
    where: { id: tenantId },
    select: {
      trialStartAt: true,
      trialEndAt: true,
      isPaid: true,
      paidAt: true,
      status: true,
      billingCycle: true,
      expiresAt: true,
    },
  })

  if (!tenant) {
    throw new Error('Tenant not found')
  }

  // ★ مادام‌العمر فقط وقتی هر دو شرط برقرار باشد
  const isLifetime = tenant.isPaid === true && tenant.billingCycle === 'lifetime'
 console.log('[TrialUtils] 🔍 isLifetime calculated:', isLifetime)

  if (isLifetime) {
     console.log('[TrialUtils] ✅ Returning LIFETIME status')
    return {
      status: 'active',
      daysUntilUpdate: -1,
      needsUpdate: false,
      isLocked: false,
      canCreate: true,
      canRead: true,
      discountPercent: 0,
      nextUpdateDate: null,
      message: 'سیستم فعال است',
      billingCycle: 'lifetime',
      isLifetime: true,
    }
  }

  // ★ محاسبه روز‌های باقی‌مانده
  const now = new Date()
  
  // اولویت: expiresAt → سپس trialEndAt
  const endDate = tenant.expiresAt 
    ? new Date(tenant.expiresAt) 
    : (tenant.trialEndAt ? new Date(tenant.trialEndAt) : null)
   console.log('[TrialUtils] 📅 End date used:', endDate?.toISOString())
  let daysUntilUpdate = 0
  let hoursRemaining = 0
  
  if (endDate) {
    const result = calculateDaysRemaining(endDate, now)
    daysUntilUpdate = result.days
    hoursRemaining = result.hours
  }

  const diffMs = endDate ? endDate.getTime() - now.getTime() : 0
  const isExpired = diffMs <= 0
  const isWarning = daysUntilUpdate <= 3 && daysUntilUpdate > 0
  const isUrgent = daysUntilUpdate === 1
 console.log('[TrialUtils] 🔍 Flags:', { diffMs, isExpired, isWarning, isUrgent })
  console.log('═══════════════════════════════════════')
  // منطق قفل تدریجی
  const canCreate = !isExpired
  const canRead = true

  // تخفیف زودهنگام
  let discountPercent = 0
  if (!isExpired) {
    if (daysUntilUpdate > 85) {
      discountPercent = 30
    } else if (daysUntilUpdate <= 3) {
      discountPercent = 15
    }
  }

  // پیام
   // پیام
  let message = ''
  let status: SubscriptionStatus['status'] = 'active'
  
  if (isExpired) {
    status = 'locked'
    message = USER_MESSAGES.PERIOD_EXPIRED  // ★ به جای پیام دستی
    console.log('[TrialUtils v2.2] 🔒 Status: LOCKED')
  } else if (isUrgent) {
    status = 'needs_update'
    message = USER_MESSAGES.PERIOD_WARNING_1DAY  // ★
    console.log('[TrialUtils v2.2] ⚠️ Status: URGENT (1 day)')
  } else if (isWarning) {
    status = 'needs_update'
    message = USER_MESSAGES.PERIOD_WARNING_3DAYS(daysUntilUpdate)  // ★
    console.log('[TrialUtils v2.2] ⚠️ Status: WARNING (' + daysUntilUpdate + ' days)')
  } else {
    status = 'active'
    message = USER_MESSAGES.SYSTEM_ACTIVE  // ★
    console.log('[TrialUtils v2.2] ✅ Status: ACTIVE')
  }
  
  return {
    status,
    daysUntilUpdate,
    needsUpdate: isExpired || isUrgent || isWarning,
    isLocked: isExpired,
    canCreate,
    canRead,
    discountPercent,
    nextUpdateDate: endDate,
    message,
    billingCycle: tenant.billingCycle || 'annual',
    isLifetime: false,
    hoursRemaining,
  }
}

/**
 * فعال‌سازی اشتراک مادام‌العمر بعد از پرداخت
 */
export async function activateLifetimeSubscription(
  tenantId: string,
  discountPercent: number = 0
): Promise<void> {
  await db.client.tenant.update({
    where: { id: tenantId },
    data: {
      isPaid: true,
      paidAt: new Date(),
      discountApplied: discountPercent,
      billingCycle: 'lifetime',
      expiresAt: null,
    },
  })
}