// ============================================================================
// src/app/api/reports/balance-sheet/route.ts — v3.31 ★★★
// ★ v3.31: 
//   - فیکس محاسبه مانده صندوق منفی (نمایش درست)
//   - اضافه کردن سود دوره به حقوق صاحبان سهام
//   - حذف درآمد/هزینه از ترازنامه
//   - ابطال سند با Reversal Entry
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getFeaturesByPlanName } from '@/lib/plan-features'

// ─── نوع حساب‌ها ────────────────────────────────────────────
const ASSET_TYPES = new Set([
  'asset', 'cash', 'bank', 'receivable', 'inventory',
  'fixed-asset', 'fixed_asset', 'prepaid', 'contra_asset',
])

const LIABILITY_TYPES = new Set([
  'liability', 'payable', 'loan', 'tax', 'tax-payable',
  'tax_payable', 'accrued', 'unearned',
])

const EQUITY_TYPES = new Set([
  'equity', 'capital', 'retained-earnings',
  'retained_earnings', 'owners-equity', 'owners_equity',
])

const REVENUE_TYPES = new Set([
  'revenue', 'service-revenue', 'service_revenue', 'income',
])

const EXPENSE_TYPES = new Set([
  'expense', 'cogs', 'repair_expense',
  'cost-of-goods-sold', 'cost_of_goods_sold',
])

// ─── تشخیص دسته حساب ────────────────────────────────────────
function categorizeAccount(acc: {
  code: string
  name: string
  type: string
}): 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'other' {
  const type = (acc.type || '').toLowerCase()
  const code = acc.code || ''
  const name = (acc.name || '').toLowerCase()
  const firstDigit = code.charAt(0)

  // بررسی type
  if (ASSET_TYPES.has(type))   return 'asset'
  if (LIABILITY_TYPES.has(type)) return 'liability'
  if (EQUITY_TYPES.has(type))  return 'equity'
  if (REVENUE_TYPES.has(type)) return 'revenue'
  if (EXPENSE_TYPES.has(type)) return 'expense'

  // بررسی code
  if (firstDigit === '1') return 'asset'
  if (firstDigit === '2') return 'liability'
  if (firstDigit === '3') return 'equity'
  if (firstDigit === '4') return 'revenue'
  if (firstDigit === '5') return 'expense'
  if (firstDigit === '6') return 'expense'

  // بررسی نام
  if (name.includes('صندوق') || name.includes('بانک') ||
      name.includes('موجودی') || name.includes('دریافتنی') ||
      name.includes('تجهیزات') || name.includes('دارایی')) return 'asset'
  if (name.includes('پرداختنی') || name.includes('وام') ||
      name.includes('بدهی') || name.includes('بستانکار')) return 'liability'
  if (name.includes('سرمایه') || name.includes('انباشته')) return 'equity'
  if (name.includes('درآمد') || name.includes('فروش')) return 'revenue'
  if (name.includes('هزینه') || name.includes('بهای تمام')) return 'expense'

  return 'other'
}

