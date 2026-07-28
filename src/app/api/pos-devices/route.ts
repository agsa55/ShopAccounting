// src/app/api/pos-devices/route.ts
// ShopAccounting v8.0 — POS Devices CRUD API
// ============================================================================
// GET    /api/pos-devices          — لیست دستگاه‌ها
// POST   /api/pos-devices          — افزودن دستگاه جدید
// PATCH  /api/pos-devices          — به‌روزرسانی (با ?id= در query)
// DELETE /api/pos-devices          — حذف (با ?id= در query)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

// ═══════════════════════════════════════════════════════════════
//  GET — لیست دستگاه‌های POS
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

    const { searchParams } = new URL(req.url)
    const onlyActive = searchParams.get('active') === 'true'

    const where: any = { tenantId }
    if (onlyActive) where.isActive = true

    const devices = await tenantDb.posDevice.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    }).catch(() => [])

    // ★ تعداد پرداخت‌های هر دستگاه
    const devicesWithStats = await Promise.all(
      devices.map(async (d: any) => {
        const paymentCount = await tenantDb.cardPayment.count({
          where: { posDeviceId: d.id },
        }).catch(() => 0)

        const lastPayment = await tenantDb.cardPayment.findFirst({
          where: { posDeviceId: d.id },
          orderBy: { paidAt: 'desc' },
          select: { paidAt: true, amount: true, referenceNumber: true },
        }).catch(() => null)

        return {
          ...d,
          paymentCount,
          lastPayment,
        }
      })
    )

    return NextResponse.json({
      success: true,
      data: devicesWithStats,
      summary: {
        total: devicesWithStats.length,
        active: devicesWithStats.filter((d: any) => d.isActive).length,
        byType: devicesWithStats.reduce((acc: any, d: any) => {
          acc[d.terminalType] = (acc[d.terminalType] || 0) + 1
          return acc
        }, {}),
      },
    })
  } catch (error: any) {
    console.error('[PosDevices GET] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'خطا در بارگذاری دستگاه‌های POS' },
      { status: 500 }
    )
  }
})

// ═══════════════════════════════════════════════════════════════
//  POST — افزودن دستگاه جدید
// ═══════════════════════════════════════════════════════════════

export const POST = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

    const body = await req.json()

    // ★ Validation
    if (!body.name || typeof body.name !== 'string' || body.name.trim().length < 2) {
      return NextResponse.json(
        { success: false, error: 'نام دستگاه الزامی است (حداقل ۲ کاراکتر)' },
        { status: 400 }
      )
    }

    const validTypes = ['manual', 'keyboard-hid', 'web-serial', 'network-tcp', 'network-http']
    if (body.terminalType && !validTypes.includes(body.terminalType)) {
      return NextResponse.json(
        { success: false, error: `نوع اتصال نامعتبر. معتبر: ${validTypes.join(', ')}` },
        { status: 400 }
      )
    }

    const validBrands = ['verifone', 'ingenico', 'pax', 'fannipars', 'kavosh', 'palch', 'nikan', 'generic']
    if (body.brand && !validBrands.includes(body.brand)) {
      body.brand = 'generic'
    }

    // ★ اگه دستگاه جدید به‌عنوان فعال علامت گذاری شد، بقیه رو غیرفعال کن
    if (body.isActive === true) {
      await tenantDb.posDevice.updateMany({
        where: { tenantId },
        data: { isActive: false },
      }).catch(() => {})
    }

    const device = await tenantDb.posDevice.create({
      data: {
        name: body.name.trim(),
        terminalId: body.terminalId || null,
        terminalType: body.terminalType || 'manual',
        brand: body.brand || 'generic',
        bankName: body.bankName || null,
        merchantId: body.merchantId || null,
        acceptorCode: body.acceptorCode || null,
        terminalSerial: body.terminalSerial || null,
        ipAddress: body.ipAddress || null,
        port: body.port ? parseInt(body.port) : null,
        serialPort: body.serialPort || null,
        baudRate: body.baudRate ? parseInt(body.baudRate) : 115200,
        apiBaseUrl: body.apiBaseUrl || null,
        apiKey: body.apiKey || null,
        config: body.config ? JSON.stringify(body.config) : null,
        isActive: body.isActive ?? true,
        tenantId,
      },
    })

    return NextResponse.json({
      success: true,
      data: device,
      message: 'دستگاه POS با موفقیت افزوده شد',
    })
  } catch (error: any) {
    console.error('[PosDevices POST] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: `خطا در افزودن دستگاه: ${error?.message || error}` },
      { status: 500 }
    )
  }
})

// ═══════════════════════════════════════════════════════════════
//  PATCH — به‌روزرسانی دستگاه
// ═══════════════════════════════════════════════════════════════

export const PATCH = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'شناسه دستگاه الزامی است (?id=)' },
        { status: 400 }
      )
    }

    const body = await req.json()

    // ★ بررسی مالکیت دستگاه
    const existing = await tenantDb.posDevice.findFirst({
      where: { id, tenantId },
    })
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'دستگاه یافت نشد' },
        { status: 404 }
      )
    }

    // ★ اگه فعال شد، بقیه رو غیرفعال کن
    if (body.isActive === true && !existing.isActive) {
      await tenantDb.posDevice.updateMany({
        where: { tenantId, NOT: { id } },
        data: { isActive: false },
      }).catch(() => {})
    }

    const updateData: any = {}
    const allowedFields = [
      'name', 'terminalId', 'terminalType', 'brand', 'bankName',
      'merchantId', 'acceptorCode', 'terminalSerial',
      'ipAddress', 'port', 'serialPort', 'baudRate',
      'apiBaseUrl', 'apiKey', 'isActive',
    ]
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === 'port' || field === 'baudRate') {
          updateData[field] = body[field] ? parseInt(body[field]) : null
        } else {
          updateData[field] = body[field]
        }
      }
    }
    if (body.config !== undefined) {
      updateData.config = typeof body.config === 'string' ? body.config : JSON.stringify(body.config)
    }

    const updated = await tenantDb.posDevice.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({
      success: true,
      data: updated,
      message: 'دستگاه با موفقیت به‌روزرسانی شد',
    })
  } catch (error: any) {
    console.error('[PosDevices PATCH] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: `خطا در به‌روزرسانی: ${error?.message || error}` },
      { status: 500 }
    )
  }
})

// ═══════════════════════════════════════════════════════════════
//  DELETE — حذف دستگاه
// ═══════════════════════════════════════════════════════════════

export const DELETE = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'شناسه دستگاه الزامی است (?id=)' },
        { status: 400 }
      )
    }

    // ★ بررسی مالکیت
    const existing = await tenantDb.posDevice.findFirst({
      where: { id, tenantId },
    })
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'دستگاه یافت نشد' },
        { status: 404 }
      )
    }

    // ★ علاقه‌مندی CardPayment‌ها رو null کن (SetNull)
    await tenantDb.cardPayment.updateMany({
      where: { posDeviceId: id },
      data: { posDeviceId: null },
    }).catch(() => {})

    await tenantDb.posDevice.delete({ where: { id } })

    return NextResponse.json({
      success: true,
      message: 'دستگاه حذف شد',
    })
  } catch (error: any) {
    console.error('[PosDevices DELETE] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: `خطا در حذف: ${error?.message || error}` },
      { status: 500 }
    )
  }
})
