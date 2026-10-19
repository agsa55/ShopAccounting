// ============================================================================
// src/app/api/journal-entries/route.ts — GET/POST/PUT (v6.0 Fiscal Year Authority)
// ShopAccounting — Journal Entries API
// ============================================================================
// ★ v6.0:
//   - API مرجع تعیین canCreateEntry / canMutateEntry است
//   - GET سال‌مالی‌محور + allYears مدیریتی
//   - بازگشت fiscalYear کامل برای frontend
//   - POST فقط در سال مالی فعال و باز
//   - PUT فقط برای اسناد دستی و در سال مالی فعال و باز
//   - جلوگیری از ویرایش/ثبت/ابطال در سال بسته یا غیرفعال
//   - حذف وابستگی به generateJournalNumber خارجی برای جلوگیری از خطای build
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { requireActiveSubscription } from '@/lib/plan-guard'
import {
  getActiveFiscalYear,
  validateDateInFiscalYear,
} from '@/lib/fiscal-year'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const ALL_YEARS_WARNING =
  'این لیست همه سال‌های مالی را شامل می‌شود و فقط برای بررسی مدیریتی است. برای گزارش رسمی، یک سال مالی انتخاب کنید.'

const NO_ACTIVE_FISCAL_YEAR_WARNING =
  'سال مالی فعالی تعریف نشده است. همه سنوات نمایش داده می‌شود و ثبت سند جدید غیرفعال است.'

const CLOSED_FY_READ_WARNING =
  'سال مالی انتخابی بسته شده است. فقط مشاهده مجاز است و امکان ثبت/ویرایش/ابطال سند وجود ندارد.'

const INACTIVE_FY_READ_WARNING =
  'سال مالی انتخابی فعال نیست. فقط مشاهده مجاز است و امکان ثبت سند جدید وجود ندارد.'

function makeApiError(message: string, status = 400, code = 'ERROR') {
  const err: any = new Error(message)
  err.status = status
  err.code = code
  return err
}

async function lookupAccounts(
  tenantDb: any,
  accountIds: string[],
  tenantId: string
): Promise<Map<string, { code: string; name: string }>> {
  const accountMap = new Map<string, { code: string; name: string }>()

  if (accountIds.length === 0) return accountMap

  try {
    const uniqueIds = [...new Set(accountIds.filter(Boolean))]
    if (uniqueIds.length === 0) return accountMap

    const accounts = await tenantDb.account.findMany({
      where: { id: { in: uniqueIds }, tenantId },
      select: { id: true, code: true, name: true },
    })

    for (const acc of accounts) {
      accountMap.set(acc.id, { code: acc.code || '-', name: acc.name || '-' })
    }
  } catch (err: any) {
    console.warn('[JournalEntries] Account lookup failed:', err?.message)
  }

  return accountMap
}

async function resolveReadContext(
  tenantDb: any,
  tenantId: string,
  fiscalYearIdParam: string | null,
  allYears: boolean
) {
  if (allYears) {
    return {
      fy: null,
      fiscalYearId: null,
      warning: ALL_YEARS_WARNING,
      canCreateEntry: false,
    }
  }

  if (fiscalYearIdParam) {
    const fy = await tenantDb.fiscalYear.findFirst({
      where: {
        id: fiscalYearIdParam,
        tenantId,
      },
    })

    if (!fy) {
      throw makeApiError(
        'سال مالی انتخابی یافت نشد.',
        400,
        'INVALID_FISCAL_YEAR'
      )
    }

    const warning = fy.isClosed
      ? CLOSED_FY_READ_WARNING
      : !fy.isActive
      ? INACTIVE_FY_READ_WARNING
      : null

    return {
      fy,
      fiscalYearId: fy.id,
      warning,
      canCreateEntry: Boolean(fy.isActive && !fy.isClosed),
    }
  }

  let fy: any = null

  try {
    fy = await getActiveFiscalYear(tenantDb, tenantId)
  } catch {
    return {
      fy: null,
      fiscalYearId: null,
      warning: NO_ACTIVE_FISCAL_YEAR_WARNING,
      canCreateEntry: false,
    }
  }

  if (!fy) {
    return {
      fy: null,
      fiscalYearId: null,
      warning: NO_ACTIVE_FISCAL_YEAR_WARNING,
      canCreateEntry: false,
    }
  }

  const warning = fy.isClosed ? CLOSED_FY_READ_WARNING : null

  return {
    fy,
    fiscalYearId: fy.id,
    warning,
    canCreateEntry: Boolean(fy.isActive && !fy.isClosed),
  }
}