// ═══════════════════════════════════════════════════════════════
//  GET — ترازنامه
// ═══════════════════════════════════════════════════════════════
export const GET = withTenantAndPermission('accounting')(
  async (request: NextRequest, _context: any, tenant: any) => {
    console.log('[BalanceSheet] tenantId:', tenant?.tenantId)
    try {
      const features = getFeaturesByPlanName(tenant.planTierName)
      if (!features.canViewAccounts) {
        return NextResponse.json(
          { success: false, error: 'ترازنامه فقط در پلن حرفه‌ای و سازمانی در دسترس است' },
          { status: 403 }
        )
      }

      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      const { searchParams } = new URL(request.url)
      const asOfParam = searchParams.get('asOf')
      const asOf = asOfParam ? new Date(asOfParam) : new Date()
      if (isNaN(asOf.getTime())) {
        return NextResponse.json(
          { success: false, error: 'تاریخ asOf نامعتبر است' },
          { status: 400 }
        )
      }
      asOf.setHours(23, 59, 59, 999)
      const asOfISO = asOf.toISOString().split('T')[0]

      // ─── ۱. حساب‌های فعال ──────────────────────────────────
      const accounts = await tenantDb.account.findMany({
        where: { tenantId, isActive: true },
        orderBy: { code: 'asc' },
        select: { id: true, code: true, name: true, type: true },
      })

      if (accounts.length === 0) {
        return NextResponse.json({
          success: true,
          data: buildEmptyResponse(asOfISO),
        })
      }

      // ─── ۲. اسناد posted تا asOf ──────────────────────────
      const entries = await tenantDb.journalEntry.findMany({
        where: {
          tenantId,
          status: 'posted',
          date: { lte: asOf },
        },
        include: {
          lines: {
            select: { accountId: true, debit: true, credit: true },
          },
        },
      })

      console.log('[BalanceSheet] posted entries:', entries.length)

      // ─── ۳. محاسبه مانده هر حساب ──────────────────────────
      const balances = new Map<string, { debit: number; credit: number }>()
      for (const acc of accounts) {
        balances.set(acc.id, { debit: 0, credit: 0 })
      }

      for (const entry of entries) {
        for (const line of entry.lines || []) {
          if (!line.accountId) continue
          const b = balances.get(line.accountId)
          if (!b) continue
          b.debit  += Number(line.debit)  || 0
          b.credit += Number(line.credit) || 0
        }
      }

      // ─── ۴. دسته‌بندی ─────────────────────────────────────
      const assetsList:     any[] = []
      const liabilitiesList: any[] = []
      const equityList:     any[] = []
      let   totalRevenue  = 0
      let   totalExpense  = 0

      for (const acc of accounts) {
        const cat = categorizeAccount(acc)
        const b   = balances.get(acc.id) || { debit: 0, credit: 0 }

        let netBalance = 0

        if (cat === 'asset') {
          // دارایی: Dr - Cr
          // ★ اگر منفی بود → به بدهی تبدیل نشود، همان‌طور نگه دار
          netBalance = b.debit - b.credit

          if (Math.abs(netBalance) < 0.01) continue

          assetsList.push({
            id: acc.id, code: acc.code, name: acc.name, type: acc.type,
            debit: b.debit, credit: b.credit, balance: netBalance,
          })

        } else if (cat === 'liability') {
          // بدهی: Cr - Dr
          netBalance = b.credit - b.debit
          if (Math.abs(netBalance) < 0.01) continue

          liabilitiesList.push({
            id: acc.id, code: acc.code, name: acc.name, type: acc.type,
            debit: b.debit, credit: b.credit, balance: netBalance,
          })

        } else if (cat === 'equity') {
          // حقوق: Cr - Dr
          netBalance = b.credit - b.debit
          if (Math.abs(netBalance) < 0.01) continue

          equityList.push({
            id: acc.id, code: acc.code, name: acc.name, type: acc.type,
            debit: b.debit, credit: b.credit, balance: netBalance,
          })

        } else if (cat === 'revenue') {
          // درآمد → فقط جمع برای سود دوره
          totalRevenue += (b.credit - b.debit)

        } else if (cat === 'expense') {
          // هزینه → فقط جمع برای سود دوره
          totalExpense += (b.debit - b.credit)
        }
        // other → نادیده بگیر
      }

      // ─── ۵. سود دوره (Net Income) ─────────────────────────
      // ★ سود دوره = درآمد - هزینه
      // ★ به حقوق صاحبان سهام اضافه می‌شود (سود انباشته)
      const netIncome = totalRevenue - totalExpense

      console.log('[BalanceSheet] netIncome:', {
        totalRevenue, totalExpense, netIncome,
      })

      // ─── ۶. محاسبه جمع‌ها ──────────────────────────────────
      const totalAssets      = assetsList.reduce((s, a) => s + a.balance, 0)
      const totalLiabilities = liabilitiesList.reduce((s, a) => s + a.balance, 0)
      const totalEquityBase  = equityList.reduce((s, a) => s + a.balance, 0)

      // ★ حقوق صاحبان سهام = سرمایه + سود انباشته + سود دوره
      const totalEquity = totalEquityBase + netIncome

      const totalLiabilitiesAndEquity = totalLiabilities + totalEquity
      const difference  = totalAssets - totalLiabilitiesAndEquity
      const isBalanced  = Math.abs(difference) < 1  // تلرانس 1 ریال

      console.log('[BalanceSheet] Summary:', {
        totalAssets,
        totalLiabilities,
        totalEquityBase,
        netIncome,
        totalEquity,
        totalLiabilitiesAndEquity,
        difference,
        isBalanced,
      })

      // ─── ۷. خروجی ─────────────────────────────────────────
      return NextResponse.json({
        success: true,
        data: {
          asOf: asOfISO,

          assets: {
            accounts: assetsList,
            total: totalAssets,
          },
          liabilities: {
            accounts: liabilitiesList,
            total: totalLiabilities,
          },
          equity: {
            // ★ سود دوره به‌عنوان یک آیتم جداگانه
            accounts: [
              ...equityList,
              ...(Math.abs(netIncome) > 0.01
                ? [{
                    id: 'net-income',
                    code: '3100',
                    name: 'سود (زیان) دوره',
                    type: 'equity',
                    balance: netIncome,
                    isCalculated: true,
                  }]
                : []),
            ],
            total: totalEquity,
          },

          totalAssets,
          totalLiabilities,
          totalEquity,
          totalLiabilitiesAndEquity,
          isBalanced,
          difference,
          netIncome,
          retainedEarnings: netIncome,

          // اطلاعات اضافه
          accountCount: accounts.length,
          entryCount:   entries.length,
        },
      })

    } catch (error: any) {
      console.error('[BalanceSheet] Error:', error)
      return NextResponse.json(
        { success: false, error: error?.message || 'خطا در محاسبه ترازنامه' },
        { status: 500 }
      )
    }
  }
)

// ─── Helper ──────────────────────────────────────────────────
function buildEmptyResponse(asOfISO: string) {
  return {
    asOf: asOfISO,
    assets:      { accounts: [], total: 0 },
    liabilities: { accounts: [], total: 0 },
    equity:      { accounts: [], total: 0 },
    totalAssets: 0,
    totalLiabilities: 0,
    totalEquity: 0,
    totalLiabilitiesAndEquity: 0,
    isBalanced: true,
    difference: 0,
    netIncome: 0,
    retainedEarnings: 0,
    accountCount: 0,
    entryCount: 0,
  }
}