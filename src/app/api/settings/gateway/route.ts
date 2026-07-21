import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

function maskSensitive(value: string | null | undefined): string {
  if (!value) return ''
  if (value.length <= 4) return '****'
  return value.substring(0, 4) + '****' + value.substring(value.length - 4)
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const tenantId = searchParams.get('tenantId') || 'demo'

    const gateways = await db.paymentGatewaySetting.findMany({
      where: { tenantId },
    })

    // Mask sensitive data
    const maskedData = gateways.map(gw => ({
      ...gw,
      merchantIdEncrypted: maskSensitive(gw.merchantIdEncrypted),
      apiKeyEncrypted: maskSensitive(gw.apiKeyEncrypted),
    }))

    return NextResponse.json({
      success: true,
      data: maskedData,
    })
  } catch (error) {
    console.error('Gateway settings get error:', error)
    return NextResponse.json(
      { success: false, error: 'خطای داخلی سرور' },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const {
      id, gatewayType, merchantIdEncrypted, apiKeyEncrypted,
      isSandbox, isActive, priority, tenantId: bodyTenantId,
    } = body
    const tenantId = bodyTenantId || 'demo'

    if (id) {
      // Update existing
      const gateway = await db.paymentGatewaySetting.update({
        where: { id },
        data: {
          gatewayType: gatewayType ?? undefined,
          merchantIdEncrypted: merchantIdEncrypted ?? undefined,
          apiKeyEncrypted: apiKeyEncrypted ?? undefined,
          isSandbox: isSandbox ?? undefined,
          isActive: isActive ?? undefined,
          priority: priority ?? undefined,
        },
      })

      return NextResponse.json({
        success: true,
        data: {
          ...gateway,
          merchantIdEncrypted: maskSensitive(gateway.merchantIdEncrypted),
          apiKeyEncrypted: maskSensitive(gateway.apiKeyEncrypted),
        },
        message: 'تنظیمات درگاه پرداخت با موفقیت ذخیره شد',
      })
    }

    // Create new
    const gateway = await db.paymentGatewaySetting.create({
      data: {
        gatewayType: gatewayType || 'ZarinPal',
        merchantIdEncrypted: merchantIdEncrypted || null,
        apiKeyEncrypted: apiKeyEncrypted || null,
        isSandbox: isSandbox ?? true,
        isActive: isActive ?? false,
        priority: priority ?? 1,
        tenantId,
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        ...gateway,
        merchantIdEncrypted: maskSensitive(gateway.merchantIdEncrypted),
        apiKeyEncrypted: maskSensitive(gateway.apiKeyEncrypted),
      },
      message: 'درگاه پرداخت با موفقیت ایجاد شد',
    }, { status: 201 })
  } catch (error) {
    console.error('Gateway settings update error:', error)
    return NextResponse.json(
      { success: false, error: 'خطای داخلی سرور' },
      { status: 500 }
    )
  }
}
