// ============================================================================
// src/app/api/recurring-journals/[id]/route.ts — PUT/DELETE (v5.4 ★★★ Final)
// ShopAccounting — Recurring Journals API (Update/Delete)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getFeaturesByPlanName } from '@/lib/plan-features'
import { calculateNextExecutionDate } from '../route'

// ═══════════════════════════════════════════════════════════════
//  PUT — به‌روزرسانی الگو (فعال/غیرفعال، ویرایش)
// ═══════════════════════════════════════════════════════════════

export const PUT = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId
      // ★★★ در Next.js 15+ پارامترها ممکن است Promise باشند
      const params = await Promise.resolve(ctx.params)
      const id = params?.id

      if (!id) {
        return NextResponse.json({ success: false, error: 'شناسه الزامی است' }, { status: 400 })
      }

      const features = getFeaturesByPlanName(tenant.planTierName)
      if (!features.canViewAccounts) {
        return NextResponse.json(
          { success: false, error: 'اسناد تکرارشونده فقط در پلن حرفه‌ای+ در دسترس است' },
          { status: 403 }
        )
      }

      const body = await req.json()

      const existing = await tenantDb.recurringJournal.findFirst({
        where: { id, tenantId },
      })

      if (!existing) {
        return NextResponse.json({ success: false, error: 'الگو یافت نشد' }, { status: 404 })
      }

      const updateData: any = {}

      if (body.title !== undefined) updateData.title = body.title.trim()
      if (body.description !== undefined) updateData.description = body.description || null
      if (body.isActive !== undefined) updateData.isActive = body.isActive
      if (body.autoPost !== undefined) updateData.autoPost = body.autoPost
      if (body.endDate !== undefined) updateData.endDate = body.endDate ? new Date(body.endDate) : null

      let frequencyChanged = false
      if (body.frequency !== undefined && body.frequency !== existing.frequency) {
        updateData.frequency = body.frequency
        frequencyChanged = true
      }
      if (body.dayOfMonth !== undefined) updateData.dayOfMonth = body.dayOfMonth
      if (body.dayOfWeek !== undefined) updateData.dayOfWeek = body.dayOfWeek
      if (body.monthOfYear !== undefined) updateData.monthOfYear = body.monthOfYear

      if (frequencyChanged || body.dayOfMonth !== undefined || body.dayOfWeek !== undefined || body.monthOfYear !== undefined) {
        updateData.nextExecutionDate = calculateNextExecutionDate(
          updateData.frequency || existing.frequency,
          updateData.dayOfMonth ?? existing.dayOfMonth,
          updateData.dayOfWeek ?? existing.dayOfWeek,
          updateData.monthOfYear ?? existing.monthOfYear,
          new Date()
        )
      }

      if (body.lines && Array.isArray(body.lines) && body.lines.length >= 2) {
        const totalDebit = body.lines.reduce((sum: number, l: any) => sum + (Number(l.debit) || 0), 0)
        const totalCredit = body.lines.reduce((sum: number, l: any) => sum + (Number(l.credit) || 0), 0)

        if (Math.abs(totalDebit - totalCredit) > 0.01) {
          return NextResponse.json(
            { success: false, error: `سند تراز نیست. بدهکار: ${totalDebit}, بستانکار: ${totalCredit}` },
            { status: 400 }
          )
        }

        updateData.journalLines = JSON.stringify(body.lines.map((l: any) => ({
          accountId: l.accountId || null,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          description: l.description || null,
        })))
      }

      const updated = await tenantDb.recurringJournal.update({
        where: { id },
        data: updateData,
      })

      return NextResponse.json({
        success: true,
        data: {
          id: updated.id,
          title: updated.title,
          isActive: updated.isActive,
          nextExecutionDate: updated.nextExecutionDate,
        },
        message: 'الگو با موفقیت به‌روزرسانی شد',
      })
    } catch (error: any) {
      console.error('[RecurringJournals PUT] Error:', error)
      return NextResponse.json({ success: false, error: 'خطا در به‌روزرسانی الگو' }, { status: 500 })
    }
  }
)

// ═══════════════════════════════════════════════════════════════
//  DELETE — حذف الگو
// ═══════════════════════════════════════════════════════════════

export const DELETE = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId
      const params = await Promise.resolve(ctx.params)
      const id = params?.id

      if (!id) {
        return NextResponse.json({ success: false, error: 'شناسه الزامی است' }, { status: 400 })
      }

      const existing = await tenantDb.recurringJournal.findFirst({
        where: { id, tenantId },
      })

      if (!existing) {
        return NextResponse.json({ success: false, error: 'الگو یافت نشد' }, { status: 404 })
      }

      await tenantDb.recurringJournal.delete({
        where: { id },
      })

      return NextResponse.json({
        success: true,
        message: 'الگو با موفقیت حذف شد',
      })
    } catch (error: any) {
      console.error('[RecurringJournals DELETE] Error:', error)
      return NextResponse.json({ success: false, error: 'خطا در حذف الگو' }, { status: 500 })
    }
  }
)