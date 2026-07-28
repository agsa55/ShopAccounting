// ============================================================================
// src/app/api/sms-settings/route.ts — GET/PUT (v5.2 ★★★ Phase 4)
// ShopAccounting — SMS Settings API per tenant
// ----------------------------------------------------------------------------
// GET  /api/sms-settings      → دریافت تنظیمات فعلی
// PUT  /api/sms-settings      → به‌روزرسانی تنظیمات
//
// ★ نیاز به توکن معتبر دارد (withTenantIsolation)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantIsolation } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'
import { getSmsSettings } from '@/lib/sms/notification'

// ═══════════════════════════════════════════════════════════════
//  GET — دریافت تنظیمات SMS
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantIsolation(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const settings = await getSmsSettings(tenant.tenantId)

      return NextResponse.json({
        success: true,
        data: settings,
      })
    } catch (error: any) {
      console.error('[SMS Settings GET] Error:', error)
      return NextResponse.json(
        { success: false, error: 'خطا در دریافت تنظیمات' },
        { status: 500 }
      )
    }
  }
)

// ═══════════════════════════════════════════════════════════════
//  PUT — به‌روزرسانی تنظیمات SMS
// ═══════════════════════════════════════════════════════════════

export const PUT = withTenantIsolation(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const body = await req.json()
      const {
        isEnabled,
        daysBeforeDue,
        sendOnDueDate,
        daysAfterDue,
        sendHour,
        sendMinute,
        customMessageTemplate,
      } = body

      // ★ اعتبارسنجی
      if (typeof isEnabled !== 'boolean' && isEnabled !== undefined) {
        return NextResponse.json(
          { success: false, error: 'مقدار isEnabled باید boolean باشد' },
          { status: 400 }
        )
      }

      if (daysBeforeDue !== undefined && (daysBeforeDue < 0 || daysBeforeDue > 30)) {
        return NextResponse.json(
          { success: false, error: 'daysBeforeDue باید بین ۰ تا ۳۰ باشد' },
          { status: 400 }
        )
      }

      if (daysAfterDue !== undefined && (daysAfterDue < 0 || daysAfterDue > 30)) {
        return NextResponse.json(
          { success: false, error: 'daysAfterDue باید بین ۰ تا ۳۰ باشد' },
          { status: 400 }
        )
      }

      if (sendHour !== undefined && (sendHour < 0 || sendHour > 23)) {
        return NextResponse.json(
          { success: false, error: 'sendHour باید بین ۰ تا ۲۳ باشد' },
          { status: 400 }
        )
      }

      // ★★★ v5.2.1: اعتبارسنجی دقیقه
      if (sendMinute !== undefined && (sendMinute < 0 || sendMinute > 59)) {
        return NextResponse.json(
          { success: false, error: 'sendMinute باید بین ۰ تا ۵۹ باشد' },
          { status: 400 }
        )
      }

      // ★ ساخت object داده‌ها (فقط فیلدهای ارسال شده)
      const updateData: any = {}
      if (isEnabled !== undefined) updateData.isEnabled = isEnabled
      if (daysBeforeDue !== undefined) updateData.daysBeforeDue = daysBeforeDue
      if (sendOnDueDate !== undefined) updateData.sendOnDueDate = sendOnDueDate
      if (daysAfterDue !== undefined) updateData.daysAfterDue = daysAfterDue
      if (sendHour !== undefined) updateData.sendHour = sendHour
      if (sendMinute !== undefined) updateData.sendMinute = sendMinute
      if (customMessageTemplate !== undefined) {
        updateData.customMessageTemplate = customMessageTemplate || null
      }

      // ★ upsert (اگر وجود نداشت، ایجاد کن)
      const settings = await db.client.smsSettings.upsert({
        where: { tenantId: tenant.tenantId },
        create: {
          tenantId: tenant.tenantId,
          isEnabled: isEnabled ?? true,
          daysBeforeDue: daysBeforeDue ?? 1,
          sendOnDueDate: sendOnDueDate ?? true,
          daysAfterDue: daysAfterDue ?? 3,
          sendHour: sendHour ?? 9,
          sendMinute: sendMinute ?? 30,
          customMessageTemplate: customMessageTemplate || null,
        },
        update: updateData,
      })

      console.log('[SMS Settings PUT] Updated for tenant:', tenant.tenantId)

      return NextResponse.json({
        success: true,
        data: settings,
        message: 'تنظیمات با موفقیت ذخیره شد',
      })
    } catch (error: any) {
      console.error('[SMS Settings PUT] Error:', error)
      return NextResponse.json(
        { success: false, error: 'خطا در ذخیره تنظیمات' },
        { status: 500 }
      )
    }
  }
)
