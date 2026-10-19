// ============================================================================
// src/app/api/checks/route.ts — v12.0 Fiscal Year Aware Checks
// ShopAccounting — Checks API
// ============================================================================
// ★ v12.0:
//   - GET سال‌مالی‌محور + نمایش چک‌های معوق سنوات قبل با سررسید داخل سال انتخابی
//   - allYears مدیریتی با warning
//   - POST فقط در سال مالی فعال و باز
//   - تاریخ صدور داخل سال مالی فعال اعتبارسنجی می‌شود
//   - تاریخ سررسید می‌تواند بعد از سال مالی باشد
//   - PUT ویرایش فقط اگر سال مالی خود چک باز باشد
//   - DELETE فقط چک pending و سال مالی باز
//   - تغییر وضعیت سند را در سال مالی فعال فعلی صادر می‌کند
//   - بازگشت per-check flags: canEdit / canDelete / canChangeStatus
//   - حذف وابستگی ناامن به tenantId از query/header
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getActiveFiscalYear } from '@/lib/fiscal-year'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const ALL_YEARS_WARNING =
  'این لیست همه سال‌های مالی را شامل می‌شود و فقط برای بررسی مدیریتی است. برای ثبت/ویرایش رسمی، یک سال مالی فعال انتخاب کنید.'

const NO_ACTIVE_FISCAL_YEAR_WARNING =
  'سال مالی فعالی تعریف نشده است. فقط مشاهده کلی ممکن است و ثبت/ویرایش غیرفعال است.'

const CLOSED_FY_WARNING =
  'سال مالی انتخابی بسته شده است. فقط مشاهده مجاز است.'

const INACTIVE_FY_WARNING =
  'سال مالی انتخابی فعال نیست. فقط مشاهده مجاز است.'

const VALID_CHECK_STATUSES = [
  'pending',
  'deposited',
  'cleared',
  'bounced',
  'returned',
]

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function toSafeNumber(value: any): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return Math.round(value)
  if (typeof value === 'string') return Math.round(parseFloat(value) || 0)

  if (typeof value?.toString === 'function') {
    return Math.round(parseFloat(value.toString()) || 0)
  }

  return Math.round(Number(value) || 0)
}

function normalizeStatus(value: any): string {
  return String(value || '')
    .toLowerCase()
    .trim()
}

function parseDate(value: any): Date | null {
  if (!value) return null

  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null

  // برای جلوگیری از مشکلات timezone، ظهر همان روز را در نظر می‌گیریم
  d.setHours(12, 0, 0, 0)
  return d
}

function startOfDay(value: any): Date | null {
  const d = parseDate(value)
  if (!d) return null
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfDay(value: any): Date | null {
  const d = parseDate(value)
  if (!d) return null
  d.setHours(23, 59, 59, 999)
  return d
}

function isDateInRange(date: Date | null, start: Date | null, end: Date | null): boolean {
  if (!date) return false
  if (start && date < start) return false
  if (end && date > end) return false
  return true
}

function buildFiscalYearPayload(fy: any) {
  if (!fy) return null

  return {
    id: fy.id || null,
    name: fy.name || null,
    startDate: fy.startDate || null,
    endDate: fy.endDate || null,
    isActive: Boolean(fy.isActive),
    isClosed: Boolean(fy.isClosed),
  }
}

async function generateJournalNumberLocal(tx: any, tenantId: string): Promise<string> {
  try {
    const count = await tx.journalEntry.count({ where: { tenantId } })
    const suffix = Date.now().toString().slice(-4)
    return `JE-${(count + 1).toString().padStart(6, '0')}-${suffix}`
  } catch {
    return `JE-${Date.now()}`
  }
}

async function findFiscalYearById(tenantDb: any, tenantId: string, id: string | null) {
  if (!id) return null

  try {
    return await tenantDb.fiscalYear.findFirst({
      where: { id, tenantId },
    })
  } catch {
    return null
  }
}

async function findActiveFiscalYear(tenantDb: any, tenantId: string) {
  try {
    return await tenantDb.fiscalYear.findFirst({
      where: {
        tenantId,
        isActive: true,
        isClosed: false,
      },
      orderBy: {
        startDate: 'desc',
      },
    })
  } catch {
    try {
      return await getActiveFiscalYear(tenantDb, tenantId)
    } catch {
      return null
    }
  }
}

async function findAllFiscalYears(tenantDb: any, tenantId: string) {
  try {
    return await tenantDb.fiscalYear.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        isActive: true,
        isClosed: true,
      },
    })
  } catch {
    return []
  }
}

