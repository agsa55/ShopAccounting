// ============================================================================
// src/app/api/admin/transactions/route.ts (v12.1 ★★★)
// ShopAccounting — Admin Platform Revenue Transactions ONLY
// ----------------------------------------------------------------------------
// ★ v12.1: اصلاح حیاتی — حذف پرداخت‌های مشتریان (Invoice Payments)
//   - فقط تراکنش‌های SubscriptionPayments نمایش داده می‌شوند.
//   - فقط تراکنش‌های OnlinePayments که مربوط به اشتراک هستند (بدون invoiceId یا با تگ SUBSCRIPTION) نمایش داده می‌شوند.
//   - پرداخت‌های فاکتور مشتریان کاملاً فیلتر شده‌اند.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

const ALLOWED_PLANS = ['simple', 'professional', 'enterprise']

type RawPayment = {
  source: string
  id: string
  tenantId: string | null
  tenantName: string | null
  tenantSubdomain: string | null
  tenantMobile: string | null
  tenantPlanName: string | null
  tenantIsLocked: boolean | null
  tenantLockReason: string | null
  amount: number
  status: string
  isPaid: boolean
  gatewayType: string | null
  paymentMethod: string | null
  paymentRef: string | null
  description: string | null
  createdAt: Date
  paidAt: Date | null
}

function normalizePlan(value: string | null | undefined): string | null {
  const p = String(value || '').trim().toLowerCase()
  if (!p || p === 'all') return null
  if (ALLOWED_PLANS.includes(p)) return p
  return null
}

function extractTier(row: RawPayment): string {
  const candidates = [
    row.paymentMethod,
    row.description,
    row.tenantPlanName,
  ]

  for (const candidate of candidates) {
    const text = String(candidate || '').toLowerCase()
    if (!text) continue

    if (
      text.includes('enterprise') ||
      text.includes('حرفه') ||
      text.includes('شرکتی')
    ) {
      return 'enterprise'
    }

    if (
      text.includes('professional') ||
      text.includes('پیشرفته') ||
      text.includes('فروشگاهی')
    ) {
      return 'professional'
    }

    if (text.includes('simple') || text.includes('پایه')) {
      return 'simple'
    }
  }

  return ''
}

function deriveType(row: RawPayment): string {
  const description = String(row.description || '')
  const paymentMethod = String(row.paymentMethod || '')
  const gatewayType = String(row.gatewayType || '').toLowerCase()

  if (gatewayType === 'manual_card' || description.includes('MANUAL_CARD')) {
    return 'manual_card'
  }

  if (gatewayType === 'donation' || description.includes('DONATION')) {
    return 'donation'
  }

  // ★ چون اینجا فقط تراکنش‌های اشتراک هستند، پیش‌فرض subscription_update است
  return 'subscription_update'
}

