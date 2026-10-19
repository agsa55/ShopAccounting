// ============================================================================
// src/app/api/initial-balance/route.ts — v11.0 Fiscal Year Safe
// ShopAccounting — Initial Balance API (Opening Journal Entry)
// ============================================================================
// ★ v11.0 تغییرات:
//   - سند افتتاحیه حتماً به سال مالی فعال و باز وصل می‌شود
//   - رفع باگ تکرار خط موازنه (سرمایه مالک)
//   - شماره‌گذاری امن و یکتا برای سند
//   - تاریخ سند UTC-safe (بدون مشکل timezone)
//   - بازگشت اطلاعات سال مالی فعال به UI
//   - حذف فقط اگر سال مالی آن بسته نباشد
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// ─── Helpers ─────────────────────────────────────────────────

function safeNum(value: any): number {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const n = parseFloat(value.replace(/,/g, ''))
    return Number.isFinite(n) ? n : 0
  }
  if (typeof value === 'object') {
    try {
      const s = String(value)
      const n = parseFloat(s.replace(/,/g, ''))
      if (Number.isFinite(n)) return n
    } catch {}
  }
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function roundMoney(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.round(v)
}

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

async function findActiveOpenFiscalYear(
  tenantDb: any,
  tenantId: string
): Promise<any | null> {
  try {
    return await tenantDb.fiscalYear.findFirst({
      where: { tenantId, isActive: true, isClosed: false },
      orderBy: { startDate: 'desc' },
    })
  } catch {
    return null
  }
}

async function findAllFiscalYears(
  tenantDb: any,
  tenantId: string
): Promise<any[]> {
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
      orderBy: { startDate: 'desc' },
    })
  } catch {
    return []
  }
}

async function generateJournalNumber(
  tx: any,
  tenantId: string
): Promise<string> {
  try {
    const count = await tx.journalEntry.count({ where: { tenantId } })
    const suffix = Date.now().toString().slice(-4)
    return `JE-${(count + 1).toString().padStart(6, '0')}-${suffix}`
  } catch {
    return `JE-${Date.now()}`
  }
}

// ─── GET ─────────────────────────────────────────────────────

export const GET = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      if (!tenantDb?.initialBalance) {
        return NextResponse.json({
          success: true,
          data: [],
          summary: null,
          activeFiscalYear: null,
          hasOpenFiscalYear: false,
        })
      }

      const [balances, activeFy, allFys, productCount, warehouseCount] =
        await Promise.all([
          tenantDb.initialBalance
            .findMany({
              where: { tenantId },
              include: {
                Account: { select: { id: true, code: true, name: true } },
              },
              orderBy: { createdAt: 'desc' },
            })
            .catch(() => []),
          findActiveOpenFiscalYear(tenantDb, tenantId),
          findAllFiscalYears(tenantDb, tenantId),
          tenantDb.product
            .count({ where: { tenantId, isActive: true } })
            .catch(() => 0),
          tenantDb.warehouse
            .count({ where: { tenantId, isActive: true } })
            .catch(() => 0),
        ])

      let totalAssets = 0
      let totalLiabilities = 0
      let isPosted = false
      let journalEntryId: string | null = null
      let postedFiscalYearId: string | null = null

      for (const b of balances) {
        const amt = safeNum(b.amount)
        if (
          ['cash', 'bank', 'inventory', 'fixed_asset'].includes(b.type || '')
        ) {
          totalAssets += amt
        } else if (b.type === 'liability') {
          totalLiabilities += amt
        }
        if (b.isPosted || b.journalEntryId) {
          isPosted = true
          journalEntryId = b.journalEntryId || journalEntryId
        }
      }

      // اگر سند صادر شده، سال مالی آن را پیدا کن
      if (journalEntryId) {
        try {
          const je = await tenantDb.journalEntry.findFirst({
            where: { id: journalEntryId, tenantId },
            select: { fiscalYearId: true },
          })
          postedFiscalYearId = je?.fiscalYearId || null
        } catch {}
      }

      let totalInventoryValue = 0
      try {
        const inventoryProducts = await tenantDb.product.findMany({
          where: { tenantId, isActive: true },
          select: { currentStock: true, purchasePrice: true },
        })
        totalInventoryValue = inventoryProducts.reduce(
          (sum: number, p: any) =>
            sum + safeNum(p.currentStock) * safeNum(p.purchasePrice),
          0
        )
      } catch {}

      const postedFy = postedFiscalYearId
        ? allFys.find((fy: any) => fy.id === postedFiscalYearId)
        : null

      return NextResponse.json({
        success: true,
        data: balances,
        summary: {
          totalAssets: roundMoney(totalAssets),
          totalLiabilities: roundMoney(totalLiabilities),
          equity: roundMoney(totalAssets - totalLiabilities),
          isPosted,
          journalEntryId,
          count: balances.length,
          productCount,
          warehouseCount,
          totalInventoryValue: roundMoney(totalInventoryValue),
          postedFiscalYearName: postedFy?.name || null,
          postedFiscalYearIsClosed: postedFy?.isClosed || false,
        },
        activeFiscalYear: activeFy
          ? {
              id: activeFy.id,
              name: activeFy.name,
              startDate: activeFy.startDate,
              endDate: activeFy.endDate,
            }
          : null,
        hasOpenFiscalYear: Boolean(activeFy),
      })
    } catch (error: any) {
      console.error('[InitialBalance GET]', error)
      return NextResponse.json(
        { success: false, error: 'خطا در دریافت موجودی اولیه' },
        { status: 500 }
      )
    }
  }
)

