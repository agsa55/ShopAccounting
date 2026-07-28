// ============================================================================
// src/app/api/reports/consolidated/route.ts — GET (v3.18 — ENTERPRISE)
// ShopAccounting — Consolidated Reports for Multi-Branch
// ============================================================================
// ★★★ v3.18: گزارش تلفیقی همه شعب
//
// عملیات:
//   GET — گزارش تلفیقی فروش، سود/زیان، و اقساط همه شعب
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getFeaturesByPlanName } from '@/lib/plan-features'

export const GET = withTenantAndPermission('reports')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

    // ★ بررسی پلن سازمانی
    const features = getFeaturesByPlanName(tenant.planTierName)
    if (!features.canConsolidatedReports) {
      return NextResponse.json(
        { success: false, error: 'گزارش‌های تلفیقی فقط در پلن سازمانی در دسترس است' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(req.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    const dateFilter: any = {}
    if (startDate) dateFilter.gte = new Date(startDate)
    if (endDate) dateFilter.lte = new Date(endDate)

    // ─── ۱. آمار کلی ──────────────────────────────────────────
    const totalInvoices = await tenantDb.invoice.count({
      where: {
        tenantId,
        ...(Object.keys(dateFilter).length > 0 ? { invoiceDate: dateFilter } : {}),
        status: { notIn: ['cancelled', 'Cancelled'] },
      },
    })

    const totalSales = await tenantDb.invoice.aggregate({
      where: {
        tenantId,
        ...(Object.keys(dateFilter).length > 0 ? { invoiceDate: dateFilter } : {}),
        status: { notIn: ['cancelled', 'Cancelled'] },
      },
      _sum: { totalAmount: true },
    })

    // ─── ۲. آمار به تفکیک شعبه (بر اساس cashierId) ───────────
    const branchStats: any[] = []

    // ★ شعبه اصلی (بدون storeId)
    const mainBranchInvoices = await tenantDb.invoice.aggregate({
      where: {
        tenantId,
        cashier: { storeId: null },
        ...(Object.keys(dateFilter).length > 0 ? { invoiceDate: dateFilter } : {}),
        status: { notIn: ['cancelled', 'Cancelled'] },
      },
      _sum: { totalAmount: true },
      _count: true,
    })

    branchStats.push({
      branchId: 'main',
      branchName: 'شعبه اصلی',
      invoiceCount: mainBranchInvoices._count || 0,
      totalSales: mainBranchInvoices._sum.totalAmount || 0,
    })

    // ★ شعب دیگر
    try {
      const cashiers = await tenantDb.storeUser.findMany({
        where: { tenantId, storeId: { not: null } },
        select: { storeId: true, storeName: true },
        distinct: ['storeId'],
      })

      for (const c of cashiers) {
        if (!c.storeId) continue
        const branchInvoices = await tenantDb.invoice.aggregate({
          where: {
            tenantId,
            cashier: { storeId: c.storeId },
            ...(Object.keys(dateFilter).length > 0 ? { invoiceDate: dateFilter } : {}),
            status: { notIn: ['cancelled', 'Cancelled'] },
          },
          _sum: { totalAmount: true },
          _count: true,
        })

        branchStats.push({
          branchId: c.storeId,
          branchName: c.storeName || 'شعبه بدون نام',
          invoiceCount: branchInvoices._count || 0,
          totalSales: branchInvoices._sum.totalAmount || 0,
        })
      }
    } catch {}

    // ─── ۳. محاسبه سود/زیان تلفیقی ──────────────────────────
    let totalRevenue = 0
    let totalExpense = 0

    try {
      const entries = await tenantDb.journalEntry.findMany({
        where: {
          tenantId,
          status: 'posted',
          ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
        },
        include: { lines: true },
      })

      const accountsList = await tenantDb.account.findMany({
        where: { tenantId },
        select: { id: true, code: true, type: true, name: true },
      })

      const accountTypeMap = new Map<string, { type: string; code: string; name: string }>()
      for (const a of accountsList) {
        accountTypeMap.set(a.id, {
          type: (a.type || '').toLowerCase(),
          code: a.code || '',
          name: (a.name || '').toLowerCase(),
        })
      }

      for (const entry of entries) {
        for (const line of entry.lines || []) {
          const acc = accountTypeMap.get(line.accountId || '')
          if (!acc) continue

          const isRevenue = acc.type === 'revenue' || acc.type === 'sales' ||
            acc.code.startsWith('4') || acc.name.includes('فروش') || acc.name.includes('درآمد')
          const isExpense = acc.type === 'expense' || acc.type === 'cogs' || acc.type === 'cost' ||
            acc.code.startsWith('5') || acc.name.includes('هزینه') || acc.name.includes('بها تمام')

          if (isRevenue) {
            totalRevenue += (line.credit || 0) - (line.debit || 0)
          } else if (isExpense) {
            totalExpense += (line.debit || 0) - (line.credit || 0)
          }
        }
      }
    } catch (err: any) {
      console.warn('[Consolidated] Profit calculation failed:', err?.message)
    }

    // ─── ۴. اقساط تلفیقی ────────────────────────────────────
    let totalReceivable = 0
    try {
      const plans = await tenantDb.installmentPlan.aggregate({
        where: { tenantId, status: { in: ['active', 'Active'] } },
        _sum: { remainingAmount: true },
      })
      totalReceivable = plans._sum.remainingAmount || 0
    } catch {}

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalInvoices,
          totalSales: totalSales._sum.totalAmount || 0,
          totalRevenue,
          totalExpense,
          totalProfit: totalRevenue - totalExpense,
          totalReceivable,
        },
        branchStats,
      },
    })
  } catch (error: any) {
    console.error('[Consolidated] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در گزارش تلفیقی' },
      { status: 500 }
    )
  }
})