async function findChecksSafe(tenantDb: any, where: any) {
  const include = {
    customer: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        mobile: true,
      },
    },
  }

  const orderBy = { dueDate: 'asc' as const }

  // تلاش اول با include customer
  try {
    return await tenantDb.check.findMany({ where, include, orderBy })
  } catch (err: any) {
    const msg = String(err?.message || '')

    // اگر include customer مشکل داشت، بدون include تلاش کن
    if (msg.includes('customer') || msg.includes('Unknown argument')) {
      try {
        return await tenantDb.check.findMany({ where, orderBy })
      } catch (err2: any) {
        const msg2 = String(err2?.message || '')

        // اگر فیلدهای سال مالی/تاریخ پشتیبانی نشدند، fallback امن
        if (
          msg2.includes('fiscalYearId') ||
          msg2.includes('issueDate') ||
          msg2.includes('dueDate') ||
          msg2.includes('OR')
        ) {
          const fallbackWhere: any = { tenantId: where.tenantId }
          if (where.type) fallbackWhere.type = where.type
          if (where.status) fallbackWhere.status = where.status

          try {
            return await tenantDb.check.findMany({
              where: fallbackWhere,
              orderBy,
            })
          } catch {
            return []
          }
        }

        return []
      }
    }

    // اگر فیلد fiscalYearId یا OR مشکل داشت
    if (
      msg.includes('fiscalYearId') ||
      msg.includes('issueDate') ||
      msg.includes('OR')
    ) {
      const fallbackWhere: any = { tenantId: where.tenantId }
      if (where.type) fallbackWhere.type = where.type
      if (where.status) fallbackWhere.status = where.status

      try {
        return await tenantDb.check.findMany({
          where: fallbackWhere,
          include,
          orderBy,
        })
      } catch {
        try {
          return await tenantDb.check.findMany({
            where: fallbackWhere,
            orderBy,
          })
        } catch {
          return []
        }
      }
    }

    console.warn('[Checks GET] findMany error:', msg)
    return []
  }
}

function extractInvoiceNumber(description: any): string | null {
  if (!description) return null

  const match = String(description).match(/فاکتور\s+([A-Z0-9-]+)/i)
  return match ? match[1] : null
}

function getAllowedStatusTransitions(type: string, currentStatus: string): string[] {
  const status = normalizeStatus(currentStatus)

  if (status === 'cleared' || status === 'returned') return []

  if (type === 'receivable') {
    if (status === 'pending') {
      return ['deposited', 'cleared', 'bounced', 'returned']
    }

    if (status === 'deposited') {
      return ['cleared', 'bounced', 'returned']
    }

    if (status === 'bounced') {
      return ['cleared', 'returned']
    }

    return []
  }

  // payable
  if (status === 'pending') {
    return ['cleared', 'bounced', 'returned']
  }

  if (status === 'bounced') {
    return ['cleared', 'returned']
  }

  return []
}