async function generateJournalNumberLocal(
  tenantDb: any,
  tenantId: string
): Promise<string> {
  try {
    const count = await tenantDb.journalEntry.count({
      where: { tenantId },
    })

    const suffix = Date.now().toString().slice(-4)
    return `JE-${(count + 1).toString().padStart(6, '0')}-${suffix}`
  } catch {
    return `JE-${Date.now()}`
  }
}

// ═══════════════════════════════════════════════════════════════
// GET /api/journal-entries
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId
      const { searchParams } = new URL(req.url)

      const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
      const limit = Math.min(
        9999,
        Math.max(1, parseInt(searchParams.get('limit') || '50'))
      )
      const type = searchParams.get('type')

      const fiscalYearIdParam = (searchParams.get('fiscalYearId') || '').trim()
      const allYears = searchParams.get('allYears') === 'true'

      let context: any

      try {
        context = await resolveReadContext(
          tenantDb,
          tenantId,
          fiscalYearIdParam || null,
          allYears
        )
      } catch (err: any) {
        return NextResponse.json(
          {
            success: false,
            error: err?.message || 'خطا در تعیین سال مالی',
            code: err?.code || 'FISCAL_YEAR_ERROR',
          },
          { status: err?.status || 400 }
        )
      }

      const fy = context.fy
      const effectiveFiscalYearId: string | null = context.fiscalYearId
      const readWarning: string | null = context.warning
      const canCreateEntry: boolean = Boolean(context.canCreateEntry)

      const baseWhere: any = { tenantId }

      if (effectiveFiscalYearId) {
        baseWhere.fiscalYearId = effectiveFiscalYearId
      }

      const entries: any[] = []
      const skip = (page - 1) * limit

      // ───────────────────────────────────────────────────────
      // ۱) اسناد واقعی از جدول JournalEntry
      // ───────────────────────────────────────────────────────
      try {
        const dbWhere: any = { ...baseWhere }

        if (type === 'manual') {
          dbWhere.sourceType = 'manual'
        }

        let dbEntries: any[] = []
        let supportsJournalFiscalYearId = true

        try {
          dbEntries = await tenantDb.journalEntry.findMany({
            where: dbWhere,
            include: { lines: true },
            orderBy: { date: 'desc' },
            skip,
            take: limit,
          })
        } catch (err: any) {
          const msg = String(err?.message || '')

          if (effectiveFiscalYearId && msg.includes('fiscalYearId')) {
            supportsJournalFiscalYearId = false

            const fallbackWhere: any = { ...dbWhere }
            delete fallbackWhere.fiscalYearId

            try {
              const all = await tenantDb.journalEntry.findMany({
                where: fallbackWhere,
                include: { lines: true },
                orderBy: { date: 'desc' },
                take: 10000,
              })

              // اگر فیلد fiscalYearId پشتیبانی نشود، امکان ایزولاسیون دقیق نیست.
              // در این حالت همه اسناد را برمی‌گردانیم ولی fiscalYearId را null می‌دهیم.
              dbEntries = all.slice(skip, skip + limit)
            } catch {
              dbEntries = await tenantDb.journalEntry
                .findMany({
                  where: fallbackWhere,
                  orderBy: { createdAt: 'desc' },
                  skip,
                  take: limit,
                })
                .catch(() => [])

              dbEntries = dbEntries.map((e: any) => ({ ...e, lines: [] }))
            }
          } else {
            try {
              dbEntries = await tenantDb.journalEntry.findMany({
                where: dbWhere,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
              })

              dbEntries = dbEntries.map((e: any) => ({ ...e, lines: [] }))
            } catch {
              dbEntries = []
            }
          }
        }

        const allAccountIds: string[] = []

        for (const entry of dbEntries) {
          if (entry.lines) {
            for (const line of entry.lines) {
              if (line.accountId) allAccountIds.push(line.accountId)
            }
          }
        }

        const accountMap = await lookupAccounts(
          tenantDb,
          allAccountIds,
          tenantId
        )

        for (const entry of dbEntries) {
          const normalizedSourceType = String(
            entry.sourceType || 'manual'
          ).toLowerCase()

          entries.push({
            id: entry.id,
            number: entry.number,
            entryNumber: entry.number,
            date: entry.date,
            description: entry.description,
            status: String(entry.status || '').toLowerCase(),
            sourceType: normalizedSourceType,
            sourceId: entry.sourceId,
            totalDebit: entry.totalDebit,
            totalCredit: entry.totalCredit,
            fiscalYearId: supportsJournalFiscalYearId
              ? entry.fiscalYearId || effectiveFiscalYearId || null
              : null,
            isSynthetic: false,
            lines: (entry.lines || []).map((line: any) => {
              const acc = accountMap.get(line.accountId)

              return {
                id: line.id,
                accountId: line.accountId,
                accountName: acc?.name || '-',
                accountCode: acc?.code || '-',
                description: line.description,
                debit: line.debit,
                credit: line.credit,
              }
            }),
            isManual: normalizedSourceType === 'manual',
            createdAt: entry.createdAt,
          })
        }
      } catch (err: any) {
        console.warn(
          '[JournalEntries GET] JournalEntry table not available:',
          err?.message
        )
      }

      // ───────────────────────────────────────────────────────
      // ۲) فقط اگر هیچ سند واقعی نبود، اسناد نمایشی از فاکتور/پرداخت اضافه شود
      // ★ این اسناد synthetic هستند و قابل ویرایش/لغو/ثبت نهایی نیستند
      // ───────────────────────────────────────────────────────
      if (type !== 'manual' && entries.length === 0) {
        // فاکتورهای فروش
        try {
          const invoiceWhere: any = {
            tenantId,
            status: 'confirmed',
          }

          if (effectiveFiscalYearId) {
            invoiceWhere.fiscalYearId = effectiveFiscalYearId
          }

          let invoices: any[] = []

          try {
            invoices = await tenantDb.invoice.findMany({
              where: invoiceWhere,
              select: {
                id: true,
                number: true,
                paymentType: true,
                subTotal: true,
                discountAmount: true,
                taxAmount: true,
                totalAmount: true,
                paidAmount: true,
                remainingAmount: true,
                customerId: true,
                fiscalYearId: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'desc' },
              skip,
              take: limit,
            })
          } catch (err: any) {
            const msg = String(err?.message || '')

            if (effectiveFiscalYearId && msg.includes('fiscalYearId')) {
              delete invoiceWhere.fiscalYearId

              if (fy) {
                invoiceWhere.createdAt = {
                  gte: new Date(fy.startDate),
                  lte: new Date(fy.endDate),
                }
              }

              invoices = await tenantDb.invoice
                .findMany({
                  where: invoiceWhere,
                  select: {
                    id: true,
                    number: true,
                    paymentType: true,
                    subTotal: true,
                    discountAmount: true,
                    taxAmount: true,
                    totalAmount: true,
                    paidAmount: true,
                    remainingAmount: true,
                    customerId: true,
                    fiscalYearId: true,
                    createdAt: true,
                  },
                  orderBy: { createdAt: 'desc' },
                  skip,
                  take: limit,
                })
                .catch(() => [])
            }
          }

          for (const inv of invoices) {
            entries.push({
              id: `je-inv-${inv.id}-debit`,
              number: `INV-${inv.number}`,
              entryNumber: `INV-${inv.number}`,
              date: inv.createdAt,
              description: `فروش - فاکتور ${inv.number}`,
              status: 'posted',
              sourceType: 'invoice',
              sourceId: inv.id,
              fiscalYearId:
                inv.fiscalYearId || effectiveFiscalYearId || null,
              isSynthetic: true,
              lines: [
                {
                  accountCode: '1200',
                  accountName: 'حساب‌های دریافتنی',
                  debit: inv.totalAmount,
                  credit: 0,
                },
                {
                  accountCode: '4100',
                  accountName: 'فروش',
                  debit: 0,
                  credit: inv.totalAmount,
                },
              ],
              totalDebit: inv.totalAmount,
              totalCredit: inv.totalAmount,
              isManual: false,
              createdAt: inv.createdAt,
            })
          }
        } catch {
          /* ignore */
        }

        // پرداخت‌های فاکتور
        try {
          const paymentWhere: any = { tenantId }

          if (effectiveFiscalYearId) {
            paymentWhere.invoice = {
              is: {
                fiscalYearId: effectiveFiscalYearId,
              },
            }
          }

          let payments: any[] = []

          try {
            payments = await tenantDb.invoicePayment.findMany({
              where: paymentWhere,
              select: {
                id: true,
                invoiceId: true,
                amount: true,
                paymentType: true,
                paymentRef: true,
                paidAt: true,
                invoice: {
                  select: {
                    fiscalYearId: true,
                  },
                },
              },
              orderBy: { paidAt: 'desc' },
              skip,
              take: limit,
            })
          } catch (err: any) {
            const msg = String(err?.message || '')

            if (effectiveFiscalYearId && msg.includes('fiscalYearId')) {
              delete paymentWhere.invoice

              if (fy) {
                paymentWhere.paidAt = {
                  gte: new Date(fy.startDate),
                  lte: new Date(fy.endDate),
                }
              }

              payments = await tenantDb.invoicePayment
                .findMany({
                  where: paymentWhere,
                  select: {
                    id: true,
                    invoiceId: true,
                    amount: true,
                    paymentType: true,
                    paymentRef: true,
                    paidAt: true,
                  },
                  orderBy: { paidAt: 'desc' },
                  skip,
                  take: limit,
                })
                .catch(() => [])
            }
          }

          for (const pay of payments) {
            entries.push({
              id: `je-pay-${pay.id}`,
              number: `PAY-${pay.id ? pay.id.slice(0, 8) : Date.now()}`,
              entryNumber: `PAY-${pay.id ? pay.id.slice(0, 8) : Date.now()}`,
              date: pay.paidAt,
              description: `دریافت/پرداخت - ${pay.paymentType || 'نقدی'}`,
              status: 'posted',
              sourceType: 'payment',
              sourceId: pay.id,
              fiscalYearId:
                (pay as any).invoice?.fiscalYearId ||
                effectiveFiscalYearId ||
                null,
              isSynthetic: true,
              lines: [
                {
                  accountCode: '1100',
                  accountName: 'صندوق',
                  debit: pay.amount,
                  credit: 0,
                },
                {
                  accountCode: '1200',
                  accountName: 'حساب‌های دریافتنی',
                  debit: 0,
                  credit: pay.amount,
                },
              ],
              totalDebit: pay.amount,
              totalCredit: pay.amount,
              isManual: false,
              createdAt: pay.paidAt,
            })
          }
        } catch {
          /* ignore */
        }
      }

      let filtered = entries

      if (type === 'income') {
        filtered = entries.filter((e) => Number(e.totalDebit || 0) > 0)
      } else if (type === 'expense') {
        filtered = entries.filter((e) => Number(e.totalCredit || 0) > 0)
      } else if (type === 'manual') {
        filtered = entries.filter((e) => e.isManual === true)
      }

      filtered.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      )

      const fiscalYearPayload = fy
        ? {
            id: fy.id,
            name: fy.name,
            startDate: fy.startDate,
            endDate: fy.endDate,
            isActive: Boolean(fy.isActive),
            isClosed: Boolean(fy.isClosed),
          }
        : null

      return NextResponse.json({
        success: true,
        data: {
          entries: filtered.slice(0, limit),
          total: filtered.length,
          page,
          limit,
        },
        fiscalYearId: effectiveFiscalYearId,
        fiscalYearName: fy?.name || null,
        fiscalYear: fiscalYearPayload,
        allYears,
        warning: readWarning || (allYears ? ALL_YEARS_WARNING : undefined),
        canCreateEntry,
        canMutateEntry: canCreateEntry,
        diagnostics: {
          fiscalYearApplied: Boolean(effectiveFiscalYearId && !allYears),
          requestedFiscalYearId: fiscalYearIdParam || null,
          allYearsRequested: allYears,
          entryCount: filtered.length,
        },
      })
    } catch (error: any) {
      console.error('[JournalEntries GET] Error:', error)

      return NextResponse.json(
        {
          success: false,
          error: error?.message || 'خطا در بارگذاری اسناد حسابداری',
          code: error?.code || 'UNKNOWN',
        },
        { status: error?.status || 500 }
      )
    }
  }
)

