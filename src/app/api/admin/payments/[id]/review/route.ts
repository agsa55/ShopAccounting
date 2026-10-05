// ============================================================================
// src/app/api/admin/payments/[id]/review/route.ts (v1.0 ★★★)
// ShopAccounting — Admin Approve / Reject Manual Card Payment
// ----------------------------------------------------------------------------
// ★ این API پرداخت کارت‌به‌کارت با وضعیت waiting_review را تأیید یا رد می‌کند.
// ★ در صورت تأیید:
//   - رکورد OnlinePayments به paid تغییر می‌کند
//   - Tenant فعال می‌شود
//   - در صورت انتخاب unlock، قفل فروشگاه باز می‌شود
//   - رکورد Subscriptions و SubscriptionPayments برای تاریخچه ساخته می‌شود
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { getOrCreatePlan } from '@/lib/subscription-utils'
import {
  getBillingDurationDays,
  isLifetimeCycle,
  type BillingCycle,
} from '@/lib/plan-limits'

function parseManualDescription(description: string | null | undefined): {
  tierName: string
  billingCycle: BillingCycle
} {
  const raw = String(description || '')
  const lower = raw.toLowerCase()

  let tierName = 'simple'

  if (
    lower.includes('enterprise') ||
    raw.includes('حرفه') ||
    raw.includes('شرکتی')
  ) {
    tierName = 'enterprise'
  } else if (
    lower.includes('professional') ||
    raw.includes('پیشرفته') ||
    raw.includes('فروشگاهی')
  ) {
    tierName = 'professional'
  } else if (lower.includes('simple') || raw.includes('پایه')) {
    tierName = 'simple'
  }

  const billingCycle: BillingCycle =
    lower.includes('lifetime') || raw.includes('مادام‌العمر')
      ? 'lifetime'
      : 'annual'

  return { tierName, billingCycle }
}

function sanitizeNote(note: unknown): string {
  return String(note || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300)
}

export async function POST(req: NextRequest, context: any) {
  try {
    const resolvedParams =
      context?.params && typeof context.params.then === 'function'
        ? await context.params
        : context?.params

    const id = String(resolvedParams?.id || '').trim()

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'شناسه تراکنش ارسال نشده است.' },
        { status: 400 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const action = String(body.action || '').trim()
    const note = sanitizeNote(body.note)
    const unlock = Boolean(body.unlock)

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'عملیات نامعتبر است.' },
        { status: 400 }
      )
    }

    const payment = await db.client.onlinePayment.findUnique({
      where: { id },
    })

    if (!payment) {
      return NextResponse.json(
        { success: false, error: 'تراکنش یافت نشد.' },
        { status: 404 }
      )
    }

    if (payment.gatewayType !== 'manual_card') {
      return NextResponse.json(
        { success: false, error: 'این تراکنش از نوع کارت‌به‌کارت نیست.' },
        { status: 400 }
      )
    }

    // ── رد پرداخت ───────────────────────────────────────
    if (action === 'reject') {
      if (!['waiting_review', 'pending'].includes(payment.status)) {
        return NextResponse.json(
          { success: false, error: 'Only pending/manual review payments can be rejected.' },
          { status: 400 }
        )
      }

      const now = new Date()
      const appended =
        `${payment.description || ''}\n[ADMIN_REJECTED] ${now.toISOString()}${note ? ` | ${note}` : ''}`.trim()

await db.client.onlinePayment.update({
  where: { id },
  data: {
    status: 'rejected',
    type: 'manual_card',
    isSandbox: false,
    netAmount: 0,
    settlementStatus: 'rejected',
    description: appended.slice(0, 1000),
  },
})

      return NextResponse.json({
        success: true,
        message: 'درخواست پرداخت کارت‌به‌کارت رد شد.',
      })
    }

    // ── تأیید پرداخت ────────────────────────────────────
    if (payment.status === 'paid') {
      return NextResponse.json({
        success: true,
        message: 'این پرداخت قبلاً تأیید شده است.',
        data: { alreadyPaid: true },
      })
    }

    if (payment.status !== 'waiting_review') {
      return NextResponse.json(
        { success: false, error: 'فقط تراکنش‌های در انتظار بررسی قابل تأیید هستند.' },
        { status: 400 }
      )
    }

    const tenantId = payment.tenantId
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'فروشگاه مرتبط با این تراکنش یافت نشد.' },
        { status: 400 }
      )
    }

    const tenant = await db.client.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, companyName: true, subDomain: true },
    })

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'فروشگاه مرتبط با این تراکنش وجود ندارد.' },
        { status: 404 }
      )
    }

    const { tierName, billingCycle } = parseManualDescription(payment.description)
    const amountToman = Number(payment.amount) || 0

    if (!Number.isFinite(amountToman) || amountToman <= 0) {
      return NextResponse.json(
        { success: false, error: 'مبلغ تراکنش نامعتبر است.' },
        { status: 400 }
      )
    }

    const now = new Date()
    const durationDays = getBillingDurationDays(billingCycle)
    const isLifetime = isLifetimeCycle(billingCycle) || durationDays === 0

    const expiresAt = isLifetime
      ? null
      : new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000)

    const subscriptionEndDate = isLifetime
      ? new Date(now.getTime() + 100 * 365 * 24 * 60 * 60 * 1000)
      : expiresAt!

    // ۱. به‌روزرسانی رکورد OnlinePayments
    const appendedDescription =
      `${payment.description || ''}\n[ADMIN_APPROVED] ${now.toISOString()}${note ? ` | ${note}` : ''}`.trim()