// ═══════════════════════════════════════════════════════════════
// GET /api/checks
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId
      const { searchParams } = new URL(req.url)

      const typeParam = (searchParams.get('type') || 'all')
        .trim()
        .toLowerCase()

      const statusParam = (searchParams.get('status') || 'all')
        .trim()
        .toLowerCase()

      const fiscalYearIdParam = (searchParams.get('fiscalYearId') || '').trim()
      let allYears = searchParams.get('allYears') === 'true'

      const activeFy = await findActiveFiscalYear(tenantDb, tenantId)

      let selectedFy: any = null
      let effectiveFiscalYearId: string | null = null
      let warning: string | null = null

      if (allYears) {
        selectedFy = null
        effectiveFiscalYearId = null
        warning = ALL_YEARS_WARNING
      } else if (fiscalYearIdParam) {
        selectedFy = await findFiscalYearById(
          tenantDb,
          tenantId,
          fiscalYearIdParam
        )

        if (!selectedFy) {
          return NextResponse.json(
            {
              success: false,
              error: 'سال مالی انتخابی یافت نشد.',
              code: 'INVALID_FISCAL_YEAR',
            },
            { status: 400 }
          )
        }

        effectiveFiscalYearId = selectedFy.id

        if (selectedFy.isClosed) {
          warning = CLOSED_FY_WARNING
        } else if (!selectedFy.isActive) {
          warning = INACTIVE_FY_WARNING
        }
      } else {
        selectedFy = activeFy

        if (!selectedFy) {
          allYears = true
          effectiveFiscalYearId = null
          warning = NO_ACTIVE_FISCAL_YEAR_WARNING
        } else {
          effectiveFiscalYearId = selectedFy.id

          if (selectedFy.isClosed) {
            warning = CLOSED_FY_WARNING
          } else if (!selectedFy.isActive) {
            warning = INACTIVE_FY_WARNING
          }
        }
      }

      const canCreateCheck = Boolean(
        !allYears &&
          selectedFy &&
          selectedFy.isActive &&
          !selectedFy.isClosed
      )

      const canChangeStatusGlobally = Boolean(
        activeFy && !activeFy.isClosed
      )

      // ★ مهم‌ترین اصلاح:
      // به جای استفاده از OR/تاریخ/فیلدهای ممکن در Prisma،
      // همه چک‌های tenant را می‌گیریم و فیلتر سال مالی را در JS انجام می‌دهیم.
      // این کار از خالی شدن لیست به دلیل نبود فیلد issueDate/fiscalYearId جلوگیری می‌کند.
      const allChecksRaw = await findChecksSafe(tenantDb, {
        tenantId,
      })

      const fiscalYears = await findAllFiscalYears(tenantDb, tenantId)
      const fyMap = new Map<string, any>(
        (fiscalYears || []).map((fy: any) => [String(fy.id), fy])
      )

      const fyStart = selectedFy ? startOfDay(selectedFy.startDate) : null
      const fyEnd = selectedFy ? endOfDay(selectedFy.endDate) : null

      const isVisibleInSelectedFiscalYear = (check: any): boolean => {
        if (!selectedFy) return true

        const checkFyId = check?.fiscalYearId
          ? String(check.fiscalYearId)
          : null

        // چک‌هایی که مستقیماً به همین سال مالی تعلق دارند
        if (checkFyId && checkFyId === String(selectedFy.id)) {
          return true
        }

        const issueDate = parseDate(check?.issueDate || check?.createdAt)
        const dueDate = parseDate(check?.dueDate)

        // چک‌های legacy بدون fiscalYearId:
        // اگر تاریخ صدور یا سررسید داخل سال مالی انتخابی بود، نمایش داده می‌شوند.
        if (!checkFyId) {
          if (isDateInRange(issueDate, fyStart, fyEnd)) return true
          if (isDateInRange(dueDate, fyStart, fyEnd)) return true
        }

        // چک‌های معوق/نزد بانک از سنوات قبل که سررسیدشان داخل سال مالی انتخابی است
        const st = normalizeStatus(check?.status)
        if (
          (st === 'pending' || st === 'deposited') &&
          isDateInRange(dueDate, fyStart, fyEnd)
        ) {
          return true
        }

        return false
      }

      const checks = (allChecksRaw || [])
        .filter((check: any) => {
          const checkType = String(check?.type || '')
            .toLowerCase()
            .trim()

          const checkStatus = normalizeStatus(check?.status)

          if (typeParam !== 'all' && checkType !== typeParam) {
            return false
          }

          if (statusParam !== 'all' && checkStatus !== statusParam) {
            return false
          }

          if (!allYears && selectedFy) {
            return isVisibleInSelectedFiscalYear(check)
          }

          return true
        })
        .map((check: any) => {
          const checkFy = check?.fiscalYearId
            ? fyMap.get(String(check.fiscalYearId))
            : null

          const ownFyOpen = check?.fiscalYearId
            ? Boolean(checkFy && !checkFy.isClosed)
            : Boolean(activeFy && !activeFy.isClosed)

          const isPending = normalizeStatus(check?.status) === 'pending'

          const canEdit = Boolean(ownFyOpen && isPending)
          const canDelete = Boolean(ownFyOpen && isPending)

          const canChangeStatus = Boolean(
            canChangeStatusGlobally &&
              !['cleared', 'returned'].includes(
                normalizeStatus(check?.status)
              )
          )

          const invoiceNumber = extractInvoiceNumber(check?.description)

          return {
            ...check,
            invoiceNumber,
            customerName: check?.customer
              ? `${check.customer.firstName || ''} ${
                  check.customer.lastName || ''
                }`
                  .trim()
              : null,
            fiscalYearName: checkFy?.name || null,
            canEdit,
            canDelete,
            canChangeStatus,
          }
        })

      return NextResponse.json({
        success: true,
        fiscalYearId: effectiveFiscalYearId,
        fiscalYearName: selectedFy?.name || null,
        fiscalYear: buildFiscalYearPayload(selectedFy),
        activeFiscalYear: buildFiscalYearPayload(activeFy),
        allYears,
        warning,
        canCreateCheck,
        canChangeStatusGlobally,
        data: {
          checks,
        },
        diagnostics: {
          fiscalYearApplied: Boolean(effectiveFiscalYearId && !allYears),
          requestedFiscalYearId: fiscalYearIdParam || null,
          allYearsRequested: allYears,
          checkCount: checks.length,
          activeFiscalYearId: activeFy?.id || null,
        },
      })
    } catch (error: any) {
      console.error('[Checks GET] Error:', error?.message || error)

      return NextResponse.json(
        {
          success: false,
          error: 'خطا در بارگذاری چک‌ها',
          code: error?.code || 'UNKNOWN',
        },
        { status: error?.status || 500 }
      )
    }
  }
)
// ═══════════════════════════════════════════════════════════════
// POST /api/checks — ثبت چک جدید
// ═══════════════════════════════════════════════════════════════

