// ============================================================================
// src/app/api/fixed-assets/route.ts — v9.0 Accounting-Safe Fixed Assets API
// ShopAccounting — Fixed Assets CRUD
// ============================================================================
// ★ v9.0:
//   - تبدیل امن Decimal به number
//   - ثبت دارایی فقط در سال مالی فعال و باز
//   - تاریخ خرید باید داخل سال مالی فعال باشد
//   - صدور سند خرید با fiscalYearId در صورت پشتیبانی schema
//   - ویرایش مالی فقط اگر استهلاک انباشته صفر باشد
//   - حذف فقط اگر استهلاک/Sند استهلاک نداشته باشد
//   - GET همه دارایی‌ها را برمی‌گرداند؛ دارایی ثابت ثبت دائمی است
//   - بازگشت canEdit / canDelete برای frontend
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

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

function normalizeStatus(value: any): string {
  return String(value || '')
    .toLowerCase()
    .trim()
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

function parseDateInput(value: any): Date | null {
  return toUtcDateOnly(value)
}

function isSameOrAfter(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false
  return a.getTime() >= b.getTime()
}

function isSameOrBefore(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false
  return a.getTime() <= b.getTime()
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

async function findAllFiscalYears(tenantDb: any, tenantId: string): Promise<any[]> {
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

function isDateInsideFiscalYear(date: Date | null, fy: any): boolean {
  if (!date || !fy) return false

  const start = toUtcDateOnly(fy.startDate)
  const end = toUtcDateOnly(fy.endDate)

  if (!start || !end) return false

  return isSameOrAfter(date, start) && isSameOrBefore(date, end)
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

async function createFixedAssetSafe(tx: any, data: any): Promise<any> {
  try {
    return await tx.fixedAsset.create({ data })
  } catch (err: any) {
    const msg = String(err?.message || '')

    if (msg.includes('fiscalYearId')) {
      const { fiscalYearId, ...rest } = data
      return await tx.fixedAsset.create({ data: rest })
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
    const removable = ['fiscalYearId', 'lastDepreciationDate']

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

function mapAsset(
  asset: any,
  fyMap: Map<string, any>
): any {
  const purchasePrice = roundMoney(safeNum(asset?.purchasePrice))
  const salvageValue = roundMoney(safeNum(asset?.salvageValue))
  const usefulLife = Math.max(
    1,
    Math.round(safeNum(asset?.usefulLife) || 60)
  )
  const accumulatedDepreciation = roundMoney(
    safeNum(asset?.accumulatedDepreciation)
  )

  const bookValue =
    asset?.bookValue !== undefined && asset?.bookValue !== null
      ? roundMoney(safeNum(asset.bookValue))
      : Math.max(salvageValue, purchasePrice - accumulatedDepreciation)

  const depreciableBase = Math.max(0, purchasePrice - salvageValue)
  const monthlyDepreciation =
    usefulLife > 0 ? depreciableBase / usefulLife : 0

  const depreciatedMonths =
    monthlyDepreciation > 0
      ? Math.floor(accumulatedDepreciation / monthlyDepreciation)
      : usefulLife

  const status = normalizeStatus(asset?.status) || 'active'
  const fy = asset?.fiscalYearId
    ? fyMap.get(String(asset.fiscalYearId))
    : null

  const canDelete = Boolean(
    status === 'active' &&
      accumulatedDepreciation <= 0.01 &&
      (!fy || fy.isClosed !== true)
  )

  const canEdit = Boolean(
    status === 'active' && (!fy || fy.isClosed !== true)
  )

  return {
    id: asset.id,
    name: asset.name,
    code: asset.code,
    category: asset.category || 'تجهیزات',
    purchasePrice,
    salvageValue,
    usefulLife,
    purchaseDate: toISODateOnly(asset.purchaseDate),
    depreciationStartDate: toISODateOnly(
      asset.depreciationStartDate || asset.purchaseDate
    ),
    lastDepreciationDate: toISODateOnly(asset.lastDepreciationDate),
    depreciationMethod: asset.depreciationMethod || 'straight_line',
    accumulatedDepreciation,
    bookValue,
    monthlyDepreciation: roundMoney(monthlyDepreciation),
    remainingUsefulLifeMonths: Math.max(
      0,
      usefulLife - depreciatedMonths
    ),
    status,
    description: asset.description || null,
    accountId: asset.accountId || null,
    accumDepAccountId: asset.accumDepAccountId || null,
    depExpenseAccountId: asset.depExpenseAccountId || null,
    journalEntryId: asset.journalEntryId || null,
    fiscalYearId: asset.fiscalYearId || null,
    fiscalYearName: fy?.name || null,
    canEdit,
    canDelete,
    createdAt: asset.createdAt,
  }
}

async function safeFindAssets(tenantDb: any, where: any): Promise<any[]> {
  try {
    return await tenantDb.fixedAsset.findMany({
      where,
      orderBy: { purchaseDate: 'desc' },
    })
  } catch (err: any) {
    const msg = String(err?.message || '')

    if (msg.includes('purchaseDate')) {
      try {
        return await tenantDb.fixedAsset.findMany({
          where,
          orderBy: { createdAt: 'desc' },
        })
      } catch {
        return []
      }
    }

    console.warn('[FixedAssets GET] findMany error:', msg)
    return []
  }
}

// ═══════════════════════════════════════════════════════════════
// GET /api/fixed-assets
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      if (!tenantDb?.fixedAsset) {
        return NextResponse.json({
          success: true,
          data: { assets: [], stats: emptyStats() },
        })
      }

      const { searchParams } = new URL(req.url)
      const statusParam = (searchParams.get('status') || 'all')
        .trim()
        .toLowerCase()

      const where: any = { tenantId }
      if (statusParam !== 'all') where.status = statusParam

      const [assetsRaw, fiscalYears] = await Promise.all([
        safeFindAssets(tenantDb, where),
        findAllFiscalYears(tenantDb, tenantId),
      ])

      const fyMap = new Map<string, any>(
        (fiscalYears || []).map((fy: any) => [String(fy.id), fy])
      )

      const assets = (assetsRaw || []).map((a: any) =>
        mapAsset(a, fyMap)
      )

      const stats = assets.reduce(
        (acc: any, a: any) => {
          acc.total += 1

          if (a.status === 'active') acc.active += 1
          if (a.status === 'fully_depreciated') acc.fullyDepreciated += 1
          if (a.status === 'sold') acc.sold += 1

          acc.totalPurchasePrice += safeNum(a.purchasePrice)
          acc.totalAccumulatedDepreciation += safeNum(
            a.accumulatedDepreciation
          )
          acc.totalBookValue += safeNum(a.bookValue)

          return acc
        },
        {
          total: 0,
          active: 0,
          fullyDepreciated: 0,
          sold: 0,
          totalPurchasePrice: 0,
          totalAccumulatedDepreciation: 0,
          totalBookValue: 0,
        }
      )

      return NextResponse.json({
        success: true,
        data: {
          assets,
          stats: {
            ...stats,
            totalPurchasePrice: roundMoney(stats.totalPurchasePrice),
            totalAccumulatedDepreciation: roundMoney(
              stats.totalAccumulatedDepreciation
            ),
            totalBookValue: roundMoney(stats.totalBookValue),
          },
        },
        meta: {
          note: 'دارایی ثابت یک ثبت دائمی است و با تغییر سال مالی از لیست حذف نمی‌شود.',
        },
      })
    } catch (error: any) {
      console.error('[FixedAssets GET] Error:', error?.message || error)

      return NextResponse.json(
        {
          success: false,
          error: 'خطا در بارگذاری دارایی‌ها',
          code: error?.code || 'UNKNOWN',
        },
        { status: error?.status || 500 }
      )
    }
  }
)

function emptyStats() {
  return {
    total: 0,
    active: 0,
    fullyDepreciated: 0,
    sold: 0,
    totalPurchasePrice: 0,
    totalAccumulatedDepreciation: 0,
    totalBookValue: 0,
  }
}

// ═══════════════════════════════════════════════════════════════
// POST /api/fixed-assets
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

      const body = await req.json()

      const {
        name,
        code,
        category = 'تجهیزات',
        purchasePrice: rawPurchasePrice,
        salvageValue: rawSalvageValue = 0,
        usefulLife: rawUsefulLife = 60,
        purchaseDate: rawPurchaseDate,
        depreciationMethod = 'straight_line',
        description,
      } = body

      if (!name || !String(name).trim()) {
        return NextResponse.json(
          { success: false, error: 'نام دارایی الزامی است' },
          { status: 400 }
        )
      }

      if (!code || !String(code).trim()) {
        return NextResponse.json(
          { success: false, error: 'کد دارایی الزامی است' },
          { status: 400 }
        )
      }

      const purchasePrice = roundMoney(safeNum(rawPurchasePrice))
      const salvageValue = roundMoney(safeNum(rawSalvageValue))
      const usefulLife = Math.max(
        1,
        Math.round(safeNum(rawUsefulLife) || 60)
      )

      if (purchasePrice <= 0) {
        return NextResponse.json(
          { success: false, error: 'بهای خرید باید بزرگتر از صفر باشد' },
          { status: 400 }
        )
      }

      if (salvageValue < 0) {
        return NextResponse.json(
          { success: false, error: 'ارزش اسقاط نمی‌تواند منفی باشد' },
          { status: 400 }
        )
      }

      if (salvageValue >= purchasePrice) {
        return NextResponse.json(
          {
            success: false,
            error: 'ارزش اسقاط باید کمتر از بهای خرید باشد',
          },
          { status: 400 }
        )
      }

      const purchaseDate = parseDateInput(rawPurchaseDate) || toUtcDateOnly(new Date())

      if (!purchaseDate) {
        return NextResponse.json(
          { success: false, error: 'تاریخ خرید نامعتبر است' },
          { status: 400 }
        )
      }

      const today = toUtcDateOnly(new Date())

      if (today && purchaseDate > today) {
        return NextResponse.json(
          {
            success: false,
            error: 'تاریخ خرید نمی‌تواند در آینده باشد',
          },
          { status: 400 }
        )
      }

      const activeFy = await findActiveOpenFiscalYear(tenantDb, tenantId)

      if (!activeFy) {
        return NextResponse.json(
          {
            success: false,
            error:
              'سال مالی فعال و بازی وجود ندارد. برای ثبت دارایی جدید ابتدا سال مالی فعال را تعریف/باز کنید.',
            code: 'NO_ACTIVE_FISCAL_YEAR',
          },
          { status: 400 }
        )
      }

      if (!isDateInsideFiscalYear(purchaseDate, activeFy)) {
        return NextResponse.json(
          {
            success: false,
            error: `تاریخ خرید باید داخل سال مالی فعال «${activeFy.name}» باشد.`,
            code: 'PURCHASE_DATE_OUT_OF_FISCAL_YEAR',
          },
          { status: 400 }
        )
      }

      const accounts = await getAccountsByCode(tenantDb, tenantId)

      const assetAccount =
        accounts.get('1400') ||
        accounts.get('140') ||
        null

      const accumDepAccount =
        accounts.get('1401') ||
        accounts.get('1402') ||
        assetAccount ||
        null

      const depExpenseAccount =
        accounts.get('5150') ||
        accounts.get('5100') ||
        null

      const cashAccount =
        accounts.get('1010') ||
        accounts.get('1100') ||
        null

      const depreciableBase = Math.max(0, purchasePrice - salvageValue)
      const monthlyDepreciation =
        usefulLife > 0 ? depreciableBase / usefulLife : 0
      const depreciationRate =
        purchasePrice > 0 ? (monthlyDepreciation / purchasePrice) * 100 : 0

      const txClient: any = tenantDb

      const result = await txClient.$transaction(async (tx: any) => {
        const asset = await createFixedAssetSafe(tx, {
          data: {
            tenantId,
            name: String(name).trim(),
            code: String(code).trim(),
            category: String(category).trim(),
            purchasePrice,
            salvageValue,
            usefulLife,
            depreciationRate,
            accumulatedDepreciation: 0,
            bookValue: purchasePrice,
            purchaseDate,
            depreciationStartDate: purchaseDate,
            depreciationMethod: String(depreciationMethod || 'straight_line'),
            status: 'active',
            accountId: assetAccount?.id || null,
            accumDepAccountId: accumDepAccount?.id || null,
            depExpenseAccountId: depExpenseAccount?.id || null,
            description: description ? String(description).trim() : null,
            fiscalYearId: activeFy.id,
          },
        })

        let journalEntryId: string | null = null

        if (assetAccount && cashAccount) {
          const jeNumber = await nextJournalNumber(tx, tenantId)

          const je = await createJournalEntrySafe(tx, {
            number: jeNumber,
            date: purchaseDate,
            description: `سند خرید دارایی ثابت — ${asset.name}`,
            status: 'posted',
            sourceType: 'fixed_asset_purchase',
            sourceId: asset.id,
            totalDebit: purchasePrice,
            totalCredit: purchasePrice,
            createdBy: userId || null,
            tenantId,
            fiscalYearId: activeFy.id,
            lines: {
              create: [
                {
                  accountId: assetAccount.id,
                  debit: purchasePrice,
                  credit: 0,
                  description: `بدهکار: خرید دارایی ثابت ${asset.name}`,
                },
                {
                  accountId: cashAccount.id,
                  debit: 0,
                  credit: purchasePrice,
                  description: `بستانکار: پرداخت بابت ${asset.name}`,
                },
              ],
            },
          })

          journalEntryId = je.id

          await updateFixedAssetSafe(tx, asset.id, {
            journalEntryId,
          })
        }

        return {
          ...asset,
          journalEntryId,
        }
      })

      const fyMap = new Map<string, any>([[String(activeFy.id), activeFy]])

      return NextResponse.json({
        success: true,
        data: mapAsset(result, fyMap),
        message: `دارایی ثابت «${result.name}» ثبت شد${
          result.journalEntryId ? ' و سند خرید آن صادر شد' : ''
        }`,
      })
    } catch (error: any) {
      console.error('[FixedAssets POST] Error:', error?.message || error)

      return NextResponse.json(
        {
          success: false,
          error: error?.message || 'خطا در ثبت دارایی',
          code: error?.code || 'UNKNOWN',
        },
        { status: error?.status || 500 }
      )
    }
  }
)

// ═══════════════════════════════════════════════════════════════
// PUT /api/fixed-assets
// ═══════════════════════════════════════════════════════════════

export const PUT = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      if (!tenantDb?.fixedAsset) {
        return NextResponse.json(
          { success: false, error: 'مدل دارایی ثابت در دیتابیس وجود ندارد' },
          { status: 400 }
        )
      }

      const body = await req.json()
      const id = body.id

      if (!id) {
        return NextResponse.json(
          { success: false, error: 'شناسه دارایی الزامی است' },
          { status: 400 }
        )
      }

      const asset = await tenantDb.fixedAsset.findFirst({
        where: { id, tenantId },
      })

      if (!asset) {
        return NextResponse.json(
          { success: false, error: 'دارایی یافت نشد' },
          { status: 404 }
        )
      }

      const status = normalizeStatus(asset.status)
      const accumulated = roundMoney(
        safeNum(asset.accumulatedDepreciation)
      )

      if (status === 'sold') {
        return NextResponse.json(
          {
            success: false,
            error: 'دارایی فروخته‌شده قابل ویرایش نیست.',
          },
          { status: 400 }
        )
      }

      const fiscalYears = await findAllFiscalYears(tenantDb, tenantId)
      const fyMap = new Map<string, any>(
        (fiscalYears || []).map((fy: any) => [String(fy.id), fy])
      )

      const assetFy = asset.fiscalYearId
        ? fyMap.get(String(asset.fiscalYearId))
        : null

      if (assetFy?.isClosed) {
        return NextResponse.json(
          {
            success: false,
            error: `سال مالی «${assetFy.name}» بسته شده است و امکان ویرایش این دارایی وجود ندارد.`,
            code: 'FISCAL_YEAR_CLOSED',
          },
          { status: 400 }
        )
      }

      const financialLocked = accumulated > 0.01 || status !== 'active'

      const updateData: any = {}

      if (body.name !== undefined) {
        if (!String(body.name).trim()) {
          return NextResponse.json(
            { success: false, error: 'نام دارایی نمی‌تواند خالی باشد' },
            { status: 400 }
          )
        }
        updateData.name = String(body.name).trim()
      }

      if (body.code !== undefined) {
        if (!String(body.code).trim()) {
          return NextResponse.json(
            { success: false, error: 'کد دارایی نمی‌تواند خالی باشد' },
            { status: 400 }
          )
        }
        updateData.code = String(body.code).trim()
      }

      if (body.category !== undefined) {
        updateData.category = String(body.category).trim() || 'تجهیزات'
      }

      if (body.description !== undefined) {
        updateData.description = body.description
          ? String(body.description).trim()
          : null
      }

      const requestedPurchasePrice =
        body.purchasePrice !== undefined
          ? roundMoney(safeNum(body.purchasePrice))
          : null

      const requestedSalvageValue =
        body.salvageValue !== undefined
          ? roundMoney(safeNum(body.salvageValue))
          : null

      const requestedUsefulLife =
        body.usefulLife !== undefined
          ? Math.max(1, Math.round(safeNum(body.usefulLife)))
          : null

      const requestedPurchaseDate =
        body.purchaseDate !== undefined
          ? parseDateInput(body.purchaseDate)
          : null

      if (financialLocked) {
        const currentPurchasePrice = roundMoney(
          safeNum(asset.purchasePrice)
        )
        const currentSalvageValue = roundMoney(
          safeNum(asset.salvageValue)
        )
        const currentUsefulLife = Math.max(
          1,
          Math.round(safeNum(asset.usefulLife))
        )
        const currentPurchaseDate = toISODateOnly(asset.purchaseDate)

        if (
          requestedPurchasePrice !== null &&
          requestedPurchasePrice !== currentPurchasePrice
        ) {
          return NextResponse.json(
            {
              success: false,
              error:
                'تغییر بهای خرید دارایی مستهلک‌شده مجاز نیست. برای اصلاح، از سند اصلاحی استفاده کنید.',
            },
            { status: 400 }
          )
        }

        if (
          requestedSalvageValue !== null &&
          requestedSalvageValue !== currentSalvageValue
        ) {
          return NextResponse.json(
            {
              success: false,
              error:
                'تغییر ارزش اسقاط دارایی مستهلک‌شده مجاز نیست.',
            },
            { status: 400 }
          )
        }

        if (
          requestedUsefulLife !== null &&
          requestedUsefulLife !== currentUsefulLife
        ) {
          return NextResponse.json(
            {
              success: false,
              error:
                'تغییر عمر مفید دارایی مستهلک‌شده مجاز نیست.',
            },
            { status: 400 }
          )
        }

        if (
          requestedPurchaseDate !== null &&
          toISODateOnly(requestedPurchaseDate) !== currentPurchaseDate
        ) {
          return NextResponse.json(
            {
              success: false,
              error:
                'تغییر تاریخ خرید دارایی مستهلک‌شده مجاز نیست.',
            },
            { status: 400 }
          )
        }
      } else {
        if (requestedPurchasePrice !== null) {
          if (requestedPurchasePrice <= 0) {
            return NextResponse.json(
              {
                success: false,
                error: 'بهای خرید باید بزرگتر از صفر باشد',
              },
              { status: 400 }
            )
          }

          updateData.purchasePrice = requestedPurchasePrice
        }

        if (requestedSalvageValue !== null) {
          if (requestedSalvageValue < 0) {
            return NextResponse.json(
              {
                success: false,
                error: 'ارزش اسقاط نمی‌تواند منفی باشد',
              },
              { status: 400 }
            )
          }

          updateData.salvageValue = requestedSalvageValue
        }

        if (requestedUsefulLife !== null) {
          updateData.usefulLife = requestedUsefulLife
        }

        if (requestedPurchaseDate !== null) {
          if (asset.journalEntryId) {
            return NextResponse.json(
              {
                success: false,
                error:
                  'چون سند خرید دارایی صادر شده است، تغییر تاریخ خرید مجاز نیست.',
              },
              { status: 400 }
            )
          }

          const today = toUtcDateOnly(new Date())
          if (today && requestedPurchaseDate > today) {
            return NextResponse.json(
              {
                success: false,
                error: 'تاریخ خرید نمی‌تواند در آینده باشد',
              },
              { status: 400 }
            )
          }

          const activeFy = await findActiveOpenFiscalYear(
            tenantDb,
            tenantId
          )

          if (!activeFy) {
            return NextResponse.json(
              {
                success: false,
                error: 'سال مالی فعال و بازی برای تغییر تاریخ خرید وجود ندارد.',
              },
              { status: 400 }
            )
          }

          if (!isDateInsideFiscalYear(requestedPurchaseDate, activeFy)) {
            return NextResponse.json(
              {
                success: false,
                error: `تاریخ خرید جدید باید داخل سال مالی فعال «${activeFy.name}» باشد.`,
              },
              { status: 400 }
            )
          }

          updateData.purchaseDate = requestedPurchaseDate
          updateData.depreciationStartDate = requestedPurchaseDate
        }
      }

      const finalPurchasePrice = roundMoney(
        safeNum(updateData.purchasePrice ?? asset.purchasePrice)
      )

      const finalSalvageValue = roundMoney(
        safeNum(updateData.salvageValue ?? asset.salvageValue)
      )

      const finalUsefulLife = Math.max(
        1,
        Math.round(safeNum(updateData.usefulLife ?? asset.usefulLife))
      )

      if (finalSalvageValue >= finalPurchasePrice) {
        return NextResponse.json(
          {
            success: false,
            error: 'ارزش اسقاط باید کمتر از بهای خرید باشد',
          },
          { status: 400 }
        )
      }

      const depreciableBase = Math.max(
        0,
        finalPurchasePrice - finalSalvageValue
      )

      const monthlyDepreciation =
        finalUsefulLife > 0 ? depreciableBase / finalUsefulLife : 0

      const depreciationRate =
        finalPurchasePrice > 0
          ? (monthlyDepreciation / finalPurchasePrice) * 100
          : 0

      updateData.depreciationRate = depreciationRate
      updateData.bookValue = Math.max(
        finalSalvageValue,
        finalPurchasePrice - accumulated
      )

      await updateFixedAssetSafe(tenantDb, id, updateData)

      return NextResponse.json({
        success: true,
        message: 'دارایی با موفقیت ویرایش شد',
      })
    } catch (error: any) {
      console.error('[FixedAssets PUT] Error:', error?.message || error)

      return NextResponse.json(
        {
          success: false,
          error: error?.message || 'خطا در ویرایش دارایی',
          code: error?.code || 'UNKNOWN',
        },
        { status: error?.status || 500 }
      )
    }
  }
)

