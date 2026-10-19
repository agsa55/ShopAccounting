// ============================================================================
// src/app/api/journal-entries/[id]/route.ts — GET (v2.0 Secure Tenant + Fiscal Year)
// ShopAccounting — Single Journal Entry API
// ============================================================================
// ★ v2.0:
//   - رفع باگ امنیتی: ایزولاسیون tenant اضافه شد
//   - استفاده از withTenantAndPermission
//   - بازگشت fiscalYear
//   - محاسبه balance از خطوط سند
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

export const GET = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      const params =
        ctx.params && typeof (ctx.params as any).then === 'function'
          ? await ctx.params
          : ctx.params || {}

      const id = params?.id

      if (!id) {
        return NextResponse.json(
          { success: false, error: 'شناسه سند الزامی است' },
          { status: 400 }
        )
      }

      let entry: any = null

      try {
        entry = await tenantDb.journalEntry.findFirst({
          where: { id, tenantId },
          include: { lines: true },
        })
      } catch {
        entry = await tenantDb.journalEntry
          .findFirst({
            where: { id, tenantId },
          })
          .catch(() => null)
      }

      if (!entry) {
        return NextResponse.json(
          { success: false, error: 'سند حسابداری یافت نشد' },
          { status: 404 }
        )
      }

      let lines: any[] = entry.lines || []

      if (!lines || lines.length === 0) {
        try {
          lines = await tenantDb.journalEntryLine.findMany({
            where: { journalEntryId: id },
            orderBy: { id: 'asc' },
          })
        } catch (linesErr: any) {
          console.warn(
            '[JournalEntry GET] Failed to get lines:',
            linesErr?.message
          )
          lines = []
        }
      }

      const accountIds = [
        ...new Set(lines.map((l: any) => l.accountId).filter(Boolean)),
      ] as string[]

      let accountsMap = new Map<string, any>()

      if (accountIds.length > 0) {
        try {
          const accounts = await tenantDb.account.findMany({
            where: { id: { in: accountIds }, tenantId },
            select: { id: true, code: true, name: true, type: true },
          })

          accountsMap = new Map(accounts.map((a: any) => [a.id, a]))
        } catch (accErr: any) {
          console.warn(
            '[JournalEntry GET] Failed to get accounts:',
            accErr?.message
          )
        }
      }

      lines = lines.map((line: any) => ({
        ...line,
        account: line.accountId ? accountsMap.get(line.accountId) || null : null,
        accountCode: line.accountId
          ? accountsMap.get(line.accountId)?.code || '-'
          : '-',
        accountName: line.accountId
          ? accountsMap.get(line.accountId)?.name || '-'
          : '-',
      }))

      let fiscalYear: any = null

      if (entry.fiscalYearId) {
        try {
          fiscalYear = await tenantDb.fiscalYear.findFirst({
            where: { id: entry.fiscalYearId, tenantId },
          })
        } catch {
          fiscalYear = null
        }
      }

      const totalDebit = lines.reduce(
        (sum: number, line: any) => sum + (Number(line.debit) || 0),
        0
      )

      const totalCredit = lines.reduce(
        (sum: number, line: any) => sum + (Number(line.credit) || 0),
        0
      )

      const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01

      return NextResponse.json({
        success: true,
        data: {
          ...entry,
          entryNumber: entry.number,
          lines,
          fiscalYear,
          fiscalYearId: entry.fiscalYearId || null,
          fiscalYearName: fiscalYear?.name || null,
          isBalanced,
          balanceDifference: totalDebit - totalCredit,
          computedTotalDebit: totalDebit,
          computedTotalCredit: totalCredit,
        },
      })
    } catch (error: any) {
      console.error('[JournalEntry GET]', error?.message)

      return NextResponse.json(
        {
          success: false,
          error: error?.message || 'خطای داخلی سرور',
          code: error?.code || 'UNKNOWN',
        },
        { status: error?.status || 500 }
      )
    }
  }
)