export const POST = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId
      const userId = tenant.user?.id

      const body = await req.json()

      const {
        type = 'receivable',
        checkNumber,
        bankName,
        branchName,
        amount: rawAmount,
        issueDate: rawIssueDate,
        dueDate: rawDueDate,
        customerId,
        supplierId,
        payeeName,
        description,
        invoiceId,
      } = body

      if (!['receivable', 'payable'].includes(type)) {
        return NextResponse.json(
          { success: false, error: 'نوع چک نامعتبر است' },
          { status: 400 }
        )
      }

      if (!checkNumber || !String(checkNumber).trim()) {
        return NextResponse.json(
          { success: false, error: 'شماره چک الزامی است' },
          { status: 400 }
        )
      }

      if (!bankName || !String(bankName).trim()) {
        return NextResponse.json(
          { success: false, error: 'نام بانک الزامی است' },
          { status: 400 }
        )
      }

      const amount = toSafeNumber(rawAmount)

      if (!amount || amount <= 0) {
        return NextResponse.json(
          { success: false, error: 'مبلغ چک باید بزرگ‌تر از صفر باشد' },
          { status: 400 }
        )
      }

      const issueDate = parseDate(rawIssueDate) || new Date()
      const dueDate = parseDate(rawDueDate)

      if (!dueDate) {
        return NextResponse.json(
          { success: false, error: 'تاریخ سررسید چک الزامی است' },
          { status: 400 }
        )
      }

      if (dueDate < issueDate) {
        return NextResponse.json(
          {
            success: false,
            error: 'تاریخ سررسید نمی‌تواند قبل از تاریخ صدور چک باشد.',
          },
          { status: 400 }
        )
      }

      const activeFy = await findActiveFiscalYear(tenantDb, tenantId)

      if (!activeFy) {
        return NextResponse.json(
          {
            success: false,
            error: 'سال مالی فعالی یافت نشد.',
            code: 'NO_ACTIVE_FISCAL_YEAR',
          },
          { status: 400 }
        )
      }

      if (activeFy.isClosed) {
        return NextResponse.json(
          {
            success: false,
            error: `سال مالی «${activeFy.name}» بسته شده است و امکان ثبت چک جدید وجود ندارد.`,
            code: 'FISCAL_YEAR_CLOSED',
          },
          { status: 400 }
        )
      }

      const fyStart = startOfDay(activeFy.startDate)
      const fyEnd = endOfDay(activeFy.endDate)

      if (!isDateInRange(issueDate, fyStart, fyEnd)) {
        return NextResponse.json(
          {
            success: false,
            error: 'تاریخ صدور چک باید داخل سال مالی فعال باشد.',
            code: 'ISSUE_DATE_OUT_OF_FISCAL_YEAR',
          },
          { status: 400 }
        )
      }

      const txClient: any = tenantDb

      const result = await txClient.$transaction(async (tx: any) => {
        const checkData: any = {
          tenantId,
          type,
          checkNumber: String(checkNumber).trim(),
          bankName: String(bankName).trim(),
          branchName: branchName?.trim() || null,
          amount,
          issueDate,
          dueDate,
          customerId: customerId || null,
          supplierId: supplierId || null,
          payeeName: payeeName?.trim() || null,
          description: description?.trim() || null,
          status: 'pending',
          invoiceId: invoiceId || null,
        }

        let check: any

        try {
          check = await tx.check.create({
            data: {
              ...checkData,
              fiscalYearId: activeFy.id,
            },
          })
        } catch (err: any) {
          const msg = String(err?.message || '')

          if (msg.includes('fiscalYearId')) {
            check = await tx.check.create({ data: checkData })
          } else {
            throw err
          }
        }

        if (!invoiceId) {
          const accounts = await tx.account.findMany({ where: { tenantId } })

          const findAccountByCode = (code: string) =>
            accounts.find((a: any) => String(a.code) === code) || null

          let checkAccountId: string | null = null
          let counterpartAccountId: string | null = null

          if (type === 'receivable') {
            checkAccountId = findAccountByCode('1350')?.id || null
            counterpartAccountId = customerId
              ? findAccountByCode('1310')?.id || null
              : findAccountByCode('4100')?.id || null
          } else {
            checkAccountId = findAccountByCode('2050')?.id || null
            const partyId = supplierId || customerId
            counterpartAccountId = partyId
              ? findAccountByCode('2010')?.id || null
              : findAccountByCode('5100')?.id || null
          }

          if (checkAccountId && counterpartAccountId && amount > 0) {
            const lines: any[] = []

            if (type === 'receivable') {
              lines.push({
                accountId: checkAccountId,
                debit: amount,
                credit: 0,
                description: `بدهکار: چک دریافتی ${check.checkNumber}`,
              })
              lines.push({
                accountId: counterpartAccountId,
                debit: 0,
                credit: amount,
                description: `بستانکار: بابت چک دریافتی ${check.checkNumber}`,
              })
            } else {
              lines.push({
                accountId: counterpartAccountId,
                debit: amount,
                credit: 0,
                description: `بدهکار: بابت چک پرداختنی ${check.checkNumber}`,
              })
              lines.push({
                accountId: checkAccountId,
                debit: 0,
                credit: amount,
                description: `بستانکار: چک پرداختنی ${check.checkNumber}`,
              })
            }

            const totalDebit = lines.reduce(
              (s: number, l: any) => s + Number(l.debit || 0),
              0
            )
            const totalCredit = lines.reduce(
              (s: number, l: any) => s + Number(l.credit || 0),
              0
            )

            const jeNumber = await generateJournalNumberLocal(tx, tenantId)

            const jeData: any = {
              number: jeNumber,
              date: issueDate,
              description: `سند خودکار بابت چک ${
                type === 'receivable' ? 'دریافتنی' : 'پرداختنی'
              } ${check.checkNumber}`,
              status: 'posted',
              sourceType: 'check',
              sourceId: check.id,
              totalDebit,
              totalCredit,
              createdBy: userId || null,
              tenantId,
              lines: { create: lines },
            }

            let newJE: any

            try {
              newJE = await tx.journalEntry.create({
                data: {
                  ...jeData,
                  fiscalYearId: activeFy.id,
                },
              })
            } catch (err: any) {
              const msg = String(err?.message || '')

              if (msg.includes('fiscalYearId')) {
                newJE = await tx.journalEntry.create({ data: jeData })
              } else {
                throw err
              }
            }

            await tx.check
              .update({
                where: { id: check.id },
                data: { journalEntryId: newJE.id },
              })
              .catch((err: any) =>
                console.warn(
                  '[Checks POST] Failed to link journal entry:',
                  err?.message
                )
              )
          }
        }

        return check
      })

      return NextResponse.json({
        success: true,
        data: result,
        fiscalYearId: activeFy.id,
        fiscalYearName: activeFy.name,
        message: `چک ${
          type === 'receivable' ? 'دریافتی' : 'پرداختنی'
        } با موفقیت ثبت شد`,
      })
    } catch (error: any) {
      console.error('[Checks POST] Error:', error?.message || error)

      return NextResponse.json(
        {
          success: false,
          error: 'خطا در ثبت چک',
          code: error?.code || 'UNKNOWN',
        },
        { status: error?.status || 500 }
      )
    }
  }
)

