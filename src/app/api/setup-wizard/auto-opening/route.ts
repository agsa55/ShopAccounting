// ============================================================================
// src/app/api/setup-wizard/auto-opening/route.ts
// ★ v3.1: حذف type assertion `null as unknown as string`
// ★ پشتیبانی از پلن پایه (بدون سال مالی)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'

export const POST = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantId = tenant.tenantId
      const tenantDb = tenant.tenantDb
      const body = await req.json()

      const {
        newYearName,
        startDate,
        endDate,
        warehouseUpdates,
        isBasicPlan, // ★★★ فیلد برای پلن پایه
      } = body

      // ── ۱. یافتن آخرین سال بسته‌شده ────────────────────────
      const lastClosedYear = await tenantDb.fiscalYear.findFirst({
        where: { tenantId, isClosed: true },
        orderBy: { endDate: 'desc' },
      })

      // ── ۲. اجرای تراکنش ────────────────────────────────────
      const result = await tenantDb.$transaction(async (tx: any) => {
        // ۲.۱. به‌روزرسانی انبارها
        if (warehouseUpdates && Array.isArray(warehouseUpdates)) {
          for (const wh of warehouseUpdates) {
            if (wh.id && wh.name) {
              await tx.warehouse.update({
                where: { id: wh.id },
                data: { name: wh.name, code: wh.code || wh.name },
              })
            }
          }
        }

        let newYear: any = null
        let openingEntry: any = null

        // ── ۲.۲. پلن پایه: فقط انبارها، بدون سال مالی ────
        if (isBasicPlan) {
          console.log('[AutoOpening] 📦 Basic plan — skipping fiscal year creation')
          
          // صدور سند افتتاحیه بدون سال مالی
          const { createOpeningEntry } = await import('@/lib/accounting/closing-entry')
          // ★ v3.1: حذف type assertion — fiscalYearId اکنون nullable است
          const openingResult = await createOpeningEntry(
            tx,
            tenantId,
            null,  // بدون fiscalYearId برای پلن پایه
            'دوره جدید',
            new Date()
          )

          if (openingResult.success) {
            openingEntry = {
              number: openingResult.entryNumber,
              totalAssets: openingResult.totalAssets,
              totalLiabilities: openingResult.totalLiabilities,
              totalEquity: openingResult.totalEquity,
            }
          }

          return {
            newYear: null,
            openingEntry,
            fromYear: lastClosedYear?.name || 'دوره قبلی',
            isBasicPlan: true,
          }
        }

        // ── ۲.۳. پلن پیشرفته/حرفه‌ای: ایجاد سال جدید ────
        if (!lastClosedYear) {
          throw new Error('سال مالی بسته‌شده‌ای یافت نشد')
        }

        const start = new Date(startDate)
        const end = new Date(endDate)

        const overlapping = await tx.fiscalYear.findFirst({
          where: { tenantId, AND: [{ startDate: { lt: end } }, { endDate: { gt: start } }] },
        })

        if (overlapping) {
          throw new Error(`هم‌پوشانی با سال «${overlapping.name}»`)
        }

        newYear = await tx.fiscalYear.create({
          data: {
            tenantId,
            name: newYearName.trim(),
            startDate: start,
            endDate: end,
            isActive: true,
            isClosed: false,
          },
        })

        const { createOpeningEntry } = await import('@/lib/accounting/closing-entry')
        const openingResult = await createOpeningEntry(
          tx,
          tenantId,
          newYear.id,
          newYear.name,
          start
        )

        if (openingResult.success) {
          openingEntry = {
            number: openingResult.entryNumber,
            totalAssets: openingResult.totalAssets,
            totalLiabilities: openingResult.totalLiabilities,
            totalEquity: openingResult.totalEquity,
          }
        }

        return {
          newYear: {
            id: newYear.id,
            name: newYear.name,
            startDate: newYear.startDate,
            endDate: newYear.endDate,
          },
          openingEntry,
          fromYear: lastClosedYear.name,
          isBasicPlan: false,
        }
      })

      return NextResponse.json({
        success: true,
        message: isBasicPlan
          ? 'دوره جدید آماده شد و سند افتتاحیه صادر گردید'
          : `سال مالی «${result.newYear.name}» با موفقیت ایجاد و فعال شد`,
        data: result,
      })
    } catch (error: any) {
      console.error('[AutoOpening] Error:', error?.message)
      return NextResponse.json(
        { success: false, error: error?.message || 'خطا در ایجاد سال جدید' },
        { status: 500 }
      )
    }
  }
)