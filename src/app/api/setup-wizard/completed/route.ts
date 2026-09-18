// ============================================================================
// src/app/api/setup-wizard/completed/route.ts
// وضعیت تکمیل ویزارد راه‌اندازی روی سرور
// ============================================================================

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserFromRequest } from '@/lib/jwt'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request as any)

    if (!user?.tenantId) {
      return NextResponse.json(
        {
          success: false,
          message: 'کاربر نامعتبر است',
        },
        { status: 401 }
      )
    }

    const tenant = await db.client.tenant.findUnique({
      where: {
        id: user.tenantId,
      },
      select: {
        setupCompleted: true,
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        completed: Boolean(tenant?.setupCompleted),
      },
    })
  } catch (error: any) {
    console.error('[SetupWizardCompleted GET] error:', error)

    return NextResponse.json(
      {
        success: false,
        message: 'خطا در读取 وضعیت راه‌اندازی',
      },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request as any)

    if (!user?.tenantId) {
      return NextResponse.json(
        {
          success: false,
          message: 'کاربر نامعتبر است',
        },
        { status: 401 }
      )
    }

    const tenant = await db.client.tenant.update({
      where: {
        id: user.tenantId,
      },
      data: {
        setupCompleted: true,
        setupCompletedAt: new Date(),
      },
      select: {
        id: true,
        setupCompleted: true,
        setupCompletedAt: true,
      },
    })

    return NextResponse.json({
      success: true,
      data: tenant,
    })
  } catch (error: any) {
    console.error('[SetupWizardCompleted POST] error:', error)

    return NextResponse.json(
      {
        success: false,
        message: 'خطا در ثبت نهایی وضعیت راه‌اندازی',
      },
      { status: 500 }
    )
  }
}