// ═══════════════════════════════════════════════════════════════
// PUT /api/checks — ویرایش چک یا تغییر وضعیت
// ═══════════════════════════════════════════════════════════════

export const PUT = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const body = await req.json()

      const isStatusRequest = Boolean(body.status)
      const isEditRequest = Boolean(body.id) && !isStatusRequest

      if (isEditRequest) {
        return handleCheckEdit(req, ctx, tenant, body)
      }

      if (isStatusRequest) {
        return handleCheckStatus(req, ctx, tenant, body)
      }

      return NextResponse.json(
        { success: false, error: 'درخواست نامعتبر است' },
        { status: 400 }
      )
    } catch (error: any) {
      console.error('[Checks PUT] Error:', error?.message || error)

      return NextResponse.json(
        {
          success: false,
          error: 'خطا در پردازش چک',
          code: error?.code || 'UNKNOWN',
        },
        { status: error?.status || 500 }
      )
    }
  }
)

export const PATCH = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const body = await req.json()
      return handleCheckStatus(req, ctx, tenant, body)
    } catch (error: any) {
      console.error('[Checks PATCH] Error:', error?.message || error)

      return NextResponse.json(
        {
          success: false,
          error: 'خطا در تغییر وضعیت چک',
          code: error?.code || 'UNKNOWN',
        },
        { status: error?.status || 500 }
      )
    }
  }
)

// ═══════════════════════════════════════════════════════════════
// Edit Check
// ═══════════════════════════════════════════════════════════════

