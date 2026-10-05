// ============================================================================
// src/app/api/admin/transactions/route.ts (v13.1 ★★★ Final)
// ShopAccounting — Admin Platform Revenue Transactions with Full ZarinPal Detail
// ----------------------------------------------------------------------------
// ★ v13.1: اولویت OnlinePayments برای نمایش authority/refId/cardPan/fee/verify
// ★ v13.1: SubscriptionPayments فقط برای رکوردهای بدون معادل Online
// ★ v13.1: آمار درآمدی تراکنش‌های سندباکس/تستی را حساب نمی‌کند
// ★ v13.1: پشتیبانی کامل از inquiry, reverse, payer info, settlement
// ★ v13.1: فیلتر reversed و جستجوی پیشرفته‌تر
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

  type: string | null
  isSandbox: boolean | null

  amount: number
  grossAmount: number
  netAmount: number
  fee: number
  feeType: string | null

  status: string
  isPaid: boolean

  gatewayType: string | null
  paymentMethod: string | null
  paymentRef: string | null
  authority: string | null
  refId: string | null
  description: string | null

  cardPan: string | null
  cardHash: string | null
  payerAccount: string | null

  verifyCode: number | null
  verifyMessage: string | null
  autoVerify: boolean | null

  inquiryStatus: string | null
  inquiryCode: number | null
  inquiryMessage: string | null
  inquiryAt: Date | null

  reverseCode: number | null
  reverseMessage: string | null
  reversedAt: Date | null

  payerName: string | null
  payerMobile: string | null
  payerEmail: string | null
  payerNote: string | null

  createdAt: Date
  paidAt: Date | null
  verifiedAt: Date | null
  updatedAt: Date | null

  settlementStatus: string | null
  settlementDate: Date | null
  settlementReferenceId: string | null
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