// ═══════════════════════════════════════════════════════════════
// POST /api/journal-entries — ایجاد سند دستی
// ═══════════════════════════════════════════════════════════════

export const POST = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const subCheck = await requireActiveSubscription(tenant.tenantId)

      if (!subCheck.active) {
        return NextResponse.json(
          { success: false, error: subCheck.message },
          { status: 403 }
        )
      }

      const planTier = tenant.planTierName || 'simple'

      if (!['professional', 'enterprise'].includes(planTier)) {
        return NextResponse.json(
          {
            success: false,
            error:
              'سند حسابداری دستی فقط در پلن حرفه‌ای و سازمانی در دسترس است. لطفاً پلن خود را ارتقا دهید.',
            code: 'PLAN_FEATURE_RESTRICTED',
          },
          { status: 403 }
        )
      }

      if (!['Manager', 'Admin', 'Owner'].includes(tenant.user?.role)) {
        return NextResponse.json(
          {
            success: false,
            error: 'فقط مدیران اجازه ایجاد سند حسابداری را دارند',
          },
          { status: 403 }
        )
      }

      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId
      const body = await req.json()

      if (!body.lines || !Array.isArray(body.lines) || body.lines.length < 2) {
        return NextResponse.json(
          { success: false, error: 'حداقل دو ردیف سند الزامی است' },
          { status: 400 }
        )
      }

      let hasDebit = false
      let hasCredit = false

      for (const line of body.lines) {
        const debit = Number(line.debit || 0)
        const credit = Number(line.credit || 0)

        if (!Number.isFinite(debit) || debit < 0) {
          return NextResponse.json(
            { success: false, error: 'مبلغ بدهکار نامعتبر است' },
            { status: 400 }
          )
        }

        if (!Number.isFinite(credit) || credit < 0) {
          return NextResponse.json(
            { success: false, error: 'مبلغ بستانکار نامعتبر است' },
            { status: 400 }
          )
        }

        if (debit > 0 && credit > 0) {
          return NextResponse.json(
            {
              success: false,
              error: 'یک ردیف نمی‌تواند همزمان بدهکار و بستانکار باشد',
            },
            { status: 400 }
          )
        }

        if (debit > 0) hasDebit = true
        if (credit > 0) hasCredit = true
      }

      if (!hasDebit || !hasCredit) {
        return NextResponse.json(
          {
            success: false,
            error:
              'سند باید حداقل یک ردیف بدهکار و یک ردیف بستانکار داشته باشد',
          },
          { status: 400 }
        )
      }

      const requestedFiscalYearId =
        typeof body.fiscalYearId === 'string'
          ? body.fiscalYearId.trim()
          : null

      let fy: any = null

      if (requestedFiscalYearId) {
        fy = await tenantDb.fiscalYear.findFirst({
          where: {
            id: requestedFiscalYearId,
            tenantId,
          },
        })

        if (!fy) {
          return NextResponse.json(
            { success: false, error: 'سال مالی انتخابی یافت نشد.' },
            { status: 400 }
          )
        }
      } else {
        try {
          fy = await getActiveFiscalYear(tenantDb, tenantId)
        } catch (err: any) {
          return NextResponse.json(
            {
              success: false,
              error: err?.message || 'سال مالی فعالی یافت نشد.',
              code: 'NO_ACTIVE_FISCAL_YEAR',
            },
            { status: 400 }
          )
        }
      }

      if (!fy) {
        return NextResponse.json(
          {
            success: false,
            error: 'سال مالی معتبری برای ثبت سند یافت نشد.',
            code: 'NO_VALID_FISCAL_YEAR',
          },
          { status: 400 }
        )
      }

      // ★ استاندارد حسابداری: ثبت سند جدید فقط در سال مالی فعال و باز
      if (!fy.isActive) {
        return NextResponse.json(
          {
            success: false,
            error: `سال مالی «${fy.name}» فعال نیست و امکان ثبت سند جدید وجود ندارد.`,
            code: 'FISCAL_YEAR_NOT_ACTIVE',
          },
          { status: 400 }
        )
      }

      if (fy.isClosed) {
        return NextResponse.json(
          {
            success: false,
            error: `سال مالی «${fy.name}» بسته شده است و امکان ثبت سند جدید وجود ندارد.`,
            code: 'FISCAL_YEAR_CLOSED',
          },
          { status: 400 }
        )
      }

      const entryDate = body.date ? new Date(body.date) : new Date()

      if (Number.isNaN(entryDate.getTime())) {
        return NextResponse.json(
          { success: false, error: 'تاریخ سند نامعتبر است' },
          { status: 400 }
        )
      }

      try {
        validateDateInFiscalYear(entryDate, fy)
      } catch (dateErr: any) {
        return NextResponse.json(
          {
            success: false,
            error:
              dateErr?.message ||
              'تاریخ سند خارج از سال مالی انتخابی است.',
            code: 'DATE_OUT_OF_FISCAL_YEAR',
          },
          { status: 400 }
        )
      }

      const totalDebit = body.lines.reduce(
        (sum: number, l: any) => sum + (Number(l.debit) || 0),
        0
      )

      const totalCredit = body.lines.reduce(
        (sum: number, l: any) => sum + (Number(l.credit) || 0),
        0
      )

      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        return NextResponse.json(
          {
            success: false,
            error: `سند تراز نیست. جمع بدهکار: ${totalDebit}, جمع بستانکار: ${totalCredit}`,
          },
          { status: 400 }
        )
      }

      const accountIds = body.lines
        .map((l: any) => l.accountId)
        .filter(Boolean)

      if (accountIds.length > 0) {
        const accountMap = await lookupAccounts(tenantDb, accountIds, tenantId)

        for (const line of body.lines) {
          if (line.accountId && !accountMap.has(line.accountId)) {
            return NextResponse.json(
              {
                success: false,
                error: `حساب با شناسه ${line.accountId} یافت نشد`,
              },
              { status: 400 }
            )
          }
        }
      }

      const rawStatus = String(body.status || 'draft').toLowerCase()
      const allowedStatuses = ['draft', 'posted']

      if (!allowedStatuses.includes(rawStatus)) {
        return NextResponse.json(
          {
            success: false,
            error: `وضعیت نامعتبر. مقادیر مجاز: ${allowedStatuses.join(', ')}`,
          },
          { status: 400 }
        )
      }

      const journalNumber = await generateJournalNumberLocal(
        tenantDb,
        tenantId
      )

      const baseCreateData: any = {
        number: journalNumber,
        date: entryDate,
        description: body.description || 'سند حسابداری دستی',
        status: rawStatus,
        sourceType: 'manual',
        sourceId: null,
        totalDebit,
        totalCredit,
        createdBy: tenant.user?.id || null,
        tenantId,
        lines: {
          create: body.lines.map((line: any) => ({
            accountId: line.accountId || null,
            description: line.description || null,
            debit: Number(line.debit) || 0,
            credit: Number(line.credit) || 0,
          })),
        },
      }

      let journalEntry: any

      try {
        journalEntry = await tenantDb.journalEntry.create({
          data: {
            ...baseCreateData,
            fiscalYearId: fy.id,
          },
          include: { lines: true },
        })
      } catch (err: any) {
        const msg = String(err?.message || '')

        // fallback امن اگر schema هنوز fiscalYearId را نداشت
        if (msg.includes('fiscalYearId')) {
          journalEntry = await tenantDb.journalEntry.create({
            data: baseCreateData,
            include: { lines: true },
          })
        } else {
          throw err
        }
      }

      const lineAccountIds = journalEntry.lines
        .map((l: any) => l.accountId)
        .filter(Boolean)

      const accountMap = await lookupAccounts(
        tenantDb,
        lineAccountIds,
        tenantId
      )

      return NextResponse.json(
        {
          success: true,
          data: {
            id: journalEntry.id,
            number: journalEntry.number,
            entryNumber: journalEntry.number,
            date: journalEntry.date,
            description: journalEntry.description,
            status: journalEntry.status,
            sourceType: journalEntry.sourceType,
            totalDebit: journalEntry.totalDebit,
            totalCredit: journalEntry.totalCredit,
            fiscalYearId: journalEntry.fiscalYearId || fy.id,
            fiscalYearName: fy.name,
            isSynthetic: false,
            lines: journalEntry.lines.map((line: any) => {
              const acc = accountMap.get(line.accountId)

              return {
                id: line.id,
                accountId: line.accountId,
                accountName: acc?.name || '-',
                accountCode: acc?.code || '-',
                description: line.description,
                debit: line.debit,
                credit: line.credit,
              }
            }),
            createdAt: journalEntry.createdAt,
          },
          message: 'سند حسابداری با موفقیت ایجاد شد',
        },
        { status: 201 }
      )
    } catch (error: any) {
      console.error('[JournalEntries POST] Error:', error)

      return NextResponse.json(
        {
          success: false,
          error: error?.message || 'خطا در ایجاد سند حسابداری',
          code: error?.code || 'UNKNOWN',
        },
        { status: error?.status || 500 }
      )
    }
  }
)