await db.client.onlinePayment.update({
  where: { id },
  data: {
    status: 'paid',
    paidAt: now,
    verifiedAt: now,
    refId: `MANUAL-${id.slice(-8)}`,
    type: 'manual_card',
    isSandbox: false,
    amount: amountToman,
    grossAmount: amountToman,
    netAmount: amountToman,
    fee: 0,
    settlementStatus: 'settled',
    settlementDate: now,
    settlementReferenceId: `MANUAL-${id.slice(-8)}`,
    description: appendedDescription.slice(0, 1000),
  },
})

    // ۲. فعال‌سازی Tenant
    const tenantUpdateData: any = {
      planName: tierName,
      billingCycle,
      expiresAt,
      status: 'active',
      isPaid: true,
      paidAt: now,
    }

    if (unlock) {
      tenantUpdateData.isLocked = false
      tenantUpdateData.lockedAt = null
      tenantUpdateData.lockReason = null
      tenantUpdateData.lockedByAdmin = null
    }

    await db.client.tenant.update({
      where: { id: tenantId },
      data: tenantUpdateData,
    })

    // ۳. ساخت رکورد اشتراک و پرداخت برای تاریخچه
    try {
      const planId = await getOrCreatePlan(tierName, billingCycle)

      if (planId) {
        const subscription = await db.client.subscriptions.create({
          data: {
            id: randomUUID(),
            tenantId,
            planId,
            startDate: now,
            endDate: subscriptionEndDate,
            status: 'active',
            autoRenew: false,
          },
        })

        await db.client.subscriptionPayments.create({
          data: {
            id: randomUUID(),
            subscriptionId: subscription.id,
            tenantId,
            amount: amountToman,
            paymentMethod: `manual_card:tier=${tierName},cycle=${billingCycle}`,
            paymentRef: `manual:${id}`,
            isPaid: true,
            status: 'paid',
            paidAt: now,
          },
        })
      }
    } catch (subErr: any) {
      console.warn('[ManualPaymentReview] Failed to create subscription history:', subErr?.message)
      // ★ خطای تاریخچه نباید تأیید پرداخت را fail کند
    }

    return NextResponse.json({
      success: true,
      message: unlock
        ? 'پرداخت کارت‌به‌کارت تأیید شد و قفل فروشگاه باز شد.'
        : 'پرداخت کارت‌به‌کارت تأیید شد.',
      data: {
        paymentId: id,
        tenantId,
        tierName,
        billingCycle,
        amountToman,
        unlocked: unlock,
      },
    })
  } catch (error: any) {
    console.error('[ManualPaymentReview] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'خطای سرور در بررسی پرداخت' },
      { status: 500 }
    )
  }
}