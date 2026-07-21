// ============================================================================
// src/app/api/journal-entries/[id]/audit-log/route.ts — GET (v3.31 ★★★)
// ShopAccounting — View Audit Log for a Journal Entry
// ============================================================================
// ★★★ v3.31: مشاهده تاریخچه تغییرات یک سند حسابداری
//
// Supported methods:
//
//   GET /api/journal-entries/[id]/audit-log
//     - دریافت تمام AuditLogهای مربوط به یک سند
//     - خروجی:
//         {
//           success: true,
//           data: {
//             entry: { id, number, ... },
//             logs: [
//               {
//                 id, action, at, userId, username,
//                 details: { ... }
//               }
//             ]
//           }
//         }
//
// Audit Actions برای اسناد:
//   - JOURNAL_ENTRY_CREATE: ایجاد سند
//   - JOURNAL_ENTRY_UPDATE: ویرایش سند
//   - JOURNAL_ENTRY_CANCEL: ابطال سند
//   - JOURNAL_ENTRY_POST: ثبت (post) سند
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

// ═══════════════════════════════════════════════════════════════
//  GET — دریافت AuditLog سند
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    console.log('[JournalEntry AuditLog] Handler started, tenantId:', tenant?.tenantId)
    try {
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

      // ─── ۱. یافتن سند ─────────────────────────────────────────
      const entry = await tenantDb.journalEntry.findFirst({
        where: { id, tenantId },
        select: {
          id: true,
          number: true,
          date: true,
          description: true,
          status: true,
          sourceType: true,
          totalDebit: true,
          totalCredit: true,
          isCancelled: true,
          cancelledAt: true,
          cancelledBy: true,
          cancelReason: true,
          createdBy: true,
          createdAt: true,
          updatedAt: true,
        },
      })

      if (!entry) {
        return NextResponse.json(
          { success: false, error: 'سند یافت نشد' },
          { status: 404 }
        )
      }

      // ─── ۲. دریافت AuditLogها برای این سند ────────────────────
      //   جستجو بر اساس entityId = id و entityType = 'JournalEntry'
      let logs: any[] = []
      try {
        logs = await tenantDb.auditLogs.findMany({
          where: {
            tenantId,
            entityId: id,
            entityType: 'JournalEntry',
          },
          orderBy: { at: 'desc' },
        })
      } catch (err: any) {
        console.warn('[JournalEntry AuditLog] Cannot query auditLogs:', err?.message)
        // اگر جدول AuditLogs در دسترس نباشد، فقط اطلاعات سند را برمی‌گردانیم
      }

      // ─── ۳. دریافت اطلاعات کاربران (برای نمایش نام به‌جای id) ──
      const userIds = [...new Set([
        ...logs.map((l: any) => l.userId).filter(Boolean),
        entry.createdBy,
        entry.cancelledBy,
      ])] as string[]

      let userMap = new Map<string, { username: string; role: string }>()
      if (userIds.length > 0) {
        try {
          const users = await tenantDb.storeUser.findMany({
            where: { id: { in: userIds } },
            select: { id: true, username: true, role: true },
          })
          for (const u of users) {
            userMap.set(u.id, { username: u.username, role: u.role })
          }
        } catch (e) {
          // ignore
        }
      }

      // ─── ۴. تبدیل labelهای action به فارسی ────────────────────
      const actionLabels: Record<string, { label: string; color: string }> = {
        JOURNAL_ENTRY_CREATE: { label: 'ایجاد سند', color: 'emerald' },
        JOURNAL_ENTRY_UPDATE: { label: 'ویرایش سند', color: 'blue' },
        JOURNAL_ENTRY_CANCEL: { label: 'ابطال سند', color: 'red' },
        JOURNAL_ENTRY_POST:   { label: 'ثبت سند', color: 'emerald' },
      }

      const enrichedLogs = logs.map((log: any) => {
        const user = log.userId ? userMap.get(log.userId) : null
        const actionInfo = actionLabels[log.action] || { label: log.action, color: 'gray' }

        let parsedDetails: any = null
        try {
          if (log.details) {
            parsedDetails = JSON.parse(log.details)
          }
        } catch {
          parsedDetails = log.details
        }

        return {
          id: log.id,
          action: log.action,
          actionLabel: actionInfo.label,
          actionColor: actionInfo.color,
          at: log.at,
          userId: log.userId,
          username: user?.username || null,
          userRole: user?.role || null,
          details: parsedDetails,
        }
      })

      // ─── ۵. آماده‌سازی response ───────────────────────────────
      return NextResponse.json({
        success: true,
        data: {
          entry: {
            ...entry,
            createdByUsername: entry.createdBy ? userMap.get(entry.createdBy)?.username || null : null,
            cancelledByUsername: entry.cancelledBy ? userMap.get(entry.cancelledBy)?.username || null : null,
          },
          logs: enrichedLogs,
          logCount: enrichedLogs.length,
        },
      })
    } catch (error: any) {
      console.error('[JournalEntry AuditLog] Error:', error)
      return NextResponse.json(
        {
          success: false,
          error: error?.message || 'خطا در دریافت تاریخچه سند',
          code: error?.code || 'UNKNOWN',
        },
        { status: 500 }
      )
    }
  }
)
