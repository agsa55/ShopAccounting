// ============================================================================
// src/app/api/journal-entries/[id]/post/route.ts — POST (v3.1 Fiscal Year Hardening)
// ShopAccounting — Post Draft Journal Entry
// ============================================================================
// ★ v3.1:
//   - الزام سال مالی باز برای ثبت نهایی
//   - اگر سند fiscalYearId نداشت، از سال مالی فعال استفاده می‌کند
//   - جلوگیری از post در سال مالی بسته
//   - اعتبارسنجی تاریخ سند در بازه سال مالی
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import {
  getActiveFiscalYear,
  validateDateInFiscalYear,
} from '@/lib/fiscal-year'

export const POST = withTenantAndPermission('accounting')(
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

      const entry = await tenantDb.journalEntry.findFirst({
        where: {
          id,
          tenantId,
        },
        select: {
          id: true,
          number: true,
          description: true,
          status: true,
          sourceType: true,
          isCancelled: true,
          totalDebit: true,
          totalCredit: true,
          date: true,
          fiscalYearId: true,
        },
      })

      if (!entry) {
        return NextResponse.json(
          { success: false, error: 'سند حسابداری یافت نشد' },
          { status: 404 }
        )
      }

      const currentStatus = String(entry.status || '').toUpperCase()

      if (entry.isCancelled === true || currentStatus === 'CANCELLED') {
        return NextResponse.json(
          { success: false, error: 'سند لغوشده قابل ثبت نهایی نیست' },
          { status: 400 }
        )
      }

      if (currentStatus === 'POSTED') {
        return NextResponse.json({
          success: true,
          message: 'این سند قبلاً ثبت نهایی شده است',
          data: {
            ...entry,
            entryNumber: entry.number,
            status: 'POSTED',
          },
        })
      }

      let fy: any = null

      if (entry.fiscalYearId) {
        fy = await tenantDb.fiscalYear.findFirst({
          where: {
            id: entry.fiscalYearId,
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
              error:
                err?.message || 'سال مالی فعالی برای ثبت نهایی سند یافت نشد.',
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
            error: 'سال مالی معتبری برای ثبت نهایی سند یافت نشد.',
            code: 'NO_VALID_FISCAL_YEAR',
          },
          { status: 400 }
        )
      }

      if (fy.isClosed) {
        return NextResponse.json(
          {
            success: false,
            error: `سال مالی «${fy.name}» بسته شده است و امکان ثبت نهایی سند وجود ندارد.`,
            code: 'FISCAL_YEAR_CLOSED',
          },
          { status: 400 }
        )
      }

      try {
        validateDateInFiscalYear(entry.date, fy)
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

      const updated = await tenantDb.journalEntry.update({
        where: { id },
        data: {
          status: 'posted',
          isCancelled: false,
          fiscalYearId: entry.fiscalYearId || fy.id,
        },
      })

      try {
        await tenantDb.auditLogs.create({
          data: {
            id: crypto.randomUUID(),
            tenantId,
            userId: tenant.user?.id || null,
            action: 'JOURNAL_ENTRY_POST',
            entityType: 'JournalEntry',
            entityId: id,
            details: JSON.stringify({
              entryNumber: entry.number,
              entryDate: entry.date,
              description: entry.description,
              totalDebit: entry.totalDebit,
              totalCredit: entry.totalCredit,
              fiscalYearId: updated.fiscalYearId || fy.id,
              fiscalYearName: fy.name,
              postedBy: tenant.user?.username || tenant.user?.id,
            }),
          },
        })
      } catch (auditErr: any) {
        console.warn(
          '[JournalEntry Post] Audit log failed:',
          auditErr?.message
        )
      }

      console.log('[JournalEntries][Post] ✅ Journal entry posted:', {
        id,
        tenantId,
        number: updated?.number,
        status: updated?.status,
        fiscalYearId: updated?.fiscalYearId,
      })

      return NextResponse.json({
        success: true,
        message: 'سند با موفقیت ثبت نهایی شد',
        data: {
          ...updated,
          entryNumber: updated.number,
          status: 'POSTED',
          fiscalYearId: updated.fiscalYearId || fy.id,
          fiscalYearName: fy.name,
        },
      })
    } catch (error: any) {
      console.error('[JournalEntries][Post] ❌ Error:', error)

      return NextResponse.json(
        {
          success: false,
          error: error?.message || 'خطا در ثبت نهایی سند',
          code: error?.code || 'UNKNOWN',
        },
        { status: error?.status || 500 }
      )
    }
  }
)