// ─── POST ────────────────────────────────────────────────────

export const POST = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId
      const userId = tenant.user?.id
      const body = await req.json()

      if (
        !body.items ||
        !Array.isArray(body.items) ||
        body.items.length === 0
      ) {
        return NextResponse.json(
          {
            success: false,
            error: 'حداقل یک آیتم موجودی اولیه الزامی است',
          },
          { status: 400 }
        )
      }

      // ─── بررسی سال مالی فعال (برای صدور سند) ────────────────
      let activeFy: any = null

      if (body.postToJournal) {
        activeFy = await findActiveOpenFiscalYear(tenantDb, tenantId)

        if (!activeFy) {
          return NextResponse.json(
            {
              success: false,
              error:
                'سال مالی فعال و بازی وجود ندارد. برای صدور سند افتتاحیه، ابتدا یک سال مالی فعال تعریف و باز کنید.',
              code: 'NO_ACTIVE_FISCAL_YEAR',
            },
            { status: 400 }
          )
        }
      }

      // ─── Idempotency check ───────────────────────────────────
      if (body.postToJournal) {
        try {
          const existingPosted = await tenantDb.initialBalance.findFirst({
            where: { tenantId, isPosted: true },
          })

          if (existingPosted) {
            return NextResponse.json({
              success: true,
              message: 'سند افتتاحیه قبلاً صادر شده است',
              data: { skipped: true, existingId: existingPosted.id },
            })
          }
        } catch {}
      }

      // ─── حذف draft های قبلی ───────────────────────────────────
      try {
        await tenantDb.initialBalance.deleteMany({
          where: { tenantId, isPosted: false },
        })
      } catch {}

      // ─── ایجاد موجودی‌های جدید ────────────────────────────────
      const createdBalances: any[] = []

      for (const item of body.items) {
        const amount = roundMoney(safeNum(item.amount))
        if (amount <= 0) continue

        try {
          const balance = await tenantDb.initialBalance.create({
            data: {
              tenantId,
              type: item.type || 'cash',
              title: item.title || item.description || 'موجودی اولیه',
              amount,
              accountId: item.accountId || null,
              productId: item.productId || null,
              quantity: item.quantity != null ? Number(item.quantity) : null,
              description: item.description || item.title || null,
              journalEntryId: null,
              isPosted: false,
            },
            include: {
              Account: { select: { id: true, code: true, name: true } },
            },
          })
          createdBalances.push(balance)
        } catch (err: any) {
          return NextResponse.json(
            {
              success: false,
              error: `خطا در ثبت موجودی: ${err?.message}`,
              errorCode: err?.code,
            },
            { status: 500 }
          )
        }
      }

      // ─── ایجاد سند افتتاحیه ───────────────────────────────────
      if (body.postToJournal && createdBalances.length > 0) {
        const defaultAccounts: Record<string, any> = {
          cash: null,
          bank: null,
          inventory: null,
          fixed_asset: null,
          liability: null,
          equity: null,
        }

        try {
          defaultAccounts.cash = await tenantDb.account.findFirst({
            where: {
              tenantId,
              OR: [
                { code: { startsWith: '101' } },
                { name: { contains: 'صندوق' } },
                { name: { contains: 'نقد' } },
              ],
            },
            orderBy: { code: 'asc' },
          })

          defaultAccounts.bank = await tenantDb.account.findFirst({
            where: {
              tenantId,
              OR: [
                { code: { startsWith: '102' } },
                { name: { contains: 'بانک' } },
              ],
            },
            orderBy: { code: 'asc' },
          })

          defaultAccounts.inventory = await tenantDb.account.findFirst({
            where: {
              tenantId,
              OR: [
                { code: { startsWith: '12' } },
                { name: { contains: 'موجودی کالا' } },
                { name: { contains: 'کالا' } },
              ],
            },
            orderBy: { code: 'asc' },
          })

          defaultAccounts.fixed_asset = await tenantDb.account.findFirst({
            where: {
              tenantId,
              OR: [
                { code: { startsWith: '14' } },
                { code: { startsWith: '15' } },
                { code: { startsWith: '16' } },
                { name: { contains: 'دارایی ثابت' } },
                { name: { contains: 'تجهیزات' } },
              ],
            },
            orderBy: { code: 'asc' },
          })

          defaultAccounts.liability = await tenantDb.account.findFirst({
            where: {
              tenantId,
              OR: [
                { code: { startsWith: '20' } },
                { code: { startsWith: '21' } },
                { name: { contains: 'وام' } },
                { name: { contains: 'بدهی' } },
              ],
            },
            orderBy: { code: 'asc' },
          })

          defaultAccounts.equity = await tenantDb.account.findFirst({
            where: {
              tenantId,
              OR: [
                { code: { startsWith: '30' } },
                { code: { startsWith: '31' } },
                { name: { contains: 'سرمایه' } },
              ],
            },
            orderBy: { code: 'asc' },
          })
        } catch {}

        const journalLines: any[] = []
        let totalDebit = 0
        let totalCredit = 0

        for (const balance of createdBalances) {
          const amt = roundMoney(safeNum(balance.amount))
          if (amt <= 0) continue

          const accountName =
            balance.Account?.name || balance.title || 'موجودی اولیه'
          const accountCode = balance.Account?.code || ''
          const description = accountCode
            ? `${accountCode} - ${accountName}`
            : accountName

          let lineAccountId = balance.accountId
          if (!lineAccountId) {
            const typeKey = balance.type || 'cash'
            lineAccountId = defaultAccounts[typeKey]?.id || null

            if (!lineAccountId && typeKey !== 'liability') {
              lineAccountId = defaultAccounts.cash?.id || null
            }
            if (!lineAccountId && typeKey === 'liability') {
              lineAccountId = defaultAccounts.equity?.id || null
            }
          }

          if (!lineAccountId) continue

          if (balance.type === 'liability') {
            journalLines.push({
              accountId: lineAccountId,
              description,
              debit: 0,
              credit: amt,
            })
            totalCredit += amt
          } else {
            journalLines.push({
              accountId: lineAccountId,
              description,
              debit: amt,
              credit: 0,
            })
            totalDebit += amt
          }
        }

        // ─── خط موازنه (فقط یک بار) ────────────────────────────
        if (Math.abs(totalDebit - totalCredit) > 0.01) {
          const diff = totalDebit - totalCredit
          const equityAccountId = defaultAccounts.equity?.id || null
          const equityDescription = 'سرمایه مالک (موازنه سند افتتاحیه)'

          if (diff > 0) {
            journalLines.push({
              accountId: equityAccountId,
              description: equityDescription,
              debit: 0,
              credit: diff,
            })
            totalCredit += diff
          } else {
            journalLines.push({
              accountId: equityAccountId,
              description: equityDescription,
              debit: Math.abs(diff),
              credit: 0,
            })
            totalDebit += Math.abs(diff)
          }
        }

        if (journalLines.length < 2) {
          return NextResponse.json(
            {
              success: false,
              error:
                'حداقل ۲ ردیف برای سند افتتاحیه لازم است. لطفاً حداقل یک دارایی و یک بدهی/سرمایه وارد کنید.',
            },
            { status: 400 }
          )
        }

        if (Math.abs(totalDebit - totalCredit) > 0.01) {
          return NextResponse.json(
            {
              success: false,
              error: `سند تراز نیست. بدهکار: ${totalDebit}, بستانکار: ${totalCredit}`,
            },
            { status: 400 }
          )
        }

        // ─── تاریخ سند: امروز به UTC ────────────────────────────
        const now = new Date()
        const journalDate = new Date(
          Date.UTC(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            12,
            0,
            0
          )
        )

        // بررسی اینکه تاریخ امروز داخل سال مالی فعال باشد
        const fyStart = startOfDayUTC(new Date(activeFy.startDate))
        const fyEnd = startOfDayUTC(new Date(activeFy.endDate))
        const journalDay = startOfDayUTC(journalDate)

        if (journalDay < fyStart || journalDay > fyEnd) {
          return NextResponse.json(
            {
              success: false,
              error: `تاریخ امروز (${journalDay.toISOString().slice(0, 10)}) خارج از سال مالی فعال «${activeFy.name}» است. لطفاً سال مالی فعال را بررسی کنید.`,
              code: 'DATE_OUT_OF_FISCAL_YEAR',
            },
            { status: 400 }
          )
        }

        const txClient: any = tenantDb

        try {
          const journalEntry = await txClient.$transaction(async (tx: any) => {
            const jeNumber = await generateJournalNumber(tx, tenantId)

            // تلاش با fiscalYearId، اگر schema پشتیبانی نکرد، fallback
            let je: any
            try {
              je = await tx.journalEntry.create({
                data: {
                  number: jeNumber,
                  tenantId,
                  date: journalDate,
                  description: `سند افتتاحیه — سال مالی ${activeFy.name}`,
                  status: 'posted',
                  sourceType: 'initial_balance',
                  sourceId: createdBalances[0]?.id || null,
                  totalDebit: roundMoney(totalDebit),
                  totalCredit: roundMoney(totalCredit),
                  createdBy: userId || null,
                  fiscalYearId: activeFy.id,
                  lines: { create: journalLines },
                },
                include: { lines: true },
              })
            } catch (err: any) {
              const msg = String(err?.message || '')
              if (msg.includes('fiscalYearId')) {
                je = await tx.journalEntry.create({
                  data: {
                    number: jeNumber,
                    tenantId,
                    date: journalDate,
                    description: `سند افتتاحیه — سال مالی ${activeFy.name}`,
                    status: 'posted',
                    sourceType: 'initial_balance',
                    sourceId: createdBalances[0]?.id || null,
                    totalDebit: roundMoney(totalDebit),
                    totalCredit: roundMoney(totalCredit),
                    createdBy: userId || null,
                    lines: { create: journalLines },
                  },
                  include: { lines: true },
                })
              } else {
                throw err
              }
            }

            for (const balance of createdBalances) {
              await tx.initialBalance.update({
                where: { id: balance.id },
                data: {
                  journalEntryId: je.id,
                  isPosted: true,
                },
              })
            }

            return je
          })

          return NextResponse.json(
            {
              success: true,
              data: {
                balances: createdBalances,
                journalEntry: {
                  id: journalEntry.id,
                  number: journalEntry.number,
                  totalDebit: roundMoney(totalDebit),
                  totalCredit: roundMoney(totalCredit),
                  fiscalYearId: activeFy.id,
                  fiscalYearName: activeFy.name,
                },
              },
              message: `سند افتتاحیه در سال مالی «${activeFy.name}» با موفقیت صادر شد`,
            },
            { status: 201 }
          )
        } catch (err: any) {
          console.error('[InitialBalance POST] Journal creation failed:', err)

          if (err?.code === 'P2002') {
            return NextResponse.json({
              success: true,
              message: 'سند افتتاحیه قبلاً ایجاد شده است',
              data: { skipped: true, balances: createdBalances },
            })
          }

          return NextResponse.json(
            {
              success: false,
              error: `خطا در ایجاد سند: ${err?.message}`,
              errorCode: err?.code,
            },
            { status: 500 }
          )
        }
      }

      return NextResponse.json({
        success: true,
        data: createdBalances,
        message: 'موجودی اولیه به‌صورت پیش‌نویس ذخیره شد',
      })
    } catch (error: any) {
      console.error('[InitialBalance POST] Fatal error:', error)
      return NextResponse.json(
        { success: false, error: error?.message || 'خطای سرور' },
        { status: 500 }
      )
    }
  }
)

