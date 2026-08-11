// ============================================================================
// src/app/api/setup-wizard/auto-opening/route.ts
// ایجاد خودکار سال جدید + سند افتتاحیه از سال قبل
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
        warehouseUpdates, // [{id, name, code}]
      } = body

      // ── ۱. یافتن آخرین سال بسته‌شده ────────────────────────
      const lastClosedYear = await tenantDb.fiscalYear.findFirst({
        where: { tenantId, isClosed: true },
        orderBy: { endDate: 'desc' },
      })

      if (!lastClosedYear) {
        return NextResponse.json(
          { success: false, error: 'سال مالی بسته‌شده‌ای یافت نشد' },
          { status: 400 }
        )
      }

      // ── ۲. بررسی هم‌پوشانی ──────────────────────────────────
      const start = new Date(startDate)
      const end = new Date(endDate)

      const overlapping = await tenantDb.fiscalYear.findFirst({
        where: { tenantId, AND: [{ startDate: { lt: end } }, { endDate: { gt: start } }] },
      })

      if (overlapping) {
        return NextResponse.json(
          { success: false, error: `هم‌پوشانی با سال «${overlapping.name}»` },
          { status: 400 }
        )
      }

      // ── ۳. اجرای تراکنش ────────────────────────────────────
      const result = await tenantDb.$transaction(async (tx: any) => {
        // ۳.۱. به‌روزرسانی انبارها
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

        // ۳.۲. ایجاد سال جدید
        const newYear = await tx.fiscalYear.create({
          data: {
            tenantId,
            name: newYearName.trim(),
            startDate: start,
            endDate: end,
            isActive: true,
            isClosed: false,
          },
        })

        // ۳.۳. صدور سند افتتاحیه خودکار
        const { createOpeningEntry } = await import('@/lib/accounting/closing-entry')
        const openingResult = await createOpeningEntry(
          tx,
          tenantId,
          newYear.id,
          newYear.name,
          start
        )

        return {
          newYear: {
            id: newYear.id,
            name: newYear.name,
            startDate: newYear.startDate,
            endDate: newYear.endDate,
          },
          openingEntry: openingResult.success
            ? {
                number: openingResult.entryNumber,
                totalAssets: openingResult.totalAssets,
                totalLiabilities: openingResult.totalLiabilities,
                totalEquity: openingResult.totalEquity,
              }
            : null,
          fromYear: lastClosedYear.name,
        }
      })

      return NextResponse.json({
        success: true,
        message: `سال مالی «${result.newYear.name}» با موفقیت ایجاد و فعال شد`,
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