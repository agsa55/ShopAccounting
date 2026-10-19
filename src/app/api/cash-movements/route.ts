// ============================================================================
// src/app/api/cash-movements/route.ts — v12.0 Fiscal Year Isolation + Secure Tenant
// ShopAccounting — Manual Cash Movements API
// ----------------------------------------------------------------------------
// ★★★ v12.0:
//   - رفع مشکل امنیتی tenantId از query/body
//   - استفاده از withTenantAndPermission و tenant.tenantDb
//   - ایزولاسیون سال مالی
//   - clamp بازه تاریخ داخل سال مالی
//   - پشتیبانی از CashMovement.fiscalYearId در صورت وجود
//   - استنتاج جهت تراکنش بدون وابستگی قطعی به فیلد type/direction
//   - صدور سند خودکار با fiscalYearId در صورت پشتیبانی schema
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import {
  clampDateRange,
  inferCashMovementDirection,
  isFieldSupported,
  normalizeToken,
  resolveEffectiveFiscalYear,
  safeNum,
} from '@/lib/fiscal-year-reporting'
import { generateJournalNumber } from '@/lib/journal-number-generator'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const ALL_YEARS_WARNING =
  'این گزارش همه سال‌های مالی را شامل می‌شود و فقط برای بررسی مدیریتی است. برای گزارش رسمی، یک سال مالی انتخاب کنید.'

function emptySummary() {
  return {
    totalSales: 0,
    totalPurchases: 0,
    totalServices: 0,
    totalWithdrawals: 0,
    totalDeposits: 0,
    totalExpenses: 0,
    totalCashIn: 0,
    totalCashOut: 0,
    openingBalance: 0,
    startOfDayBalance: 0,
  }
}