// ═══════════════════════════════════════════════════════════════
// PUT /api/journal-entries — ویرایش وضعیت/توضیحات سند
// ═══════════════════════════════════════════════════════════════

export const PUT = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      if (!['Manager', 'Admin', 'Owner'].includes(tenant.user?.role)) {
        return NextResponse.json(
          {
            success: false,
            error: 'فقط مدیران اجازه تغییر وضعیت سند را دارند',
          },
          { status: 403 }
        )
      }

      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId
      const body = await req.json()

      if (!body.id) {
        return NextResponse.json(
          { success: false, error: 'شناسه سند الزامی است' },
          { status: 400 }
        )
      }

      const existing = await tenantDb.journalEntry.findFirst({
        where: { id: body.id, tenantId },
        select: {
          id: true,
          fiscalYearId: true,
          date: true,
          status: true,
          sourceType: true,
        },
      })

      if (!existing) {
        return NextResponse.json(
          { success: false, error: 'سند یافت نشد' },
          { status: 404 }
        )
      }

      if (String(existing.status || '').toLowerCase() === 'cancelled') {
        return NextResponse.json(
          { success: false, error: 'سند لغوشده قابل ویرایش نیست' },
          { status: 400 }
        )
      }

      // ★ اسناد خودکار فقط از طریق ماژول منبع خود قابل اصلاح هستند
      if (existing.sourceType && existing.sourceType !== 'manual') {
        return NextResponse.json(
          {
            success: false,
            error: `این سند خودکار است و قابل ویرایش دستی نیست. منبع: ${existing.sourceType}`,
            code: 'AUTO_ENTRY_NOT_EDITABLE',
          },
          { status: 400 }
        )
      }

      let fy: any = null

      if (existing.fiscalYearId) {
        fy = await tenantDb.fiscalYear.findFirst({
          where: {
            id: existing.fiscalYearId,
            tenantId,
          },
        })
      }

      if (!fy) {
        try {
          fy = await getActiveFiscalYear(tenantDb, tenantId)
        } catch (err: any) {
          return NextResponse.json(
            {
              success: false,
              error: err?.message || 'سال مالی فعالی یافت نشد.',
              code: 'NO_ACTIVE_FISCAL_YEAR',
            },
            { status: 400 }
          )
        }
      }

      if (!fy) {
        return NextResponse.json(
          {
            success: false,
            error: 'سال مالی معتبری برای ویرایش سند یافت نشد.',
            code: 'NO_VALID_FISCAL_YEAR',
          },
          { status: 400 }
        )
      }

      if (!fy.isActive) {
        return NextResponse.json(
          {
            success: false,
            error: `سال مالی «${fy.name}» فعال نیست و امکان ویرایش سند وجود ندارد.`,
            code: 'FISCAL_YEAR_NOT_ACTIVE',
          },
          { status: 400 }
        )
      }

      if (fy.isClosed) {
        return NextResponse.json(
          {
            success: false,
            error: `سال مالی «${fy.name}» بسته شده است و امکان ویرایش سند وجود ندارد.`,
            code: 'FISCAL_YEAR_CLOSED',
          },
          { status: 400 }
        )
      }

      const updateData: Record<string, any> = {
        fiscalYearId: fy.id,
      }

      if (body.status !== undefined) {
        const nextStatus = String(body.status).toLowerCase()
        const allowedStatuses = ['draft', 'posted']

        if (!allowedStatuses.includes(nextStatus)) {
          return NextResponse.json(
            {
              success: false,
              error: `وضعیت نامعتبر. مقادیر مجاز: ${allowedStatuses.join(', ')}`,
            },
            { status: 400 }
          )
        }

        if (nextStatus === 'posted') {
          try {
            validateDateInFiscalYear(existing.date, fy)
          } catch (dateErr: any) {
            return NextResponse.json(
              {
                success: false,
                error:
                  dateErr?.message ||
                  'تاریخ سند خارج از سال مالی انتخابی است.',
                code: 'DATE_OUT_OF_FISCAL_YEAR',
              },
              { status: 400 }
            )
          }
        }

        updateData.status = nextStatus
      }

      if (body.description !== undefined) {
        updateData.description = body.description
      }

      await tenantDb.journalEntry.update({
        where: { id: body.id },
        data: updateData,
      })

      return NextResponse.json({
        success: true,
        message: 'سند با موفقیت بروزرسانی شد',
        fiscalYearId: fy.id,
        fiscalYearName: fy.name,
      })
    } catch (error: any) {
      console.error('[JournalEntries PUT] Error:', error)

      return NextResponse.json(
        {
          success: false,
          error: error?.message || 'خطا در بروزرسانی سند',
          code: error?.code || 'UNKNOWN',
        },
        { status: error?.status || 500 }
      )
    }
  }
)