async function handleCheckEdit(
  req: NextRequest,
  ctx: any,
  tenant: any,
  body: any
) {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const userId = tenant.user?.id

    if (!body.id) {
      return NextResponse.json(
        { success: false, error: 'شناسه چک الزامی است' },
        { status: 400 }
      )
    }

    const check = await tenantDb.check.findFirst({
      where: { id: body.id, tenantId },
    })

    if (!check) {
      return NextResponse.json(
        { success: false, error: 'چک یافت نشد' },
        { status: 404 }
      )
    }

    if (normalizeStatus(check.status) !== 'pending') {
      return NextResponse.json(
        {
          success: false,
          error: 'فقط چک‌های در جریان قابل ویرایش هستند.',
          code: 'CHECK_NOT_EDITABLE',
        },
        { status: 400 }
      )
    }

    const checkFy = await findFiscalYearById(
      tenantDb,
      tenantId,
      check.fiscalYearId || null
    )

    if (checkFy?.isClosed) {
      return NextResponse.json(
        {
          success: false,
          error: `سال مالی «${checkFy.name}» بسته شده است و امکان ویرایش این چک وجود ندارد.`,
          code: 'FISCAL_YEAR_CLOSED',
        },
        { status: 400 }
      )
    }

    const activeFy = await findActiveFiscalYear(tenantDb, tenantId)

    if (!checkFy && !activeFy) {
      return NextResponse.json(
        {
          success: false,
          error: 'سال مالی فعالی برای ویرایش چک یافت نشد.',
          code: 'NO_ACTIVE_FISCAL_YEAR',
        },
        { status: 400 }
      )
    }

    if (!checkFy && activeFy?.isClosed) {
      return NextResponse.json(
        {
          success: false,
          error: `سال مالی «${activeFy.name}» بسته شده است و امکان ویرایش این چک وجود ندارد.`,
          code: 'FISCAL_YEAR_CLOSED',
        },
        { status: 400 }
      )
    }

    const fiscalYearIdForJE = check.fiscalYearId || activeFy?.id || null

    if (!fiscalYearIdForJE) {
      return NextResponse.json(
        {
          success: false,
          error: 'سال مالی معتبری برای ویرایش چک یافت نشد.',
          code: 'NO_VALID_FISCAL_YEAR',
        },
        { status: 400 }
      )
    }

    const newAmount =
      body.amount !== undefined ? toSafeNumber(body.amount) : toSafeNumber(check.amount)

    if (!newAmount || newAmount <= 0) {
      return NextResponse.json(
        { success: false, error: 'مبلغ چک باید بزرگ‌تر از صفر باشد' },
        { status: 400 }
      )
    }

    const newDueDate = body.dueDate ? parseDate(body.dueDate) : check.dueDate
    const issueDate = parseDate(check.issueDate) || new Date()

    if (!newDueDate) {
      return NextResponse.json(
        { success: false, error: 'تاریخ سررسید نامعتبر است' },
        { status: 400 }
      )
    }

    if (newDueDate < issueDate) {
      return NextResponse.json(
        {
          success: false,
          error: 'تاریخ سررسید نمی‌تواند قبل از تاریخ صدور چک باشد.',
        },
        { status: 400 }
      )
    }

    const txClient: any = tenantDb

    await txClient.$transaction(async (tx: any) => {
      await tx.check.update({
        where: { id: check.id },
        data: {
          checkNumber: body.checkNumber
            ? String(body.checkNumber).trim()
            : check.checkNumber,
          bankName: body.bankName
            ? String(body.bankName).trim()
            : check.bankName,
          branchName:
            body.branchName !== undefined
              ? body.branchName?.trim() || null
              : check.branchName,
          amount: newAmount,
          dueDate: newDueDate,
          payeeName:
            body.payeeName !== undefined
              ? body.payeeName?.trim() || null
              : check.payeeName,
          description:
            body.description !== undefined
              ? body.description?.trim() || null
              : check.description,
          fiscalYearId: check.fiscalYearId || fiscalYearIdForJE,
        },
      })

      if (check.journalEntryId) {
        await tx.journalEntry
          .update({
            where: { id: check.journalEntryId },
            data: {
              status: 'cancelled',
              isCancelled: true,
              cancelledAt: new Date(),
              cancelReason: `ویرایش چک ${check.checkNumber}`,
              description: `ابطال شده — ویرایش چک ${check.checkNumber}`,
            },
          })
          .catch((err: any) =>
            console.warn(
              '[Checks EDIT] Failed to cancel old JE:',
              err?.message
            )
          )
      }

      if (!check.invoiceId) {
        const accounts = await tx.account.findMany({ where: { tenantId } })

        const findAccountByCode = (code: string) =>
          accounts.find((a: any) => String(a.code) === code) || null

        let checkAccountId: string | null = null
        let counterpartAccountId: string | null = null

        if (check.type === 'receivable') {
          checkAccountId = findAccountByCode('1350')?.id || null
          counterpartAccountId = check.customerId
            ? findAccountByCode('1310')?.id || null
            : findAccountByCode('4100')?.id || null
        } else {
          checkAccountId = findAccountByCode('2050')?.id || null
          const partyId = (check as any).supplierId || check.customerId
          counterpartAccountId = partyId
            ? findAccountByCode('2010')?.id || null
            : findAccountByCode('5100')?.id || null
        }

        if (checkAccountId && counterpartAccountId) {
          const lines: any[] = []

          if (check.type === 'receivable') {
            lines.push({
              accountId: checkAccountId,
              debit: newAmount,
              credit: 0,
              description: `بدهکار: چک دریافتی ${
                body.checkNumber || check.checkNumber
              }`,
            })
            lines.push({
              accountId: counterpartAccountId,
              debit: 0,
              credit: newAmount,
              description: `بستانکار: بابت چک دریافتی ${
                body.checkNumber || check.checkNumber
              }`,
            })
          } else {
            lines.push({
              accountId: counterpartAccountId,
              debit: newAmount,
              credit: 0,
              description: `بدهکار: بابت چک پرداختنی ${
                body.checkNumber || check.checkNumber
              }`,
            })
            lines.push({
              accountId: checkAccountId,
              debit: 0,
              credit: newAmount,
              description: `بستانکار: چک پرداختنی ${
                body.checkNumber || check.checkNumber
              }`,
            })
          }

          const totalDebit = lines.reduce(
            (s: number, l: any) => s + Number(l.debit || 0),
            0
          )
          const totalCredit = lines.reduce(
            (s: number, l: any) => s + Number(l.credit || 0),
            0
          )

          const jeNumber = await generateJournalNumberLocal(tx, tenantId)

          const jeData: any = {
            number: jeNumber,
            date: issueDate,
            description: `سند خودکار (ویرایش) بابت چک ${
              body.checkNumber || check.checkNumber
            }`,
            status: 'posted',
            sourceType: 'check',
            sourceId: check.id,
            totalDebit,
            totalCredit,
            createdBy: userId || null,
            tenantId,
            lines: { create: lines },
          }

          let newJE: any

          try {
            newJE = await tx.journalEntry.create({
              data: {
                ...jeData,
                fiscalYearId: fiscalYearIdForJE,
              },
            })
          } catch (err: any) {
            const msg = String(err?.message || '')

            if (msg.includes('fiscalYearId')) {
              newJE = await tx.journalEntry.create({ data: jeData })
            } else {
              throw err
            }
          }

          await tx.check.update({
            where: { id: check.id },
            data: { journalEntryId: newJE.id },
          })
        }
      }
    })

    return NextResponse.json({
      success: true,
      message: 'چک ویرایش شد',
    })
  } catch (error: any) {
    console.error('[Checks EDIT] Error:', error?.message || error)

    return NextResponse.json(
      {
        success: false,
        error: 'خطا در ویرایش چک',
        code: error?.code || 'UNKNOWN',
      },
      { status: error?.status || 500 }
    )
  }
}

// ═══════════════════════════════════════════════════════════════
// Change Check Status
// ═══════════════════════════════════════════════════════════════