// ═══════════════════════════════════════════════════════════════
// GET: دریافت تراکنش‌های صندوق‌دار
// ═══════════════════════════════════════════════════════════════
export const GET = withTenantAndPermission('pos')(
  async (req: NextRequest, _ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      const { searchParams } = new URL(req.url)

      const cashierId = searchParams.get('cashierId') || tenant.user?.id || null
      const dateParam = searchParams.get('date')
      const transactionType = searchParams.get('type')

      const fiscalYearIdParam = (searchParams.get('fiscalYearId') || '').trim()
      const allYears = searchParams.get('allYears') === 'true'

      let fy: any = null
      let effectiveFiscalYearId: string | null = null

      if (!allYears) {
        try {
          fy = await resolveEffectiveFiscalYear(
            tenantDb,
            tenantId,
            fiscalYearIdParam || null
          )
          effectiveFiscalYearId = fy.id
        } catch (err: any) {
          return NextResponse.json(
            {
              success: false,
              error:
                err?.message ||
                (fiscalYearIdParam
                  ? 'سال مالی انتخابی یافت نشد.'
                  : 'سال مالی فعالی برای این فروشگاه تعریف نشده است.'),
              code: fiscalYearIdParam
                ? 'INVALID_FISCAL_YEAR'
                : 'NO_ACTIVE_FISCAL_YEAR',
            },
            { status: 400 }
          )
        }
      }

      let fromParam: Date | null = null
      let toParam: Date | null = null

      if (dateParam) {
        fromParam = new Date(`${dateParam}T00:00:00`)
        toParam = new Date(`${dateParam}T23:59:59`)

        if (
          Number.isNaN(fromParam.getTime()) ||
          Number.isNaN(toParam.getTime())
        ) {
          return NextResponse.json(
            { success: false, error: 'تاریخ نامعتبر است' },
            { status: 400 }
          )
        }
      }

      const range = clampDateRange(fy, fromParam, toParam)

      const hasCashMovementFiscalYearId = isFieldSupported(
        tenantDb.cashMovement,
        'fiscalYearId'
      )

      const where: any = { tenantId }

      if (cashierId) {
        where.cashierId = cashierId
      }

      if (transactionType) {
        where.transactionType = transactionType
      }

      if (range.from && range.to) {
        where.createdAt = {
          gte: range.from,
          lte: range.to,
        }
      }

      if (effectiveFiscalYearId && hasCashMovementFiscalYearId) {
        where.fiscalYearId = effectiveFiscalYearId
      }

      const movements = range.valid
        ? await tenantDb.cashMovement.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 100,
          })
        : []

      const summary: any = emptySummary()

      for (const m of movements) {
        const amount = safeNum(m.amount)
        const t = normalizeToken(m.transactionType)
        const direction = inferCashMovementDirection(m)

        if (t === 'sale') summary.totalSales += amount
        else if (t === 'purchase') summary.totalPurchases += amount
        else if (t === 'service' || t === 'repair') summary.totalServices += amount
        else if (t === 'withdrawal') summary.totalWithdrawals += amount
        else if (t === 'deposit') summary.totalDeposits += amount
        else if (t === 'expense') summary.totalExpenses += amount

        if (direction === 'in') summary.totalCashIn += amount
        else if (direction === 'out') summary.totalCashOut += amount
      }

      // ─── موجودی اولیه از سند افتتاحیه ─────────────────────
      let openingBalance = 0

      try {
        const openingWhere: any = {
          tenantId,
          sourceType: 'initial_balance',
          isCancelled: false,
          status: 'posted',
        }

        if (
          effectiveFiscalYearId &&
          isFieldSupported(tenantDb.journalEntry, 'fiscalYearId')
        ) {
          openingWhere.fiscalYearId = effectiveFiscalYearId
        }

        const openingEntry = await tenantDb.journalEntry.findFirst({
          where: openingWhere,
          include: { lines: true },
          orderBy: { createdAt: 'desc' },
        })

        if (openingEntry?.lines && openingEntry.lines.length > 0) {
          const accountIds = [
            ...new Set(
              openingEntry.lines
                .map((l: any) => l.accountId)
                .filter(Boolean)
            ),
          ]

          const accounts = await tenantDb.account.findMany({
            where: { id: { in: accountIds } },
            select: { id: true, code: true, name: true },
          })

          const accountMap = new Map(accounts.map((a: any) => [a.id, a]))

          for (const line of openingEntry.lines) {
            const acc = accountMap.get(line.accountId) as any
            if (
              acc &&
              (acc.code === '1010' ||
                normalizeToken(acc.name).includes('صندوق'))
            ) {
              openingBalance =
                safeNum(line.debit) - safeNum(line.credit)
              break
            }
          }
        }
      } catch (err: any) {
        console.warn(
          '[CashMovements v12.0] Opening balance query failed:',
          err?.message
        )
      }

      // ─── موجودی ابتدای روز ────────────────────────────────
      let startOfDayBalance = 0

      try {
        const previousWhere: any = { tenantId }

        if (cashierId) {
          previousWhere.cashierId = cashierId
        }

        const previousCreatedAt: any = {}

        if (range.from) {
          previousCreatedAt.lt = range.from
        }

        if (
          !hasCashMovementFiscalYearId &&
          effectiveFiscalYearId &&
          fy
        ) {
          previousCreatedAt.gte = new Date(fy.startDate)
        }

        if (Object.keys(previousCreatedAt).length > 0) {
          previousWhere.createdAt = previousCreatedAt
        }

        if (
          effectiveFiscalYearId &&
          hasCashMovementFiscalYearId
        ) {
          previousWhere.fiscalYearId = effectiveFiscalYearId
        }

        const previousMovements = range.valid
          ? await tenantDb.cashMovement.findMany({
              where: previousWhere,
              select: {
                amount: true,
                transactionType: true,
              },
            })
          : []

        let previousIn = 0
        let previousOut = 0

        for (const m of previousMovements) {
          const amount = safeNum(m.amount)
          const direction = inferCashMovementDirection(m)

          if (direction === 'in') previousIn += amount
          else if (direction === 'out') previousOut += amount
        }

        startOfDayBalance = openingBalance + previousIn - previousOut
      } catch (err: any) {
        console.warn(
          '[CashMovements v12.0] Start-of-day balance query failed:',
          err?.message
        )
      }

      summary.openingBalance = openingBalance
      summary.startOfDayBalance = startOfDayBalance

      console.log('[CashMovements v12.0] Summary', {
        tenantId,
        cashierId,
        fiscalYearId: effectiveFiscalYearId,
        allYears,
        dateRange: {
          from: range.from?.toISOString() || null,
          to: range.to?.toISOString() || null,
        },
        movementCount: movements.length,
        summary,
      })

      return NextResponse.json({
        success: true,
        fiscalYearId: effectiveFiscalYearId,
        fiscalYearName: fy?.name || null,
        allYears,
        warning: allYears ? ALL_YEARS_WARNING : undefined,
        data: movements,
        summary,
        diagnostics: {
          fiscalYearApplied: Boolean(effectiveFiscalYearId && !allYears),
          requestedFiscalYearId: fiscalYearIdParam || null,
          allYearsRequested: allYears,
          hasCashMovementFiscalYearId,
          dateRangeValid: range.valid,
          dateRange: {
            from: range.from?.toISOString() || null,
            to: range.to?.toISOString() || null,
          },
        },
      })
    } catch (error: any) {
      console.error('[CashMovements v12.0] GET error:', error)

      return NextResponse.json(
        {
          success: false,
          error: 'خطا در دریافت تراکنش‌ها: ' + (error?.message || 'نامشخص'),
        },
        { status: 500 }
      )
    }
  }
)

