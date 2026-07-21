// ============================================================================
// src/app/api/settings/route.ts — GET /api/settings
// ShopAccounting v9.0 — Multi-tenant SaaS Platform
// ============================================================================
// ★ اصلاح v9: استفاده از نام ستون‌های واقعی (storeName, defaultTaxRate)
// ★ اصلاح v9: مدیریت نبود جدول‌های PaymentGateways/PosDevices
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

export const GET = withTenantAndPermission('settings')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

    // ─── StoreSetting ─── ★ نام ستون‌ها: storeName, defaultTaxRate
    let storeSetting: any = null
    try {
      storeSetting = await tenantDb.storeSetting.findFirst({
        where: tenant.isIsolated ? {} : { tenantId },
      })
    } catch (err: any) {
      console.warn('[Settings GET] StoreSetting table error:', err?.message)
    }

    // ─── PaymentGateway ───
    let paymentGateway: any = null
    try {
      paymentGateway = await tenantDb.paymentGateway.findFirst({
        where: tenant.isIsolated ? {} : { tenantId },
      })
    } catch (err: any) {
      console.warn('[Settings GET] PaymentGateways table not found (expected for free plan):', err?.message)
    }

    // ─── PosDevice ───
    let posDevices: any[] = []
    try {
      posDevices = await tenantDb.posDevice.findMany({
        where: tenant.isIsolated ? {} : { tenantId },
      })
    } catch (err: any) {
      console.warn('[Settings GET] PosDevices table not found (expected for free plan):', err?.message)
    }

    // ★ ساختار پاسخ با نام ستون‌های واقعی
    const settings: any = {
      store: {
        storeName: storeSetting?.storeName || tenant.tenant?.companyName || '',
        address: storeSetting?.address || tenant.tenant?.address || '',
        phone: storeSetting?.phone || '',
        registrationNumber: storeSetting?.registrationNumber || tenant.tenant?.registrationNumber || '',
        defaultTaxRate: storeSetting?.defaultTaxRate ?? 9,
        logoUrl: storeSetting?.logoUrl || tenant.tenant?.logoUrl || '',
      },
      gateway: paymentGateway ? {
        id: paymentGateway.id,
        name: paymentGateway.name,
        type: paymentGateway.type,
        apiKey: paymentGateway.apiKey,
        merchantId: paymentGateway.merchantId,
        isActive: paymentGateway.isActive,
        sandbox: paymentGateway.sandbox,
      } : null,
      posDevices: posDevices.map((d: any) => ({
        id: d.id,
        name: d.name,
        terminalId: d.terminalId,
        isActive: d.isActive,
      })),
    }

    return NextResponse.json({ success: true, data: settings })
  } catch (error: any) {
    console.error('[Settings GET] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در بارگذاری تنظیمات' },
      { status: 500 }
    )
  }
})

// ═══════════════════════════════════════════════════════════════
//  PUT /api/settings — ذخیره تنظیمات
// ═══════════════════════════════════════════════════════════════

export const PUT = withTenantAndPermission('settings')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const body = await req.json()
    const { store, gateway, posDevice } = body

    // ─── ذخیره تنظیمات فروشگاه ───
    if (store) {
      const existing = await tenantDb.storeSetting.findFirst({
        where: tenant.isIsolated ? {} : { tenantId },
      })

      const storeData: any = {
        storeName: store.storeName,
        address: store.address,
        phone: store.phone,
        registrationNumber: store.registrationNumber,
        defaultTaxRate: store.defaultTaxRate,
        logoUrl: store.logoUrl,
        tenantId: tenant.isIsolated ? undefined : tenantId,
      }

      if (existing) {
        await tenantDb.storeSetting.update({
          where: { id: existing.id },
          data: storeData,
        })
      } else {
        await tenantDb.storeSetting.create({
          data: storeData,
        })
      }
    }

    // ─── ذخیره درگاه پرداخت ───
    if (gateway) {
      try {
        const existing = await tenantDb.paymentGateway.findFirst({
          where: tenant.isIsolated ? {} : { tenantId },
        })

        const gatewayData: any = {
          name: gateway.name || 'zarinpal',
          type: gateway.type || 'zarinpal',
          apiKey: gateway.apiKey,
          merchantId: gateway.merchantId,
          isActive: gateway.isActive ?? false,
          sandbox: gateway.sandbox ?? true,
          tenantId: tenant.isIsolated ? undefined : tenantId,
        }

        if (existing) {
          await tenantDb.paymentGateway.update({
            where: { id: existing.id },
            data: gatewayData,
          })
        } else {
          await tenantDb.paymentGateway.create({
            data: gatewayData,
          })
        }
      } catch (err: any) {
        console.warn('[Settings PUT] PaymentGateways table not found:', err?.message)
      }
    }

    // ─── ذخیره کارتخوان ───
    if (posDevice) {
      try {
        const posData: any = {
          name: posDevice.name,
          terminalId: posDevice.terminalId,
          isActive: posDevice.isActive ?? true,
          tenantId: tenant.isIsolated ? undefined : tenantId,
        }

        if (posDevice.id) {
          await tenantDb.posDevice.update({
            where: { id: posDevice.id },
            data: posData,
          })
        } else {
          await tenantDb.posDevice.create({
            data: posData,
          })
        }
      } catch (err: any) {
        console.warn('[Settings PUT] PosDevices table not found:', err?.message)
      }
    }

    return NextResponse.json({ success: true, message: 'تنظیمات با موفقیت ذخیره شد' })
  } catch (error: any) {
    console.error('[Settings PUT] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در ذخیره تنظیمات' },
      { status: 500 }
    )
  }
})
