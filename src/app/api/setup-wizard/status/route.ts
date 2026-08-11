// ============================================================================
// src/app/api/setup-wizard/status/route.ts — v2.1
// تشخیص وضعیت Wizard (بار اول / تمدید / قفل / آماده)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'
import { checkSubscriptionStatus } from '@/lib/plan-limits'
import { getFeaturesByPlanName, resolvePlanName } from '@/lib/plan-features'

export type SetupStatus =
  | 'first_setup'
  | 'renewal_setup'
  | 'locked_after_close'  // ★ جدید: سال بسته شده ولی تمدید نشده
  | 'ready'
  | 'no_subscription'

export const GET = withTenantAndPermission('dashboard')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantId = tenant.tenantId
      const tenantDb = tenant.tenantDb

      const subStatus = await checkSubscriptionStatus(tenantId)

      // ── بررسی سال‌های مالی ────────────────────────────────
      const allYears = await tenantDb.fiscalYear.findMany({
        where: { tenantId },
        orderBy: { startDate: 'desc' },
      })

      const activeYear = allYears.find((y: any) => y.isActive && !y.isClosed)
      const closedYears = allYears.filter((y: any) => y.isClosed)
      const lastClosedYear = closedYears[0] || null

      // ── بررسی انبارها ────────────────────────────────────
      const warehouses = await tenantDb.warehouse.findMany({
        where: { tenantId, isActive: true },
        orderBy: { createdAt: 'asc' },
      })

      // ── بررسی سند اختتامیه ──────────────────────────────
      let closingEntryInfo: any = null
      let closingDetails: any = null

      if (lastClosedYear) {
        const closingEntry = await tenantDb.journalEntry.findFirst({
          where: {
            tenantId,
            fiscalYearId: lastClosedYear.id,
            sourceType: 'fiscal_year_close',
          },
          orderBy: { createdAt: 'desc' },
          include: { lines: true },
        })

        if (closingEntry) {
          const netProfitMatch = closingEntry.description?.match(/سود\/زیان:\s*([\d,]+)\s*ریال/)
          let netProfit = 0
          if (netProfitMatch) {
            netProfit = parseInt(netProfitMatch[1].replace(/,/g, ''), 10) || 0
          }

          let totalRevenue = 0
          let totalExpense = 0
          const accountIds = closingEntry.lines.map((l: any) => l.accountId).filter(Boolean)

          if (accountIds.length > 0) {
            const accounts = await tenantDb.account.findMany({
              where: { id: { in: accountIds } },
              select: { id: true, type: true, code: true, name: true },
            })
            const accountMap = new Map<string, { id: string; type: string; code: string; name: string }>(
              accounts.map((a: any) => [a.id, a])
            )

            for (const line of closingEntry.lines) {
              const acc = accountMap.get(line.accountId)
              if (!acc) continue
              if (acc.type === 'درآمد') {
                totalRevenue += Number(line.debit || 0)
              } else if (acc.type === 'هزینه' || acc.type === 'بهای_تمام_شده') {
                totalExpense += Number(line.credit || 0)
              }
            }
          }

          closingEntryInfo = {
            number: closingEntry.number,
            date: closingEntry.date,
            netProfit: netProfit || (totalRevenue - totalExpense),
            totalRevenue,
            totalExpense,
          }

          const permanentAccounts = await tenantDb.account.findMany({
            where: {
              tenantId,
              isActive: true,
              type: { in: ['صندوق', 'بانک', 'موجودی', 'دریافتنی', 'دارایی', 'دارایی_ثابت', 'کاهنده_دارایی', 'پرداختنی', 'بدهی', 'سرمایه'] },
            },
            select: { id: true, code: true, name: true, type: true },
          })

          const openingItems: any[] = []
          const endDate = new Date(lastClosedYear.endDate)

          for (const acc of permanentAccounts) {
            const lines = await tenantDb.journalEntryLine.findMany({
              where: {
                accountId: acc.id,
                journalEntry: {
                  tenantId,
                  status: 'posted',
                  date: { lte: endDate },
                  isCancelled: false,
                },
              },
              select: { debit: true, credit: true },
            })

            let balance = 0
            for (const line of lines) {
              balance += Number(line.debit || 0) - Number(line.credit || 0)
            }

            if (Math.abs(balance) > 0.01) {
              openingItems.push({
                accountId: acc.id,
                accountCode: acc.code,
                accountName: acc.name,
                accountType: acc.type as string,
                balance,
              })
            }
          }

          closingDetails = {
            openingItems,
            totalAssets: openingItems
              .filter((i: any) => ['صندوق', 'بانک', 'موجودی', 'دریافتنی', 'دارایی', 'دارایی_ثابت'].includes(i.accountType))
              .reduce((s: number, i: any) => s + i.balance, 0),
            totalLiabilities: openingItems
              .filter((i: any) => ['پرداختنی', 'بدهی'].includes(i.accountType))
              .reduce((s: number, i: any) => s + Math.abs(i.balance), 0),
            totalEquity: openingItems
              .filter((i: any) => i.accountType === 'سرمایه')
              .reduce((s: number, i: any) => s + Math.abs(i.balance), 0),
          }
        }
      }

      // ── تصمیم‌گیری نهایی ────────────────────────────────────
         // ── تصمیم‌گیری نهایی ────────────────────────────────────
      let status: SetupStatus = 'ready'
      let wizardData: any = null

      // ★★★ منطق اصلی تصمیم‌گیری (v2.2 اصلاح شده)
      if (activeYear) {
        // ✅ سال فعال وجود دارد → آماده استفاده
        status = 'ready'
      } else if (allYears.length === 0) {
        // 🆕 هیچ سال مالی نیست → Wizard بار اول
        status = 'first_setup'
      } else if (lastClosedYear) {
        // ★ سال قبل بسته شده — بررسی وضعیت پلن
        const isLifetime = subStatus.isLifetime
        const isExpired = subStatus.isExpired || subStatus.status === 'read_only'

        // ★★★ منطق اصلاح‌شده:
        // - پلن مادام‌العمر → مستقیم wizard تمدید
        // - پلن سالانه منقضی → قفل + نیاز به پرداخت
        // - پلن سالانه تمدید شده → wizard تمدید (این همان مشکل بود!)
        if (isLifetime) {
          status = 'renewal_setup'
        } else if (isExpired) {
          // ★ فقط اگر واقعاً منقضی است → قفل
          status = 'locked_after_close'
        } else {
          // ★ پلن فعال است (تمدید شده) → Wizard تمدید باز شود
          console.log('[SetupWizardStatus] ✅ Plan renewed, opening renewal wizard')
          status = 'renewal_setup'
        }

        // wizardData برای هر دو حالت renewal_setup و locked_after_close
        const suggestedDates = calculateNextYearDates(lastClosedYear.endDate)
        const suggestedName = generateNextYearName(lastClosedYear.name)

        const features = getFeaturesByPlanName(resolvePlanName(subStatus.tierName))
        const maxWarehouses = features.maxWarehouses || (features.tier === 'enterprise' ? 999 : features.tier === 'professional' ? 2 : 1)

        wizardData = {
          lastClosedYear: {
            id: lastClosedYear.id,
            name: lastClosedYear.name,
            startDate: lastClosedYear.startDate,
            endDate: lastClosedYear.endDate,
            closedAt: lastClosedYear.closedAt,
          },
          closingEntry: closingEntryInfo,
          closingDetails,
          suggestedNewYear: {
            name: suggestedName,
            startDate: suggestedDates.startDate,
            endDate: suggestedDates.endDate,
          },
          existingWarehouses: warehouses.map((w: any) => ({
            id: w.id,
            name: w.name,
            code: w.code,
            isDefault: w.isDefault,
          })),
          planLimits: {
            maxWarehouses,
            currentWarehouses: warehouses.length,
          },
        }
      }

      // ★ لاگ برای debug
      console.log('[SetupWizardStatus] Decision:', {
        status,
        hasActiveYear: !!activeYear,
        hasLastClosedYear: !!lastClosedYear,
        isLifetime: subStatus.isLifetime,
        isExpired: subStatus.isExpired,
        subscriptionStatus: subStatus.status,
        daysRemaining: subStatus.daysRemaining,
      })
      
      return NextResponse.json({
        success: true,
        data: {
          status,
          wizardData,
          subscription: {
            tierNameFa: subStatus.tierNameFa,
            tierName: subStatus.tierName,
            billingCycle: subStatus.billingCycle,
            isLifetime: subStatus.isLifetime,
            isExpired: subStatus.isExpired,
            daysRemaining: subStatus.daysRemaining,
            status: subStatus.status,
            message: subStatus.message,
          },
        },
      })
    } catch (error: any) {
      console.error('[SetupWizardStatus] Error:', error?.message)
      return NextResponse.json(
        { success: false, error: 'خطا در بررسی وضعیت' },
        { status: 500 }
      )
    }
  }
)

function calculateNextYearDates(prevEndDate: any) {
  const startDate = new Date(prevEndDate)
  startDate.setDate(startDate.getDate() + 1)
  const endDate = new Date(startDate)
  endDate.setDate(endDate.getDate() + 364)
  return {
    startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
  }
}

function generateNextYearName(prevName: string): string {
  const faYearMatch = prevName.match(/([۰-۹]{4}|\d{4})/)
  if (faYearMatch) {
    const yearStr = faYearMatch[1]
    const isFa = /[۰-۹]/.test(yearStr)
    let year: number
    if (isFa) {
      year = parseInt(
        yearStr.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))),
        10
      )
    } else {
      year = parseInt(yearStr, 10)
    }
    const nextYear = year + 1
    const nextYearStr = isFa
      ? String(nextYear).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d, 10)])
      : String(nextYear)
    return prevName.replace(yearStr, nextYearStr)
  }
  return prevName + ' (بعدی)'
}