// ═══════════════════════════════════════════════════════════════
// POST: ثبت تراکنش دستی + صدور سند حسابداری خودکار
// ═══════════════════════════════════════════════════════════════
export const POST = withTenantAndPermission('pos')(
  async (req: NextRequest, _ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      const body = await req.json()

      const cashierId = body.cashierId || tenant.user?.id || null

      if (!body.transactionType) {
        return NextResponse.json(
          { success: false, error: 'نوع تراکنش الزامی است' },
          { status: 400 }
        )
      }

      const amount = safeNum(body.amount)

      if (!amount || amount <= 0) {
        return NextResponse.json(
          { success: false, error: 'مبلغ تراکنش باید بیشتر از صفر باشد' },
          { status: 400 }
        )
      }

      let fy: any = null

      try {
        fy = await resolveEffectiveFiscalYear(tenantDb, tenantId, null)
      } catch (err: any) {
        return NextResponse.json(
          {
            success: false,
            error:
              err?.message ||
              'سال مالی فعالی برای ثبت تراکنش صندوق تعریف نشده است.',
            code: 'NO_ACTIVE_FISCAL_YEAR',
          },
          { status: 400 }
        )
      }

      const type = normalizeToken(body.transactionType)

      let direction: 'in' | 'out' = 'in'

      if (body.type) {
        const explicit = normalizeToken(body.type)
        direction = explicit === 'out' ? 'out' : 'in'
      } else if (
        ['purchase', 'withdrawal', 'expense', 'repair'].includes(type)
      ) {
        direction = 'out'
      }

      const movementData: any = {
        shiftId: null,
        tenantId,
        cashierId,
        transactionType: body.transactionType,
        paymentMethod: body.paymentMethod || 'cash',
        amount,
        type: direction,
        description: body.description || null,
        reason: body.reason || null,
      }

      if (isFieldSupported(tenantDb.cashMovement, 'fiscalYearId')) {
        movementData.fiscalYearId = fy.id
      }

      const movement = await tenantDb.cashMovement.create({
        data: movementData,
      })

      console.log('[CashMovements v12.0] CashMovement created:', {
        id: movement.id,
        tenantId,
        fiscalYearId: fy.id,
        transactionType: movement.transactionType,
        amount: movement.amount,
        direction: movement.type,
      })

      // ─── صدور سند حسابداری خودکار ─────────────────────────
      try {
        const accounts = await tenantDb.account.findMany({
          where: { tenantId, isActive: true },
        })

        let cashAccountId: string | null = null
        let capitalAccountId: string | null = null
        let withdrawalAccountId: string | null = null
        let expenseAccountId: string | null = null

        for (const acc of accounts) {
          const code = acc.code || ''
          const name = normalizeToken(acc.name)

          if (!cashAccountId && (code === '1010' || name.includes('صندوق'))) {
            cashAccountId = acc.id
          }

          if (
            !capitalAccountId &&
            (code === '3000' || name.includes('سرمایه مالک'))
          ) {
            capitalAccountId = acc.id
          }

          if (
            !withdrawalAccountId &&
            (code === '3200' || name.includes('برداشت مالک'))
          ) {
            withdrawalAccountId = acc.id
          }

          if (
            !expenseAccountId &&
            (code === '5170' || name.includes('متفرقه'))
          ) {
            expenseAccountId = acc.id
          }
        }

        let debitAccountId: string | null = null
        let creditAccountId: string | null = null
        let debitDescription = ''
        let creditDescription = ''

        if (type === 'deposit') {
          debitAccountId = cashAccountId
          creditAccountId = capitalAccountId
          debitDescription = 'واریز به صندوق'
          creditDescription = 'سرمایه مالک'
        } else if (type === 'withdrawal') {
          debitAccountId = withdrawalAccountId
          creditAccountId = cashAccountId
          debitDescription = 'برداشت مالک'
          creditDescription = 'برداشت از صندوق'
        } else if (type === 'expense') {
          debitAccountId = expenseAccountId
          creditAccountId = cashAccountId
          debitDescription = 'هزینه متفرقه'
          creditDescription = 'پرداخت از صندوق'
        }

        if (debitAccountId && creditAccountId) {
                 const jeNumber = await generateJournalNumber(tenantDb, tenantId)
          const description =
            body.description || body.reason || 'تراکنش دستی صندوق'

          const lines = [
            {
              accountId: debitAccountId,
              debit: amount,
              credit: 0,
              description: `بدهکار: ${debitDescription} — ${description}`,
            },
            {
              accountId: creditAccountId,
              debit: 0,
              credit: amount,
              description: `بستانکار: ${creditDescription} — ${description}`,
            },
          ]

          const journalData: any = {
            number: jeNumber,
            date: new Date(),
            description: `سند خودکار بابت تراکنش دستی — ${description}`,
            status: 'posted',
            sourceType: 'manual_cash_movement',
            sourceId: movement.id,
            totalDebit: amount,
            totalCredit: amount,
            createdBy: cashierId || null,
            tenantId,
            lines: { create: lines },
          }

          if (isFieldSupported(tenantDb.journalEntry, 'fiscalYearId')) {
            journalData.fiscalYearId = fy.id
          }

          await tenantDb.journalEntry.create({ data: journalData })

          console.log('[CashMovements v12.0] Journal Entry created:', {
            number: jeNumber,
            fiscalYearId: fy.id,
            amount,
            debit: debitDescription,
            credit: creditDescription,
          })
        } else {
          console.warn(
            '[CashMovements v12.0] Cannot create journal - missing account IDs'
          )
        }
      } catch (jeErr: any) {
        console.warn(
          '[CashMovements v12.0] Auto journal failed (non-blocking):',
          jeErr?.message
        )
      }

      return NextResponse.json(
        {
          success: true,
          data: movement,
          fiscalYearId: fy.id,
          fiscalYearName: fy.name,
          message: 'تراکنش با موفقیت ثبت شد و سند حسابداری صادر شد',
        },
        { status: 201 }
      )
    } catch (error: any) {
      console.error('[CashMovements v12.0] POST error:', error)

      return NextResponse.json(
        {
          success: false,
          error: 'خطا در ثبت تراکنش: ' + (error?.message || 'نامشخص'),
        },
        { status: 500 }
      )
    }
  }
)