// ═══════════════════════════════════════════════════════════════
// DELETE /api/fixed-assets
// ═══════════════════════════════════════════════════════════════

export const DELETE = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      if (!tenantDb?.fixedAsset) {
        return NextResponse.json(
          { success: false, error: 'مدل دارایی ثابت در دیتابیس وجود ندارد' },
          { status: 400 }
        )
      }

      const { searchParams } = new URL(req.url)
      const id = searchParams.get('id')

      if (!id) {
        return NextResponse.json(
          { success: false, error: 'شناسه دارایی الزامی است' },
          { status: 400 }
        )
      }

      const asset = await tenantDb.fixedAsset.findFirst({
        where: { id, tenantId },
      })

      if (!asset) {
        return NextResponse.json(
          { success: false, error: 'دارایی یافت نشد' },
          { status: 404 }
        )
      }

      const status = normalizeStatus(asset.status)
      const accumulated = roundMoney(
        safeNum(asset.accumulatedDepreciation)
      )

      if (status !== 'active') {
        return NextResponse.json(
          {
            success: false,
            error: 'فقط دارایی‌های فعال قابل حذف هستند.',
          },
          { status: 400 }
        )
      }

      if (accumulated > 0.01) {
        return NextResponse.json(
          {
            success: false,
            error:
              'دارایی مستهلک‌شده قابل حذف نیست. برای خارج کردن آن از فرآیند فروش/اسقاط دارایی استفاده کنید.',
          },
          { status: 400 }
        )
      }

      let depreciationJeCount = 0

      try {
        depreciationJeCount = await tenantDb.journalEntry.count({
          where: {
            tenantId,
            sourceType: 'depreciation',
            sourceId: id,
          },
        })
      } catch {
        depreciationJeCount = 0
      }

      if (depreciationJeCount > 0) {
        return NextResponse.json(
          {
            success: false,
            error:
              'این دارایی سند استهلاک دارد و قابل حذف نیست.',
          },
          { status: 400 }
        )
      }

      const fiscalYears = await findAllFiscalYears(tenantDb, tenantId)
      const fyMap = new Map<string, any>(
        (fiscalYears || []).map((fy: any) => [String(fy.id), fy])
      )

      const assetFy = asset.fiscalYearId
        ? fyMap.get(String(asset.fiscalYearId))
        : null

      if (assetFy?.isClosed) {
        return NextResponse.json(
          {
            success: false,
            error: `سال مالی «${assetFy.name}» بسته شده است و امکان حذف این دارایی وجود ندارد.`,
            code: 'FISCAL_YEAR_CLOSED',
          },
          { status: 400 }
        )
      }

      const txClient: any = tenantDb

      await txClient.$transaction(async (tx: any) => {
        if (asset.journalEntryId) {
          await tx.journalEntry
            .update({
              where: { id: asset.journalEntryId },
              data: {
                status: 'cancelled',
                isCancelled: true,
                cancelledAt: new Date(),
                cancelReason: `حذف دارایی ${asset.name}`,
                description: `ابطال شده — حذف دارایی ${asset.name}`,
              },
            })
            .catch((err: any) =>
              console.warn(
                '[FixedAssets DELETE] Failed to cancel purchase JE:',
                err?.message
              )
            )
        }

        await tx.journalEntry
          .updateMany({
            where: {
              tenantId,
              sourceType: 'fixed_asset_purchase',
              sourceId: id,
            },
            data: {
              status: 'cancelled',
              isCancelled: true,
              cancelledAt: new Date(),
              cancelReason: `حذف دارایی ${asset.name}`,
            },
          })
          .catch((err: any) =>
            console.warn(
              '[FixedAssets DELETE] Failed to cancel related JEs:',
              err?.message
            )
          )

        await tx.fixedAsset.delete({ where: { id } })
      })

      return NextResponse.json({
        success: true,
        message: 'دارایی ثابت و سند مرتبط آن ابطال/حذف شد',
      })
    } catch (error: any) {
      console.error('[FixedAssets DELETE] Error:', error?.message || error)

      return NextResponse.json(
        {
          success: false,
          error: error?.message || 'خطا در حذف دارایی',
          code: error?.code || 'UNKNOWN',
        },
        { status: error?.status || 500 }
      )
    }
  }
)