async function handleCheckStatus(
  req: NextRequest,
  ctx: any,
  tenant: any,
  body: any
) {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const userId = tenant.user?.id

    const { id, status } = body

    if (!id || !status) {
      return NextResponse.json(
        { success: false, error: 'شناسه چک و وضعیت جدید الزامی است' },
        { status: 400 }
      )
    }

    const newStatus = normalizeStatus(status)

    if (!VALID_CHECK_STATUSES.includes(newStatus)) {
      return NextResponse.json(
        { success: false, error: 'وضعیت نامعتبر است' },
        { status: 400 }
      )
    }

    const check = await tenantDb.check.findFirst({
      where: { id, tenantId },
    })

    if (!check) {
      return NextResponse.json(
        { success: false, error: 'چک یافت نشد' },
        { status: 404 }
      )
    }

    const currentStatus = normalizeStatus(check.status)

    if (currentStatus === newStatus) {
      return NextResponse.json({
        success: true,
        message: 'وضعیت چک تغییری نکرد',
      })
    }

    const allowed = getAllowedStatusTransitions(check.type, currentStatus)

    if (!allowed.includes(newStatus)) {
      return NextResponse.json(
        {
          success: false,
          error: `انتقال وضعیت از «${currentStatus}» به «${newStatus}» مجاز نیست.`,
          code: 'INVALID_STATUS_TRANSITION',
        },
        { status: 400 }
      )
    }

    const activeFy = await findActiveFiscalYear(tenantDb, tenantId)

    if (!activeFy) {
      return NextResponse.json(
        {
          success: false,
          error: 'سال مالی فعالی برای ثبت سند تغییر وضعیت یافت نشد.',
          code: 'NO_ACTIVE_FISCAL_YEAR',
        },
        { status: 400 }
      )
    }

    if (activeFy.isClosed) {
      return NextResponse.json(
        {
          success: false,
          error: `سال مالی «${activeFy.name}» بسته شده است و امکان تغییر وضعیت چک وجود ندارد.`,
          code: 'FISCAL_YEAR_CLOSED',
        },
        { status: 400 }
      )
    }

    const txClient: any = tenantDb

    await txClient.$transaction(async (tx: any) => {
      await tx.check.update({
        where: { id: check.id },
        data: {
          status: newStatus,
        },
      })

      if (
        newStatus === 'cleared' ||
        newStatus === 'bounced' ||
        newStatus === 'returned'
      ) {
        const accounts = await tx.account.findMany({ where: { tenantId } })

        const findAccountByCode = (code: string) =>
          accounts.find((a: any) => String(a.code) === code) || null

        const bankAccount = findAccountByCode('1100')
        const checkRecvAccount = findAccountByCode('1350')
        const checkPayAccount = findAccountByCode('2050')
        const receivableAccount = findAccountByCode('1310')
        const payableAccount = findAccountByCode('2010')

        const lines: any[] = []
        const amountNum = toSafeNumber(check.amount)

        if (check.type === 'receivable') {
          if (newStatus === 'cleared') {
            if (bankAccount && checkRecvAccount) {
              lines.push({
                accountId: bankAccount.id,
                debit: amountNum,
                credit: 0,
                description: `بدهکار: وصول چک دریافتی ${check.checkNumber}`,
              })
              lines.push({
                accountId: checkRecvAccount.id,
                debit: 0,
                credit: amountNum,
                description: `بستانکار: تسویه چک دریافتی ${check.checkNumber}`,
              })
            }
          } else if (newStatus === 'bounced' || newStatus === 'returned') {
            if (receivableAccount && checkRecvAccount) {
              const action = newStatus === 'bounced' ? 'برگشت' : 'پس دادن'

              lines.push({
                accountId: receivableAccount.id,
                debit: amountNum,
                credit: 0,
                description: `بدهکار: ${action} چک دریافتی ${check.checkNumber}`,
              })
              lines.push({
                accountId: checkRecvAccount.id,
                debit: 0,
                credit: amountNum,
                description: `بستانکار: ${action} چک دریافتی ${check.checkNumber}`,
              })
            }
          }
        } else {
          if (newStatus === 'cleared') {
            if (checkPayAccount && bankAccount) {
              lines.push({
                accountId: checkPayAccount.id,
                debit: amountNum,
                credit: 0,
                description: `بدهکار: پرداخت/پاس شدن چک پرداختنی ${check.checkNumber}`,
              })
              lines.push({
                accountId: bankAccount.id,
                debit: 0,
                credit: amountNum,
                description: `بستانکار: کسر از بانک بابت چک ${check.checkNumber}`,
              })
            }
          } else if (newStatus === 'bounced' || newStatus === 'returned') {
            if (checkPayAccount && payableAccount) {
              const action =
                newStatus === 'bounced' ? 'برگشت' : 'ابطال/پس گرفتن'

              lines.push({
                accountId: checkPayAccount.id,
                debit: amountNum,
                credit: 0,
                description: `بدهکار: ${action} چک پرداختنی ${check.checkNumber}`,
              })
              lines.push({
                accountId: payableAccount.id,
                debit: 0,
                credit: amountNum,
                description: `بستانکار: ${action} چک پرداختنی ${check.checkNumber}`,
              })
            }
          }
        }

        if (lines.length >= 2) {
          const totalDebit = lines.reduce(
            (s: number, l: any) => s + Number(l.debit || 0),
            0
          )
          const totalCredit = lines.reduce(
            (s: number, l: any) => s + Number(l.credit || 0),
            0
          )

          const jeNumber = await generateJournalNumberLocal(tx, tenantId)

          let actionWord = ''

          if (newStatus === 'cleared') {
            actionWord = check.type === 'receivable' ? 'وصول' : 'پرداخت'
          } else if (newStatus === 'bounced') {
            actionWord = 'برگشت'
          } else {
            actionWord =
              check.type === 'receivable' ? 'پس دادن' : 'ابطال'
          }

          const jeData: any = {
            number: jeNumber,
            date: new Date(),
            description: `سند سیستمی — ${actionWord} چک ${check.checkNumber}`,
            status: 'posted',
            sourceType: 'check_status',
            sourceId: check.id,
            totalDebit,
            totalCredit,
            createdBy: userId || null,
            tenantId,
            lines: { create: lines },
          }

          try {
            await tx.journalEntry.create({
              data: {
                ...jeData,
                fiscalYearId: activeFy.id,
              },
            })
          } catch (err: any) {
            const msg = String(err?.message || '')

            if (msg.includes('fiscalYearId')) {
              await tx.journalEntry.create({ data: jeData })
            } else {
              throw err
            }
          }
        }
      }
    })

    const statusLabels: Record<string, string> = {
      cleared:
        check.type === 'receivable' ? 'وصول شد' : 'پرداخت شد',
      bounced: 'برگشت خورد',
      deposited: 'به بانک سپرده شد',
      returned:
        check.type === 'receivable' ? 'پس داده شد' : 'باطل شد',
      pending: 'در انتظار',
    }

    return NextResponse.json({
      success: true,
      message: `چک ${statusLabels[newStatus] || newStatus}`,
      fiscalYearId: activeFy.id,
      fiscalYearName: activeFy.name,
    })
  } catch (error: any) {
    console.error('[Checks STATUS] Error:', error?.message || error)

    return NextResponse.json(
      {
        success: false,
        error: 'خطا در تغییر وضعیت چک',
        code: error?.code || 'UNKNOWN',
      },
      { status: error?.status || 500 }
    )
  }
}

