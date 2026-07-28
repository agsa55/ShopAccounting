// ============================================================================
// src/app/api/customers/portal-link/route.ts — Portal URL helper (v3.36)
// ----------------------------------------------------------------------------
// ★ فراخوانی از دکمه «لینک پورتال» در فاکتورها و مشتریان.
// ★ اگر مشتری توکن نداشت، یک توکن امن تولید می‌کند و در دیتابیس ذخیره می‌کند.
// ★ خروجی: { portalUrl } (مسیر نسبی — زیردامنه tenant توسط proxy.ts تزریق می‌شود)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

function generatePortalToken(): string {
  // ★ توکن ۳۲ کاراکتری base64url (امن و URL-safe)
  const uuid = randomUUID().replace(/-/g, '')
  const ts = Date.now().toString(36)
  return `${uuid}${ts}`.slice(0, 40)
}

export const POST = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const body = await req.json()
    const customerId = body?.customerId

    if (!customerId) {
      return NextResponse.json(
        { success: false, error: 'شناسه مشتری الزامی است' },
        { status: 400 }
      )
    }

    const customer = await tenantDb.customer.findFirst({
      where: { id: customerId, tenantId },
      select: { id: true, firstName: true, lastName: true, mobile: true, portalToken: true },
    })

    if (!customer) {
      return NextResponse.json(
        { success: false, error: 'مشتری یافت نشد' },
        { status: 404 }
      )
    }

    let token = customer.portalToken
    if (!token) {
      token = generatePortalToken()
      await tenantDb.customer.update({
        where: { id: customer.id },
        data: { portalToken: token },
      })
    }

    // ★ مسیر نسبی — proxy.ts زیردامنه tenant را به این مسیر هدایت می‌کند.
    //   کاربر در پنل ادمین فایل می‌بیند: /portal/{token}
    //   مشتری در پورتال: https://{subdomain}.app.com/portal/{token}
    const portalUrl = `/portal/${token}`

    return NextResponse.json({
      success: true,
      data: {
        portalUrl,
        portalToken: token,
        customerName: `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
      },
    })
  } catch (error: any) {
    console.error('[Customers][PortalLink] error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'خطا در دریافت لینک پورتال' },
      { status: 500 }
    )
  }
})