// ═══════════════════════════════════════════════════════════════
//  CTE اصلی: فقط تراکنش‌های پلتفرم
//  ★ اول OnlinePayments تا اطلاعات کامل زرین‌پال در دسترس باشد
//  ★ بعد SubscriptionPayments فقط برای رکوردهای قدیمی/بدون Online
// ═══════════════════════════════════════════════════════════════
const platformCte = Prisma.sql`
WITH platform_payments AS (

  -- ═══════════════════════════════════════════════════════════
  -- ۱. تراکنش‌های پلتفرم از OnlinePayments
  --    شامل: حمایت، اشتراک زرین‌پال، کارت‌به‌کارت
  -- ═══════════════════════════════════════════════════════════
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

    COALESCE(
      op."type",
      CASE
        WHEN op."gatewayType" = 'manual_card' THEN 'manual_card'
        WHEN LOWER(COALESCE(op.description, '')) LIKE '%donation%' THEN 'donation'
        WHEN LOWER(COALESCE(op.description, '')) LIKE '%subscription%' THEN 'subscription_update'
        ELSE 'unknown'
      END
    ) AS type,

    COALESCE(op."isSandbox", false) AS "isSandbox",

    COALESCE(op."netAmount", op.amount, 0)::float8 AS amount,
    COALESCE(op."grossAmount", op.amount, 0)::float8 AS "grossAmount",
    COALESCE(op."netAmount", op.amount, 0)::float8 AS "netAmount",
    COALESCE(op."fee", 0)::float8 AS "fee",
    op."feeType",

    op.status,
    (op.status = 'paid') AS "isPaid",

    op."gatewayType",
    NULL::text AS "paymentMethod",
    COALESCE(op."refId", op.authority, '') AS "paymentRef",
    op.authority,
    op."refId",
    op.description,

    op."cardPan",
    op."cardHash",
    op."payerAccount",

    op."verifyCode",
    op."verifyMessage",
    op."autoVerify",

    op."inquiryStatus",
    op."inquiryCode",
    op."inquiryMessage",
    op."inquiryAt",

    op."reverseCode",
    op."reverseMessage",
    op."reversedAt",

    op."payerName",
    op."payerMobile",
    op."payerEmail",
    op."payerNote",

    op."createdAt",
    op."paidAt",
    op."verifiedAt",
    op."updatedAt",

    op."settlementStatus",
    op."settlementDate",
    op."settlementReferenceId"

  FROM "OnlinePayments" op
  LEFT JOIN "Tenants" t ON t.id = op."tenantId"

  WHERE
    -- ★ فقط پرداخت‌های پلتفرم، نه پرداخت فاکتور مشتری
    op."invoiceId" IS NULL
    AND (
      op."type" IN ('donation', 'subscription_update', 'manual_card')
      OR op."gatewayType" = 'manual_card'
      OR LOWER(COALESCE(op.description, '')) LIKE '%donation%'
      OR LOWER(COALESCE(op.description, '')) LIKE '%subscription%'
      OR COALESCE(op.description, '') LIKE '%به%روزرسانی%'
      OR COALESCE(op.description, '') LIKE '%اشتراک%'
      OR COALESCE(op.description, '') LIKE '%حمایت%'
    )

  UNION ALL

  -- ═══════════════════════════════════════════════════════════
  -- ۲. تراکنش‌های اشتراک از SubscriptionPayments
  --    فقط اگر معادل آن‌ها در OnlinePayments وجود نداشته باشد
  -- ═══════════════════════════════════════════════════════════
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

    CASE
      WHEN sp."paymentMethod" LIKE 'manual_card%' THEN 'manual_card'
      ELSE 'subscription_update'
    END AS type,

    false AS "isSandbox",

    COALESCE(sp.amount, 0)::float8 AS amount,
    COALESCE(sp.amount, 0)::float8 AS "grossAmount",
    COALESCE(sp.amount, 0)::float8 AS "netAmount",
    0::float8 AS "fee",
    NULL::text AS "feeType",

    sp.status,
    sp."isPaid",

    CASE
      WHEN sp."paymentMethod" LIKE 'zarinpal:%' THEN 'zarinpal'
      WHEN sp."paymentMethod" LIKE 'manual_card:%' THEN 'manual_card'
      ELSE 'unknown'
    END AS "gatewayType",

    sp."paymentMethod",
    COALESCE(sp."paymentRef", '') AS "paymentRef",
    NULL::text AS authority,
    NULL::text AS "refId",
    NULL::text AS description,

    NULL::text AS "cardPan",
    NULL::text AS "cardHash",
    NULL::text AS "payerAccount",

    NULL::int AS "verifyCode",
    NULL::text AS "verifyMessage",
    NULL::boolean AS "autoVerify",

    NULL::text AS "inquiryStatus",
    NULL::int AS "inquiryCode",
    NULL::text AS "inquiryMessage",
    NULL::timestamp AS "inquiryAt",

    NULL::int AS "reverseCode",
    NULL::text AS "reverseMessage",
    NULL::timestamp AS "reversedAt",

    NULL::text AS "payerName",
    NULL::text AS "payerMobile",
    NULL::text AS "payerEmail",
    NULL::text AS "payerNote",

    sp."createdAt",
    sp."paidAt",
    sp."paidAt" AS "verifiedAt",
    NULL::timestamp AS "updatedAt",

    NULL::text AS "settlementStatus",
    NULL::timestamp AS "settlementDate",
    NULL::text AS "settlementReferenceId"

  FROM "SubscriptionPayments" sp
  LEFT JOIN "Tenants" t ON t.id = sp."tenantId"

  WHERE NOT EXISTS (
    SELECT 1
    FROM "OnlinePayments" op2
    WHERE op2."authority" = sp."paymentRef"
       OR op2."refId" = sp."paymentRef"
       OR op2."gatewayId" = sp.id
  )
)
`

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20')))
    const skip = (page - 1) * pageSize

    const status = searchParams.get('status')
    const planFilter = searchParams.get('plan')
    const typeFilter = searchParams.get('type')
    const timeFilter = searchParams.get('time')
    const search = searchParams.get('search')

    const whereFrags: Prisma.Sql[] = []

    // ── فیلتر وضعیت ───────────────────────────────────────
    if (status && status !== 'all') {
      if (status === 'paid') {
        whereFrags.push(Prisma.sql`("isPaid" = true OR "status" = 'paid')`)
      } else if (status === 'pending') {
        whereFrags.push(Prisma.sql`("isPaid" = false AND "status" = 'pending')`)
      } else if (status === 'waiting_review') {
        whereFrags.push(Prisma.sql`"status" = 'waiting_review'`)
      } else if (status === 'failed') {
        whereFrags.push(Prisma.sql`"status" = 'failed'`)
      } else if (status === 'cancelled') {
        whereFrags.push(Prisma.sql`"status" = 'cancelled'`)
      } else if (status === 'rejected') {
        whereFrags.push(Prisma.sql`"status" = 'rejected'`)
      } else if (status === 'reversed') {
        whereFrags.push(Prisma.sql`"status" = 'reversed'`)
      }
    }

    // ── فیلتر نوع تراکنش ──────────────────────────────────
    if (typeFilter && typeFilter !== 'all') {
      whereFrags.push(Prisma.sql`"type" = ${typeFilter}`)
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
            OR COALESCE("authority", '') ILIKE ${like}
            OR COALESCE("refId", '') ILIKE ${like}
            OR COALESCE("cardPan", '') ILIKE ${like}
            OR COALESCE("payerName", '') ILIKE ${like}
            OR COALESCE("payerMobile", '') ILIKE ${like}
            OR COALESCE("payerEmail", '') ILIKE ${like}
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
        whereFrags.push(
          Prisma.sql`COALESCE("paidAt", "verifiedAt", "createdAt") >= ${since}`
        )
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
      ${platformCte}
      SELECT *
      FROM platform_payments
      WHERE ${whereSql}
      ORDER BY COALESCE("paidAt", "verifiedAt", "createdAt") DESC
      LIMIT ${pageSize}::int
      OFFSET ${skip}::int
    `

    // ── شمارش کل ──────────────────────────────────────────
    const countResult = await db.client.$queryRaw<{ count: number }[]>`
      ${platformCte}
      SELECT COUNT(*)::int AS count
      FROM platform_payments
      WHERE ${whereSql}
    `

    const totalCount = Number(countResult[0]?.count || 0)

    // ── آمار کلی ──────────────────────────────────────────
    // ★ درآمد فقط تراکنش‌های غیرتستی/غیرسندباکس حساب می‌شود
    // ★ تراکنش‌های تستی در لیست دیده می‌شوند ولی در درآمد لحاظ نمی‌شوند
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
        totalFee: number
        sandboxCount: number
        sandboxRevenue: number
      }[]
    >`
      ${platformCte}
      SELECT
        COUNT(*) FILTER (
          WHERE ("isPaid" = true OR "status" = 'paid')
            AND "isSandbox" = false
        )::int AS "paidCount",

        COALESCE(
          SUM("netAmount") FILTER (
            WHERE ("isPaid" = true OR "status" = 'paid')
              AND "isSandbox" = false
          ),
          0
        )::float8 AS "totalRevenue",

        COALESCE(
          SUM("netAmount") FILTER (
            WHERE ("isPaid" = true OR "status" = 'paid')
              AND "isSandbox" = false
              AND COALESCE("paidAt", "verifiedAt", "createdAt") >= ${monthStart}
              AND COALESCE("paidAt", "verifiedAt", "createdAt") < ${nextMonthStart}
          ),
          0
        )::float8 AS "monthlyRevenue",

        COUNT(*) FILTER (
          WHERE ("isPaid" = true OR "status" = 'paid')
            AND "isSandbox" = false
            AND COALESCE("paidAt", "verifiedAt", "createdAt") >= ${todayStart}
        )::int AS "todayCount",

        COALESCE(
          SUM("netAmount") FILTER (
            WHERE ("isPaid" = true OR "status" = 'paid')
              AND "isSandbox" = false
              AND COALESCE("paidAt", "verifiedAt", "createdAt") >= ${todayStart}
          ),
          0
        )::float8 AS "todayRevenue",

        COUNT(*) FILTER (
          WHERE "status" = 'waiting_review'
            AND "isSandbox" = false
        )::int AS "pendingReviewCount",

        COALESCE(
          SUM("fee") FILTER (
            WHERE ("isPaid" = true OR "status" = 'paid')
              AND "isSandbox" = false
          ),
          0
        )::float8 AS "totalFee",

        COUNT(*) FILTER (
          WHERE ("isPaid" = true OR "status" = 'paid')
            AND "isSandbox" = true
        )::int AS "sandboxCount",

        COALESCE(
          SUM("netAmount") FILTER (
            WHERE ("isPaid" = true OR "status" = 'paid')
              AND "isSandbox" = true
          ),
          0
        )::float8 AS "sandboxRevenue"

      FROM platform_payments
    `

    const stats = statsResult[0] || {
      paidCount: 0,
      totalRevenue: 0,
      monthlyRevenue: 0,
      todayCount: 0,
      todayRevenue: 0,
      pendingReviewCount: 0,
      totalFee: 0,
      sandboxCount: 0,
      sandboxRevenue: 0,
    }

    // ── فرمت خروجی ────────────────────────────────────────
    const formatted = rows.map((r) => {
      const tierName = extractTier(r)

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

        type: r.type || 'unknown',
        isSandbox: Boolean(r.isSandbox),

        amount: Number(r.amount) || 0,
        grossAmount: Number(r.grossAmount) || Number(r.amount) || 0,
        netAmount: Number(r.netAmount) || Number(r.amount) || 0,
        fee: Number(r.fee) || 0,
        feeType: r.feeType || null,

        status: r.status,
        isPaid: Boolean(r.isPaid),

        gatewayType: r.gatewayType || 'unknown',
        paymentMethod: r.paymentMethod || '',
        paymentRef: r.paymentRef || '',
        authority: r.authority || '',
        refId: r.refId || '',
        description: r.description || '',

        cardPan: r.cardPan || null,
        cardHash: r.cardHash || null,
        payerAccount: r.payerAccount || null,

        verifyCode: r.verifyCode ?? null,
        verifyMessage: r.verifyMessage || '',
        autoVerify: r.autoVerify ?? null,

        inquiryStatus: r.inquiryStatus || '',
        inquiryCode: r.inquiryCode ?? null,
        inquiryMessage: r.inquiryMessage || '',
        inquiryAt: r.inquiryAt,

        reverseCode: r.reverseCode ?? null,
        reverseMessage: r.reverseMessage || '',
        reversedAt: r.reversedAt,

        payerName: r.payerName || '',
        payerMobile: r.payerMobile || '',
        payerEmail: r.payerEmail || '',
        payerNote: r.payerNote || '',

        createdAt: r.createdAt,
        paidAt: r.paidAt,
        verifiedAt: r.verifiedAt,
        updatedAt: r.updatedAt,

        settlementStatus: r.settlementStatus || null,
        settlementDate: r.settlementDate,
        settlementReferenceId: r.settlementReferenceId || null,

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
        totalFee: Number(stats.totalFee) || 0,
        sandboxCount: Number(stats.sandboxCount) || 0,
        sandboxRevenue: Number(stats.sandboxRevenue) || 0,
        avgTransaction:
          Number(stats.paidCount) > 0
            ? Math.round(Number(stats.totalRevenue) / Number(stats.paidCount))
            : 0,
      },
    })
  } catch (error: any) {
    console.error('[Admin Transactions v13.1] Error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'خطا در بارگذاری تراکنش‌ها' },
      { status: 500 }
    )
  }
}