// ═══════════════════════════════════════════════════════════════
//  CTE اصلی: ترکیب دقیق و فیلترشده تراکنش‌های پلتفرم
// ═══════════════════════════════════════════════════════════════
const baseCte = Prisma.sql`
WITH platform_payments AS (
  
  -- ۱. تراکنش‌های قدیمی و جدید اشتراک از جدول SubscriptionPayments
  SELECT
    'subscription'::text AS source,
    sp.id,
    sp."tenantId",
    t."companyName" AS "tenantName",
    t."subDomain" AS "tenantSubdomain",
    t."ownerMobile" AS "tenantMobile",
    t."planName" AS "tenantPlanName",
    t."isLocked" AS "tenantIsLocked",
    t."lockReason" AS "tenantLockReason",
    COALESCE(sp.amount, 0)::float8 AS amount,
    sp.status,
    sp."isPaid",
    CASE
      WHEN sp."paymentMethod" LIKE 'zarinpal:%' THEN 'zarinpal'
      WHEN sp."paymentMethod" LIKE 'manual_card:%' THEN 'manual_card'
      ELSE 'unknown'
    END AS "gatewayType",
    sp."paymentMethod",
    COALESCE(sp."paymentRef", '') AS "paymentRef",
    NULL::text AS description,
    sp."createdAt",
    sp."paidAt"
  FROM "SubscriptionPayments" sp
  LEFT JOIN "Tenants" t ON t.id = sp."tenantId"

  UNION ALL

  -- ۲. تراکنش‌های جدید اشتراک از جدول OnlinePayments (با فیلتر سخت‌گیرانه)
  SELECT
    'online'::text AS source,
    op.id,
    op."tenantId",
    t."companyName" AS "tenantName",
    t."subDomain" AS "tenantSubdomain",
    t."ownerMobile" AS "tenantMobile",
    t."planName" AS "tenantPlanName",
    t."isLocked" AS "tenantIsLocked",
    t."lockReason" AS "tenantLockReason",
    COALESCE(op.amount, 0)::float8 AS amount,
    op.status,
    (op.status = 'paid') AS "isPaid",
    op."gatewayType",
    NULL::text AS "paymentMethod",
    COALESCE(op."refId", op.authority, '') AS "paymentRef",
    op.description,
    op."createdAt",
    op."paidAt"
  FROM "OnlinePayments" op
  LEFT JOIN "Tenants" t ON t.id = op."tenantId"
  WHERE 
    -- ★ شرط حیاتی: فقط تراکنش‌هایی که مربوط به اشتراک هستند
    (
      -- الف) دارای invoiceId نباشند (پرداشت فاکتور مشتری نیست)
      op."invoiceId" IS NULL
      
      OR
      
      -- ب) یا در توضیحاتشان تگ مخصوص اشتراک داشته باشند
      LOWER(COALESCE(op.description, '')) LIKE '%subscription%'
      OR LOWER(COALESCE(op.description, '')) LIKE '%به‌روزرسانی%'
      OR LOWER(COALESCE(op.description, '')) LIKE '%اشتراک%'
      
      OR
      
      -- ج) یا نوع گیت‌وی دستی کارت‌به‌کارت برای اشتراک باشد
      op."gatewayType" = 'manual_card'
    )
    
    AND
    
    -- ★ جلوگیری از تکراری شدن رکوردهایی که هم در Subscription و هم در Online وجود دارند
    NOT EXISTS (
      SELECT 1 
      FROM "SubscriptionPayments" sp_check
      WHERE sp_check."paymentRef" = op.authority
         OR sp_check."paymentRef" = op."refId"
         OR sp_check.id = op."gatewayId"
    )
)
SELECT * FROM platform_payments
`

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20')))
    const skip = (page - 1) * pageSize

    const status = searchParams.get('status')
    const planFilter = searchParams.get('plan')
    const timeFilter = searchParams.get('time')
    const search = searchParams.get('search')

    const whereFrags: Prisma.Sql[] = []

    // ── فیلتر وضعیت ───────────────────────────────────────
    if (status && status !== 'all') {
      if (status === 'paid') {
        whereFrags.push(Prisma.sql`("isPaid" = true OR status = 'paid')`)
      } else if (status === 'pending') {
        whereFrags.push(Prisma.sql`("isPaid" = false AND status = 'pending')`)
      } else if (status === 'waiting_review') {
        whereFrags.push(Prisma.sql`status = 'waiting_review'`)
      } else if (status === 'failed') {
        whereFrags.push(Prisma.sql`status = 'failed'`)
      } else if (status === 'cancelled') {
        whereFrags.push(Prisma.sql`status = 'cancelled'`)
      } else if (status === 'rejected') {
        whereFrags.push(Prisma.sql`status = 'rejected'`)
      }
    }

    // ── فیلتر جستجو ───────────────────────────────────────
    if (search && search.trim()) {
      const term = search.trim()
      const like = `%${term}%`

      whereFrags.push(
        Prisma.sql`
          (
            "tenantName" ILIKE ${like}
            OR "tenantSubdomain" ILIKE ${like}
            OR "tenantMobile" ILIKE ${like}
            OR "paymentRef" ILIKE ${like}
            OR COALESCE(description, '') ILIKE ${like}
            OR COALESCE("paymentMethod", '') ILIKE ${like}
          )
        `
      )
    }

    // ── فیلتر زمانی ───────────────────────────────────────
    if (timeFilter && timeFilter !== 'all') {
      const now = new Date()
      let since: Date | null = null

      if (timeFilter === 'today') {
        since = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      } else if (timeFilter === 'week') {
        since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      } else if (timeFilter === 'month') {
        since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      } else if (timeFilter === 'year') {
        since = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
      }

      if (since) {
        whereFrags.push(Prisma.sql`"createdAt" >= ${since}`)
      }
    }

    // ── فیلتر پلن ─────────────────────────────────────────
    const plan = normalizePlan(planFilter)
    if (plan) {
      const pattern = `%${plan}%`
      const tierPattern = `%tier=${plan}%`

      whereFrags.push(
        Prisma.sql`
          (
            COALESCE("paymentMethod", '') ILIKE ${tierPattern}
            OR COALESCE("tenantPlanName", '') ILIKE ${pattern}
            OR COALESCE(description, '') ILIKE ${pattern}
          )
        `
      )
    }

    const whereSql = whereFrags.length
      ? Prisma.join(whereFrags, ' AND ')
      : Prisma.sql`TRUE`

    // ── دریافت صفحه ───────────────────────────────────────
    const rows = await db.client.$queryRaw<RawPayment[]>`
      WITH filtered_payments AS (
        ${baseCte}
        WHERE ${whereSql}
      )
      SELECT * FROM filtered_payments
      ORDER BY "createdAt" DESC
      LIMIT ${pageSize}
      OFFSET ${skip}
    `

    // ── شمارش کل ──────────────────────────────────────────
    const countResult = await db.client.$queryRaw<{ count: number }[]>`
      WITH filtered_payments AS (
        ${baseCte}
        WHERE ${whereSql}
      )
      SELECT COUNT(*)::int AS count
      FROM filtered_payments
    `

    const totalCount = Number(countResult[0]?.count || 0)

    // ── آمار کلی (فقط برای تراکنش‌های پلتفرم) ─────────────
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)

    const statsResult = await db.client.$queryRaw<
      {
        paidCount: number
        totalRevenue: number
        monthlyRevenue: number
        todayCount: number
        todayRevenue: number
        pendingReviewCount: number
      }[]
    >`
      WITH all_platform_payments AS (
        ${baseCte}
      )
      SELECT
        COUNT(*) FILTER (WHERE "isPaid" = true OR status = 'paid')::int AS "paidCount",
        COALESCE(
          SUM(amount) FILTER (WHERE "isPaid" = true OR status = 'paid'),
          0
        )::float8 AS "totalRevenue",
        COALESCE(
          SUM(amount) FILTER (
            WHERE ("isPaid" = true OR status = 'paid')
              AND COALESCE("paidAt", "createdAt") >= ${monthStart}
              AND COALESCE("paidAt", "createdAt") < ${nextMonthStart}
          ),
          0
        )::float8 AS "monthlyRevenue",
        COUNT(*) FILTER (
          WHERE ("isPaid" = true OR status = 'paid')
            AND COALESCE("paidAt", "createdAt") >= ${todayStart}
        )::int AS "todayCount",
        COALESCE(
          SUM(amount) FILTER (
            WHERE ("isPaid" = true OR status = 'paid')
              AND COALESCE("paidAt", "createdAt") >= ${todayStart}
          ),
          0
        )::float8 AS "todayRevenue",
        COUNT(*) FILTER (WHERE status = 'waiting_review')::int AS "pendingReviewCount"
      FROM all_platform_payments
    `

    const stats = statsResult[0] || {
      paidCount: 0,
      totalRevenue: 0,
      monthlyRevenue: 0,
      todayCount: 0,
      todayRevenue: 0,
      pendingReviewCount: 0,
    }

    // ── فرمت خروجی ────────────────────────────────────────
    const formatted = rows.map((r) => {
      const tierName = extractTier(r)
      const type = deriveType(r)

      return {
        id: r.id,
        source: r.source,
        tenantId: r.tenantId,
        tenantName: r.tenantName || 'نامشخص',
        tenantSubdomain: r.tenantSubdomain || '',
        tenantMobile: r.tenantMobile || '',
        tenantPlanName: r.tenantPlanName || '',
        tenantIsLocked: Boolean(r.tenantIsLocked),
        tenantLockReason: r.tenantLockReason || null,
        amount: Number(r.amount) || 0,
        status: r.status,
        isPaid: Boolean(r.isPaid),
        gatewayType: r.gatewayType || 'unknown',
        paymentMethod: r.paymentMethod || '',
        paymentRef: r.paymentRef || '',
        description: r.description || '',
        createdAt: r.createdAt,
        paidAt: r.paidAt,
        type,
        tierName,
      }
    })

    return NextResponse.json({
      success: true,
      data: formatted,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
      stats: {
        totalRevenue: Number(stats.totalRevenue) || 0,
        monthlyRevenue: Number(stats.monthlyRevenue) || 0,
        todayRevenue: Number(stats.todayRevenue) || 0,
        todayCount: Number(stats.todayCount) || 0,
        totalCount: Number(stats.paidCount) || 0,
        pendingReviewCount: Number(stats.pendingReviewCount) || 0,
        avgTransaction:
          Number(stats.paidCount) > 0
            ? Math.round(Number(stats.totalRevenue) / Number(stats.paidCount))
            : 0,
      },
    })
  } catch (error: any) {
    console.error('[Admin Transactions v12.1] Error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'خطا در بارگذاری تراکنش‌ها' },
      { status: 500 }
    )
  }
}