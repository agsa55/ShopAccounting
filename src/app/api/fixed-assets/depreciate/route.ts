// ============================================================================
// src/app/api/fixed-assets/depreciate/route.ts — v9.0 Jalali Depreciation
// ShopAccounting — Fixed Assets Depreciation API
// ============================================================================
// ★ v9.0:
//   - محاسبه استهلاک بر اساس ماه‌های شمسی
//   - تبدیل امن Decimal
//   - صدور سند استهلاک در سال مالی فعال و باز
//   - جلوگیری از استهلاک بیش از سقف مجاز
//   - پشتیبانی از عقب‌افتادگی چندماهه
//   - skip اگر دارایی کاملاً مستهلک شده باشد
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { gregorianISOToJalali, jalaliToGregorianISO } from '@/lib/jalali-utils'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

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

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value)
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function toUtcDateOnly(value: any): Date | null {
  if (!value) return null

  const d = value instanceof Date ? new Date(value) : new Date(String(value))
  if (Number.isNaN(d.getTime())) return null

  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  )
}

function toISODateOnly(value: any): string | null {
  const d = toUtcDateOnly(value)
  if (!d) return null

  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(
    d.getUTCDate()
  )}`
}

function daysInJalaliMonth(jy: number, jm: number): number {
  if (jm < 1 || jm > 12) return 0
  if (jm <= 6) return 31
  if (jm <= 11) return 30
  return jalaliToGregorianISO(jy, 12, 30) ? 30 : 29
}

function jalaliPartsFromDate(d: Date | null): [number, number, number] | null {
  const iso = toISODateOnly(d)
  if (!iso) return null
  return gregorianISOToJalali(iso)
}

function jalaliMonthsBetween(from: Date | null, to: Date | null): number {
  const f = jalaliPartsFromDate(from)
  const t = jalaliPartsFromDate(to)

  if (!f || !t) return 0

  const [fy, fm, fd] = f
  const [ty, tm, td] = t

  let months = (ty - fy) * 12 + (tm - fm)

  // فقط ماه‌های کامل حساب شوند
  if (td < fd) months -= 1

  return Math.max(0, months)
}

async function findActiveOpenFiscalYear(
  tenantDb: any,
  tenantId: string
): Promise<any | null> {
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
    return null
  }
}

async function getAccountsByCode(
  tenantDb: any,
  tenantId: string
): Promise<Map<string, any>> {
  try {
    const accounts = await tenantDb.account.findMany({
      where: { tenantId },
      select: { id: true, code: true, name: true },
    })

    return new Map<string, any>(
      (accounts || []).map((a: any) => [String(a.code || ''), a])
    )
  } catch {
    return new Map()
  }
}

async function nextJournalNumber(tx: any, tenantId: string): Promise<string> {
  try {
    const count = await tx.journalEntry.count({ where: { tenantId } })
    const suffix = Date.now().toString().slice(-4)
    return `JE-${(count + 1).toString().padStart(6, '0')}-${suffix}`
  } catch {
    return `JE-${Date.now()}`
  }
}

async function createJournalEntrySafe(tx: any, data: any): Promise<any> {
  try {
    return await tx.journalEntry.create({ data })
  } catch (err: any) {
    const msg = String(err?.message || '')

    if (msg.includes('fiscalYearId')) {
      const { fiscalYearId, ...rest } = data
      return await tx.journalEntry.create({ data: rest })
    }

    throw err
  }
}

async function updateFixedAssetSafe(
  db: any,
  id: string,
  data: any
): Promise<any> {
  try {
    return await db.fixedAsset.update({ where: { id }, data })
  } catch (err: any) {
    const msg = String(err?.message || '')
    const removable = ['lastDepreciationDate', 'fiscalYearId']

    let changed = false
    const nextData = { ...data }

    for (const field of removable) {
      if (
        Object.prototype.hasOwnProperty.call(nextData, field) &&
        msg.includes(field)
      ) {
        delete nextData[field]
        changed = true
      }
    }

    if (changed) {
      return await db.fixedAsset.update({ where: { id }, data: nextData })
    }

    throw err
  }
}

// ═══════════════════════════════════════════════════════════════
// POST /api/fixed-assets/depreciate
// ═══════════════════════════════════════════════════════════════

export const POST = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId
      const userId = tenant.user?.id

      if (!tenantDb?.fixedAsset) {
        return NextResponse.json(
          { success: false, error: 'مدل دارایی ثابت در دیتابیس وجود ندارد' },
          { status: 400 }
        )
      }

      const body = await req.json().catch(() => ({}))
      const assetId = body.assetId ? String(body.assetId) : null

      const activeFy = await findActiveOpenFiscalYear(tenantDb, tenantId)

      if (!activeFy) {
        return NextResponse.json(
          {
            success: false,
            error:
              'سال مالی فعال و بازی وجود ندارد. برای محاسبه استهلاک ابتدا سال مالی فعال را تعریف/باز کنید.',
            code: 'NO_ACTIVE_FISCAL_YEAR',
          },
          { status: 400 }
        )
      }

      const where: any = { tenantId, status: 'active' }
      if (assetId) where.id = assetId

      const assets = await tenantDb.fixedAsset.findMany({ where })

      if (!assets || assets.length === 0) {
        return NextResponse.json({
          success: true,
          data: {
            processed: 0,
            skipped: 0,
            totalDepreciation: 0,
            journalEntries: 0,
            warnings: [],
          },
          message: 'هیچ دارایی فعالی برای استهلاک وجود ندارد',
        })
      }

      const accounts = await getAccountsByCode(tenantDb, tenantId)
      const now = toUtcDateOnly(new Date()) || new Date()

      let totalProcessed = 0
      let totalSkipped = 0
      let totalDepreciationAmount = 0
      let journalEntriesCount = 0
      const warnings: string[] = []

      for (const asset of assets) {
        const purchasePrice = roundMoney(safeNum(asset.purchasePrice))
        const salvageValue = roundMoney(safeNum(asset.salvageValue))
        const usefulLife = Math.max(
          1,
          Math.round(safeNum(asset.usefulLife) || 60)
        )
        const currentAccumDep = roundMoney(
          safeNum(asset.accumulatedDepreciation)
        )

        const depreciableBase = Math.max(0, purchasePrice - salvageValue)

        if (depreciableBase <= 0) {
          await updateFixedAssetSafe(tenantDb, asset.id, {
            accumulatedDepreciation: purchasePrice,
            bookValue: salvageValue,
            status: 'fully_depreciated',
          }).catch(() => {})

          totalSkipped++
          warnings.push(
            `دارایی ${asset.name} به دلیل ارزش اسقاط نامعتبر مستهلک کامل شد.`
          )
          continue
        }

        const monthlyDepreciation = depreciableBase / usefulLife

        if (monthlyDepreciation <= 0) {
          totalSkipped++
          continue
        }

        const startDate = toUtcDateOnly(
          asset.depreciationStartDate || asset.purchaseDate || asset.createdAt
        )

        const lastDepDate = toUtcDateOnly(
          asset.lastDepreciationDate || startDate
        )

        if (!startDate || !lastDepDate) {
          totalSkipped++
          warnings.push(
            `دارایی ${asset.name} تاریخ شروع استهلاک معتبر ندارد.`
          )
          continue
        }

        const monthsPassed = jalaliMonthsBetween(lastDepDate, now)

        if (monthsPassed <= 0) {
          totalSkipped++
          continue
        }

        const remainingDepreciable = Math.max(
          0,
          depreciableBase - currentAccumDep
        )

        if (remainingDepreciable <= 0.01) {
          await updateFixedAssetSafe(tenantDb, asset.id, {
            accumulatedDepreciation: depreciableBase,
            bookValue: salvageValue,
            status: 'fully_depreciated',
            lastDepreciationDate: now,
          }).catch(() => {})

          totalSkipped++
          continue
        }

        const calculatedDepreciation = monthlyDepreciation * monthsPassed
        const actualDepreciation = roundMoney(
          Math.min(calculatedDepreciation, remainingDepreciable)
        )

        if (actualDepreciation <= 0) {
          totalSkipped++
          continue
        }

        const newAccumDep = currentAccumDep + actualDepreciation
        const rawNewBookValue = purchasePrice - newAccumDep
        const newBookValue =
          rawNewBookValue <= salvageValue + 0.01
            ? salvageValue
            : roundMoney(rawNewBookValue)

        const isFullyDepreciated = newBookValue <= salvageValue + 0.01

        const depExpenseAccount =
          (asset.depExpenseAccountId
            ? Array.from(accounts.values()).find(
                (a: any) => String(a.id) === String(asset.depExpenseAccountId)
              )
            : null) ||
          accounts.get('5150') ||
          accounts.get('5100') ||
          null

        const accumDepAccount =
          (asset.accumDepAccountId
            ? Array.from(accounts.values()).find(
                (a: any) => String(a.id) === String(asset.accumDepAccountId)
              )
            : null) ||
          accounts.get('1401') ||
          accounts.get('1402') ||
          null

        if (!depExpenseAccount || !accumDepAccount) {
          totalSkipped++
          warnings.push(
            `برای دارایی ${asset.name} حساب هزینه استهلاک یا استهلاک انباشته یافت نشد. لطفاً کدهای ۵۱۰ و ۱۰۱ را در چارت حساب‌ها بررسی کنید.`
          )
          continue
        }

        const txClient: any = tenantDb

        await txClient.$transaction(async (tx: any) => {
          const jeNumber = await nextJournalNumber(tx, tenantId)

          const je = await createJournalEntrySafe(tx, {
            number: jeNumber,
            date: now,
            description: `سند استهلاک ${
              monthsPassed > 1 ? 'عقب‌افتاده' : 'ماهانه'
            } — ${asset.name}`,
            status: 'posted',
            sourceType: 'depreciation',
            sourceId: asset.id,
            totalDebit: actualDepreciation,
            totalCredit: actualDepreciation,
            createdBy: userId || null,
            tenantId,
            fiscalYearId: activeFy.id,
            lines: {
              create: [
                {
                  accountId: depExpenseAccount.id,
                  debit: actualDepreciation,
                  credit: 0,
                  description: `بدهکار: هزینه استهلاک ${asset.name} (${monthsPassed} ماه شمسی)`,
                },
                {
                  accountId: accumDepAccount.id,
                  debit: 0,
                  credit: actualDepreciation,
                  description: `بستانکار: استهلاک انباشته ${asset.name}`,
                },
              ],
            },
          })

          journalEntriesCount++

          await updateFixedAssetSafe(tx, asset.id, {
            accumulatedDepreciation: newAccumDep,
            bookValue: newBookValue,
            lastDepreciationDate: now,
            status: isFullyDepreciated ? 'fully_depreciated' : 'active',
          })
        })

        totalProcessed++
        totalDepreciationAmount += actualDepreciation
      }

      return NextResponse.json({
        success: true,
        data: {
          processed: totalProcessed,
          skipped: totalSkipped,
          totalDepreciation: roundMoney(totalDepreciationAmount),
          journalEntries: journalEntriesCount,
          warnings,
        },
        message:
          totalProcessed > 0
            ? `${totalProcessed} دارایی استهلاک شد — مجموع: ${roundMoney(
                totalDepreciationAmount
              ).toLocaleString('fa-IR')} ریال`
            : 'هیچ استهلاک جدیدی محاسبه نشد (احتمالاً همه به سقف رسیده‌اند یا ماه کاملی سپری نشده است).',
        fiscalYearId: activeFy.id,
        fiscalYearName: activeFy.name,
      })
    } catch (error: any) {
      console.error('[Depreciation POST] Error:', error?.message || error)

      return NextResponse.json(
        {
          success: false,
          error: error?.message || 'خطا در محاسبه استهلاک',
          code: error?.code || 'UNKNOWN',
        },
        { status: error?.status || 500 }
      )
    }
  }
)