// ─── DELETE ──────────────────────────────────────────────────

export const DELETE = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId
      const { searchParams } = new URL(req.url)
      const force = searchParams.get('force') === 'true'

      if (!tenantDb?.initialBalance) {
        return NextResponse.json(
          { success: false, error: 'مدل موجودی اولیه وجود ندارد' },
          { status: 400 }
        )
      }

      if (force) {
        // حذف کامل: balances + journal entries + lines
        const balancesWithJournal = await tenantDb.initialBalance.findMany({
          where: { tenantId, journalEntryId: { not: null } },
          select: { journalEntryId: true },
        })

        const journalIds = [
          ...new Set(
            balancesWithJournal
              .map((b: any) => b.journalEntryId)
              .filter(Boolean)
          ),
        ] as string[]

        // بررسی سال مالی سند — اگر بسته باشد، اجازه حذف نمی‌دهیم
        if (journalIds.length > 0) {
          try {
            const jes = await tenantDb.journalEntry.findMany({
              where: {
                id: { in: journalIds },
                tenantId,
                sourceType: 'initial_balance',
              },
              select: { id: true, fiscalYearId: true },
            })

            const fyIds = [
              ...new Set(jes.map((j: any) => j.fiscalYearId).filter(Boolean)),
            ] as string[]

            if (fyIds.length > 0) {
              const fys = await tenantDb.fiscalYear.findMany({
                where: { id: { in: fyIds } },
                select: { id: true, name: true, isClosed: true },
              })

              const closedFy = fys.find((fy: any) => fy.isClosed === true)

              if (closedFy) {
                return NextResponse.json(
                  {
                    success: false,
                    error: `سال مالی «${closedFy.name}» بسته شده است و امکان حذف سند افتتاحیه آن وجود ندارد.`,
                    code: 'FISCAL_YEAR_CLOSED',
                  },
                  { status: 400 }
                )
              }
            }
          } catch {}
        }

        // حذف خطوط سند
        if (journalIds.length > 0) {
          try {
            await tenantDb.journalEntryLine.deleteMany({
              where: { journalEntryId: { in: journalIds } },
            })
          } catch {}

          try {
            await tenantDb.journalEntry.deleteMany({
              where: {
                id: { in: journalIds },
                tenantId,
                sourceType: 'initial_balance',
              },
            })
          } catch {}
        }

        const balancesResult = await tenantDb.initialBalance.deleteMany({
          where: { tenantId },
        })

        return NextResponse.json({
          success: true,
          message: `سند افتتاحیه به‌طور کامل حذف شد (${balancesResult.count} موجودی)`,
          deletedCount: balancesResult.count,
          deletedJournals: journalIds.length,
          force: true,
        })
      }

      // حذف معمولی: فقط draft
      const postedBalance = await tenantDb.initialBalance.findFirst({
        where: { tenantId, isPosted: true },
      })

      if (postedBalance) {
        return NextResponse.json(
          {
            success: false,
            error:
              'سند افتتاحیه صادر شده است. برای حذف کامل، از گزینه «حذف کامل سند» استفاده کنید.',
            needsForce: true,
          },
          { status: 400 }
        )
      }

      const result = await tenantDb.initialBalance.deleteMany({
        where: { tenantId },
      })

      return NextResponse.json({
        success: true,
        message: `${result.count} موجودی با موفقیت حذف شد`,
        deletedCount: result.count,
      })
    } catch (error: any) {
      console.error('[InitialBalance DELETE]', error)
      return NextResponse.json(
        {
          success: false,
          error: 'خطا در حذف موجودی: ' + (error?.message || ''),
        },
        { status: 500 }
      )
    }
  }
)