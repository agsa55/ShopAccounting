// ============================================================================
// src/app/api/journal-entries/[id]/cancel/route.ts — POST (v3.31 ★★★)
// ShopAccounting — Cancel Journal Entry (ابطال سند)
// ============================================================================
// ★★★ v3.31: ابطال سند حسابداری به‌جای حذف
//
// Supported methods:
//
//   POST /api/journal-entries/[id]/cancel
//     - ابطال سند (به‌جای حذف)
//     - body: { reason?: string }
//     - قواعد:
//         ۱. سند باید posted باشد (نه draft یا قبلاً cancelled)
//         ۲. فقط اسناد دستی (sourceType=manual) قابل ابطال هستند
//         ۳. فقط مدیران (Manager/Admin/Owner) می‌توانند ابطال کنند
//         ۴. AuditLog ثبت می‌شود
//     - خروجی:
//         { success: true, data: { ...entry, isCancelled: true }, message: '...' }
//
// Audit Trail:
//   - isCancelled = true
//   - cancelledAt = now()
//   - cancelledBy = userId
//   - cancelReason = reason
//   - status = 'cancelled'
//   - AuditLog: action='JOURNAL_ENTRY_CANCEL', details={entryNumber, reason, ...}
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

// ═══════════════════════════════════════════════════════════════
//  POST — ابطال سند
// ═══════════════════════════════════════════════════════════════

export const POST = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    console.log('[JournalEntry Cancel] Handler started, tenantId:', tenant?.tenantId)
    try {
      // ★ بررسی دسترسی — فقط مدیران
      if (!['Manager', 'Admin', 'Owner'].includes(tenant.user?.role)) {
        return NextResponse.json(
          { success: false, error: 'فقط مدیران اجازه ابطال سند را دارند' },
          { status: 403 }
        )
      }

      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId
      // ★★★ Next.js 16: params یک Promise است و باید await شود
      const params = ctx.params && typeof (ctx.params as any).then === 'function'
        ? await ctx.params
        : (ctx.params || {})
      const id = params?.id

      if (!id) {
        return NextResponse.json(
          { success: false, error: 'شناسه سند الزامی است' },
          { status: 400 }
        )
      }

      const body = await req.json().catch(() => ({}))
      const reason = (body.reason || '').toString().trim().slice(0, 500) || null

      // ─── ۱. یافتن سند ─────────────────────────────────────────
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

      // ─── ۲. بررسی‌های اعتبارسنجی ───────────────────────────────

      // ★ قبلاً ابطال شده؟
      if (entry.isCancelled || entry.status === 'cancelled') {
        return NextResponse.json(
          { success: false, error: 'این سند قبلاً ابطال شده است' },
          { status: 400 }
        )
      }

      // ★ فقط اسناد posted قابل ابطال هستند
      if (entry.status !== 'posted') {
        return NextResponse.json(
          { success: false, error: `فقط اسناد ثبت‌شده (posted) قابل ابطال هستند. وضعیت فعلی: ${entry.status}` },
          { status: 400 }
        )
      }

      // ★ فقط اسناد دستی قابل ابطال هستند (نه اسناد خودکار فاکتور)
      //    اسناد خودکار باید با حذف/ابطال فاکتور مربوطه اصلاح شوند
      if (entry.sourceType && entry.sourceType !== 'manual') {
        return NextResponse.json(
          {
            success: false,
            error: `این سند به‌صورت خودکار از ${entry.sourceType === 'invoice' ? 'فاکتور' : entry.sourceType} ایجاد شده است. برای ابطال آن، ابتدا فاکتور مربوطه را اصلاح کنید.`,
            code: 'AUTO_ENTRY_NOT_CANCELLABLE',
          },
          { status: 400 }
        )
      }

      // ─── ۳. ابطال سند ─────────────────────────────────────────
      const now = new Date()
      const updated = await tenantDb.journalEntry.update({
        where: { id },
        data: {
          isCancelled: true,
          cancelledAt: now,
          cancelledBy: tenant.user?.id || null,
          cancelReason: reason,
          status: 'cancelled',
        },
        include: { lines: true },
      })

      console.log('[JournalEntry Cancel] Entry cancelled:', {
        tenantId,
        entryId: id,
        entryNumber: entry.number,
        cancelledBy: tenant.user?.id,
      })

      // ─── ۴. ثبت AuditLog ─────────────────────────────────────
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
              reason,
              cancelledAt: now.toISOString(),
              cancelledBy: tenant.user?.username || tenant.user?.id,
            }),
          },
        })
      } catch (auditErr: any) {
        console.warn('[JournalEntry Cancel] Audit log failed:', auditErr?.message)
        // ادامه می‌دهیم — ابطال مهم‌تر از audit log است
      }

      // ─── ۵. آماده‌سازی response ───────────────────────────────
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
            accountMap.set(acc.id, { code: acc.code || '-', name: acc.name || '-' })
          }
        } catch (e) {
          // ignore
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          id: updated.id,
          number: updated.number,
          date: updated.date,
          description: updated.description,
          status: updated.status,
          sourceType: updated.sourceType,
          totalDebit: updated.totalDebit,
          totalCredit: updated.totalCredit,
          fiscalYearId: updated.fiscalYearId || null,
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
      console.error('[JournalEntry Cancel] Error code:', error?.code)
      return NextResponse.json(
        {
          success: false,
          error: error?.message || 'خطا در ابطال سند',
          code: error?.code || 'UNKNOWN',
        },
        { status: 500 }
      )
    }
  }
)
