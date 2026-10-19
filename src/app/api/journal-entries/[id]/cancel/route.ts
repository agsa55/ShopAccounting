// ============================================================================
// src/app/api/journal-entries/[id]/cancel/route.ts — POST (v3.33)
// ShopAccounting — Cancel Journal Entry
// ============================================================================
// ★ v3.33:
//   - الزام دلیل لغو
//   - ایزولاسیون سال مالی
//   - جلوگیری از ابطال در سال مالی بسته
//   - اگر سند fiscalYearId نداشت، از سال مالی فعال باز استفاده می‌کند
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getActiveFiscalYear } from '@/lib/fiscal-year'

export const POST = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      if (!['Manager', 'Admin', 'Owner'].includes(tenant.user?.role)) {
        return NextResponse.json(
          { success: false, error: 'فقط مدیران اجازه ابطال سند را دارند' },
          { status: 403 }
        )
      }

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

      const body = await req.json().catch(() => ({}))
      const reason = (body.reason || '').toString().trim().slice(0, 500)

      if (!reason) {
        return NextResponse.json(
          { success: false, error: 'دلیل لغو سند الزامی است' },
          { status: 400 }
        )
      }

      const entry = await tenantDb.journalEntry.findFirst({
        where: { id, tenantId },
        include: { lines: true },
      })

      if (!entry) {
        return NextResponse.json(
          { success: false, error: 'سند یافت نشد' },
          { status: 404 }
        )
      }

      if (
        entry.isCancelled ||
        String(entry.status || '').toLowerCase() === 'cancelled'
      ) {
        return NextResponse.json(
          { success: false, error: 'این سند قبلاً ابطال شده است' },
          { status: 400 }
        )
      }

      if (String(entry.status || '').toLowerCase() !== 'posted') {
        return NextResponse.json(
          {
            success: false,
            error: `فقط اسناد ثبت‌شده قابل ابطال هستند. وضعیت فعلی: ${entry.status}`,
          },
          { status: 400 }
        )
      }

      if (entry.sourceType && entry.sourceType !== 'manual') {
        return NextResponse.json(
          {
            success: false,
            error: `این سند به‌صورت خودکار از ${
              entry.sourceType === 'invoice' ? 'فاکتور' : entry.sourceType
            } ایجاد شده است. برای ابطال آن، ابتدا سند/فاکتور منبع را اصلاح کنید.`,
            code: 'AUTO_ENTRY_NOT_CANCELLABLE',
          },
          { status: 400 }
        )
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
                err?.message ||
                'سال مالی فعالی برای ابطال سند یافت نشد.',
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
            error: 'سال مالی معتبری برای ابطال سند یافت نشد.',
            code: 'NO_VALID_FISCAL_YEAR',
          },
          { status: 400 }
        )
      }

      if (fy.isClosed) {
        return NextResponse.json(
          {
            success: false,
            error: `سال مالی «${fy.name}» بسته شده است و امکان ابطال سند وجود ندارد.`,
            code: 'FISCAL_YEAR_CLOSED',
          },
          { status: 400 }
        )
      }

      const now = new Date()

      const updated = await tenantDb.journalEntry.update({
        where: { id },
        data: {
          isCancelled: true,
          cancelledAt: now,
          cancelledBy: tenant.user?.id || null,
          cancelReason: reason,
          status: 'cancelled',
          fiscalYearId: entry.fiscalYearId || fy.id,
        },
        include: { lines: true },
      })

      try {
        await tenantDb.auditLogs.create({
          data: {
            id: crypto.randomUUID(),
            tenantId,
            userId: tenant.user?.id || null,
            action: 'JOURNAL_ENTRY_CANCEL',
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
              reason,
              cancelledAt: now.toISOString(),
              cancelledBy: tenant.user?.username || tenant.user?.id,
            }),
          },
        })
      } catch (auditErr: any) {
        console.warn(
          '[JournalEntry Cancel] Audit log failed:',
          auditErr?.message
        )
      }

      const accountIds = (updated.lines || [])
        .map((l: any) => l.accountId)
        .filter(Boolean)

      let accountMap = new Map<string, { code: string; name: string }>()

      if (accountIds.length > 0) {
        try {
          const accounts = await tenantDb.account.findMany({
            where: { id: { in: accountIds }, tenantId },
            select: { id: true, code: true, name: true },
          })

          for (const acc of accounts) {
            accountMap.set(acc.id, {
              code: acc.code || '-',
              name: acc.name || '-',
            })
          }
        } catch {
          // ignore
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          id: updated.id,
          number: updated.number,
          entryNumber: updated.number,
          date: updated.date,
          description: updated.description,
          status: updated.status,
          sourceType: updated.sourceType,
          totalDebit: updated.totalDebit,
          totalCredit: updated.totalCredit,
          fiscalYearId: updated.fiscalYearId || fy.id,
          fiscalYearName: fy.name,
          isCancelled: updated.isCancelled,
          cancelledAt: updated.cancelledAt,
          cancelledBy: updated.cancelledBy,
          cancelReason: updated.cancelReason,
          lines: (updated.lines || []).map((line: any) => {
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
          createdAt: updated.createdAt,
        },
        message: `سند «${entry.number}» با موفقیت ابطال شد`,
      })
    } catch (error: any) {
      console.error('[JournalEntry Cancel] Error:', error)

      return NextResponse.json(
        {
          success: false,
          error: error?.message || 'خطا در ابطال سند',
          code: error?.code || 'UNKNOWN',
        },
        { status: error?.status || 500 }
      )
    }
  }
)