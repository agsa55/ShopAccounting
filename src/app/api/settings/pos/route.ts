import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const tenantId = searchParams.get('tenantId') || 'demo'

    const posSettings = await db.posSetting.findMany({
      where: { tenantId },
    })

    return NextResponse.json({
      success: true,
      data: posSettings,
    })
  } catch (error) {
    console.error('POS settings get error:', error)
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
      id, portType, terminalId, merchantCode,
      isActive, tenantId: bodyTenantId,
    } = body
    const tenantId = bodyTenantId || 'demo'

    if (id) {
      // Update existing
      const pos = await db.posSetting.update({
        where: { id },
        data: {
          portType: portType ?? undefined,
          terminalId: terminalId ?? undefined,
          merchantCode: merchantCode ?? undefined,
          isActive: isActive ?? undefined,
        },
      })

      return NextResponse.json({
        success: true,
        data: pos,
        message: 'تنظیمات کارتخوان با موفقیت ذخیره شد',
      })
    }

    // Create new
    const pos = await db.posSetting.create({
      data: {
        portType: portType || 'Simulator',
        terminalId: terminalId || null,
        merchantCode: merchantCode || null,
        isActive: isActive ?? false,
        tenantId,
      },
    })

    return NextResponse.json({
      success: true,
      data: pos,
      message: 'تنظیمات کارتخوان با موفقیت ایجاد شد',
    }, { status: 201 })
  } catch (error) {
    console.error('POS settings update error:', error)
    return NextResponse.json(
      { success: false, error: 'خطای داخلی سرور' },
      { status: 500 }
    )
  }
}
