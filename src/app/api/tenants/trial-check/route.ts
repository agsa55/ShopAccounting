// ============================================================================
// src/app/api/tenants/trial-check/route.ts — GET (v9.1)
// ShopAccounting — Unified Single Database Architecture
// ============================================================================
// ★★★ v3.0: isTrial همیشه false — فقط بررسی انقضای اشتراک
// ★★★ v9.0: پشتیبانی از پلن مادام‌العمر (lifetime)
//   - اگر billingCycle='lifetime' باشد → isExpired همیشه false
//   - daysRemaining برابر -1 (یعنی نامحدود) برای lifetime
//   - expiresAt برای lifetime برابر null است
// ★★★ v9.1: تشخیص مستقل تنانت دمو/تستی
//   - قبل از این نسخه، تنانت‌های دمو هیچ سیگنالی (isDemo/tenantType/...) برنمی‌گرداندند
//     و از شاخه‌ی «پلن سالانه» عبور می‌کردند که باعث می‌شد فوراً «منقضی» گزارش شوند
//   - حالا daysRemaining/hoursRemaining مستقیماً از tenant.expiresAt حساب می‌شود
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { checkSubscriptionStatus } from '@/lib/plan-limits'

// ★★★ v9.0: helper محلی برای تشخیص lifetime
//   (اگر تابع isLifetimeCycle از plan-features.ts در دسترس است، می‌توانید از آن استفاده کنید)
function isLifetimeCycle(cycle: string | null | undefined): boolean {
  if (!cycle) return false
  const lower = String(cycle).toLowerCase().trim()
  return lower === 'lifetime' || lower === 'مادام‌العمر'
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'توکن احراز هویت الزامی است' },
        { status: 401 }
      )
    }

    let tenantId = ''
    try {
      const payloadB64 = token.split('.')[1]
      if (payloadB64) {
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'))
        tenantId = payload.tenantId || payload.tid || ''
      }
    } catch {
      return NextResponse.json(
        { success: false, error: 'توکن نامعتبر است' },
        { status: 401 }
      )
    }

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'شناسه فروشگاه در توکن یافت نشد' },
        { status: 400 }
      )
    }

    // ★★★ v9.0: ابتدا tenant را بخوان تا billingCycle را داشته باشیم
    const tenant = await db.client.tenant.findUnique({
      where: { id: tenantId },
    })

    // ★★★ v9.1: تشخیص تنانت دمو/تستی — باید قبل از هر شاخه‌ی دیگر بررسی شود
    //   چون این تنانت‌ها رکورد اشتراک سالانه ندارند و نباید از checkSubscriptionStatus
    //   عبور کنند (که آن‌ها را به‌اشتباه «منقضی» گزارش می‌کرد)
    const isDemoTenant = tenant?.status === 'demo' || tenant?.status === 'demo_pending'

    if (isDemoTenant) {
      const now = new Date()
      const expiresAt = tenant?.expiresAt ? new Date(tenant.expiresAt) : null

      let daysRemaining = 0
      let hoursRemaining = 0
      let isExpired = true

      if (expiresAt) {
        const diffMs = expiresAt.getTime() - now.getTime()
        isExpired = diffMs <= 0
        if (!isExpired) {
          const totalHours = Math.floor(diffMs / (1000 * 60 * 60))
          daysRemaining = Math.floor(totalHours / 24)
          hoursRemaining = totalHours % 24
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          isTrial: true,
          // ★ سیگنال‌های صریح دمو — همان چیزی که app-shell.tsx در demoSignal چک می‌کند
          isDemo: true,
          tenantType: 'demo',
          planType: 'demo',
          isExpired,
          isActive: !isExpired,
          daysRemaining,
          hoursRemaining,
          planName: tenant?.planName || 'simple',
          planTierName: tenant?.planName || 'simple',
          planTierNameFa: '',
          billingCycle: 'trial',
          expiresAt: expiresAt ? expiresAt.toISOString() : null,
          isLifetime: false,
          isIsolated: false,
          message: isExpired
            ? 'دوره آزمایشی منقضی شده است'
            : `دوره آزمایشی رایگان — ${daysRemaining > 0 ? `${daysRemaining} روز و ` : ''}${hoursRemaining} ساعت مانده`,
        },
      })
    }

    // ★★★ v9.0: اگر tenant روی پلن مادام‌العمر است → همیشه فعال و بدون انقضا
    const tenantBillingCycle = tenant?.billingCycle || ''
    const isLifetime = isLifetimeCycle(tenantBillingCycle)

    if (isLifetime) {
      const planName = tenant?.planName || 'simple'
      // ★ برای lifetime، planTier را هم بخوان تا nameFa را داشته باشیم
      let planTierNameFa = ''
      let planTierName = ''
      if (tenant?.planTierId) {
        try {
          const tier = await db.client.planTier.findUnique({
            where: { id: tenant.planTierId },
          })
          if (tier) {
            planTierName = tier.name
            planTierNameFa = tier.nameFa
          }
        } catch { /* ignore */ }
      }

      return NextResponse.json({
        success: true,
        data: {
          isTrial: false,
          // ★ lifetime → هرگز منقضی نمی‌شود
          isExpired: false,
          isActive: tenant?.status !== 'suspended',
          // ★ -1 یعنی «نامحدود» برای نمایش در UI
          daysRemaining: -1,
          planName,
          planTierName: planTierName || subscription_tierName_fallback(tenant),
          planTierNameFa: planTierNameFa || '',
          billingCycle: 'lifetime',
          // ★ برای lifetime، expiresAt برابر null است
          expiresAt: null,
          isLifetime: true,
          isIsolated: false,
          message: 'فعال — مادام‌العمر (بدون محدودیت زمانی)',
        },
      })
    }

    // ★★★ برای پلن‌های سالانه — منطق قبلی
    const subscription = await checkSubscriptionStatus(tenantId)

    let planName = subscription.tierName
    let isActive = subscription.isActive
    let expiresAt = subscription.expiresAt?.toISOString() || null

    if (tenant) {
      planName = tenant.planTierId ? subscription.tierName : (tenant.planName || 'simple')
      isActive = tenant.status !== 'suspended'
      if (tenant.expiresAt) {
        expiresAt = new Date(tenant.expiresAt).toISOString()
      }
    }

    const daysRemaining = subscription.daysRemaining

    let message = ''
    if (subscription.isExpired) {
      message = 'اشتراک شما منقضی شده است'
    } else {
      message = `فعال — ${daysRemaining > 0 ? `${daysRemaining} روز مانده` : 'بدون محدودیت'}`
    }

    return NextResponse.json({
      success: true,
      data: {
        isTrial: false,  // ★ همیشه false در v3.0
        isExpired: subscription.isExpired,
        isActive,
        daysRemaining,
        planName,
        planTierName: subscription.tierName,
        planTierNameFa: subscription.tierNameFa,
        billingCycle: subscription.billingCycle,
        expiresAt,
        isLifetime: false,
        isIsolated: false,  // ★ همیشه false در v3.0
        message,
      },
    })
  } catch (error: any) {
    console.error('[Trial-Check] Error:', error.message)
    return NextResponse.json(
      { success: false, error: 'خطا در بررسی وضعیت اشتراک' },
      { status: 500 }
    )
  }
}

// ★★★ v9.0: تابع کمکی برای fallback planTierName
function subscription_tierName_fallback(tenant: any): string {
  if (!tenant?.planName) return 'simple'
  const name = tenant.planName.toLowerCase()
  if (name.includes('professional')) return 'professional'
  if (name.includes('enterprise')) return 'enterprise'
  return 'simple'
}