// ═══════════════════════════════════════════════════════════════
// DELETE /api/checks
// ═══════════════════════════════════════════════════════════════

export const DELETE = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId
      const { searchParams } = new URL(req.url)
      const id = searchParams.get('id')

      if (!id) {
        return NextResponse.json(
          { success: false, error: 'شناسه چک الزامی است' },
          { status: 400 }
        )
      }

      const check = await tenantDb.check.findFirst({
        where: { id, tenantId },
      })

      if (!check) {
        return NextResponse.json(
          { success: false, error: 'چک یافت نشد' },
          { status: 404 }
        )
      }

      if (normalizeStatus(check.status) !== 'pending') {
        return NextResponse.json(
          {
            success: false,
            error: 'فقط چک‌های در جریان قابل حذف هستند.',
            code: 'CHECK_NOT_DELETABLE',
          },
          { status: 400 }
        )
      }

      const checkFy = await findFiscalYearById(
        tenantDb,
        tenantId,
        check.fiscalYearId || null
      )

      if (checkFy?.isClosed) {
        return NextResponse.json(
          {
            success: false,
            error: `سال مالی «${checkFy.name}» بسته شده است و امکان حذف این چک وجود ندارد.`,
            code: 'FISCAL_YEAR_CLOSED',
          },
          { status: 400 }
        )
      }

      const activeFy = await findActiveFiscalYear(tenantDb, tenantId)

      if (!checkFy && !activeFy) {
        return NextResponse.json(
          {
            success: false,
            error: 'سال مالی فعالی برای حذف این چک یافت نشد.',
            code: 'NO_ACTIVE_FISCAL_YEAR',
          },
          { status: 400 }
        )
      }

      if (!checkFy && activeFy?.isClosed) {
        return NextResponse.json(
          {
            success: false,
            error: `سال مالی «${activeFy.name}» بسته شده است و امکان حذف این چک وجود ندارد.`,
            code: 'FISCAL_YEAR_CLOSED',
          },
          { status: 400 }
        )
      }

      const txClient: any = tenantDb

      await txClient.$transaction(async (tx: any) => {
        if (check.journalEntryId) {
          await tx.journalEntry
            .update({
              where: { id: check.journalEntryId },
              data: {
                status: 'cancelled',
                isCancelled: true,
                cancelledAt: new Date(),
                cancelReason: `حذف چک ${check.checkNumber}`,
                description: `ابطال شده — حذف چک ${check.checkNumber}`,
              },
            })
            .catch((err: any) =>
              console.warn(
                '[Checks DELETE] Failed to cancel JE:',
                err?.message
              )
            )
        }

        await tx.journalEntry
          .updateMany({
            where: {
              sourceType: 'check_status',
              sourceId: check.id,
              tenantId,
            },
            data: {
              status: 'cancelled',
              isCancelled: true,
              cancelledAt: new Date(),
              cancelReason: `حذف چک ${check.checkNumber}`,
            },
          })
          .catch((err: any) =>
            console.warn(
              '[Checks DELETE] Failed to cancel status JEs:',
              err?.message
            )
          )

        await tx.check.delete({ where: { id } })
      })

      return NextResponse.json({
        success: true,
        message: 'چک حذف شد',
      })
    } catch (error: any) {
      console.error('[Checks DELETE] Error:', error?.message || error)

      return NextResponse.json(
        {
          success: false,
          error: 'خطا در حذف چک',
          code: error?.code || 'UNKNOWN',
        },
        { status: error?.status || 500 }
      )
    }
  }
)