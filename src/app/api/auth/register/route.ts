import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { logger } from '@/lib/system-logger'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { companyName, subDomain, mobile, email, password } = body

    // Validation
    if (!companyName || !subDomain || !mobile || !password) {
      return NextResponse.json(
        { success: false, error: 'اطلاعات ثبت‌نام ناقص است' },
        { status: 400 }
      )
    }

    // Validate subdomain format
    if (subDomain.length < 3 || !/^[a-z0-9]+$/.test(subDomain)) {
      return NextResponse.json(
        { success: false, error: 'زیردامنه باید حداقل ۳ کاراکتر و فقط شامل حروف انگلیسی و عدد باشد' },
        { status: 400 }
      )
    }

    // Validate mobile format
    if (!/^09\d{9}$/.test(mobile)) {
      return NextResponse.json(
        { success: false, error: 'شماره موبایل معتبر نیست (مثال: 09121234567)' },
        { status: 400 }
      )
    }

    // Validate password length
    if (password.length < 6) {
      return NextResponse.json(
        { success: false, error: 'رمز عبور باید حداقل ۶ کاراکتر باشد' },
        { status: 400 }
      )
    }

    // Check subdomain uniqueness
    const existingTenant = await (db as any).client.tenant.findFirst({
      where: { subDomain },
    })

    if (existingTenant) {
      return NextResponse.json(
        { success: false, error: 'این زیردامنه قبلاً ثبت شده است' },
        { status: 400 }
      )
    }

    // Check mobile uniqueness
    const existingUser = await (db as any).client.storeUser.findFirst({
      where: { mobile },
    })

    if (existingUser) {
      return NextResponse.json(
        { success: false, error: 'این شماره موبایل قبلاً ثبت‌نام کرده است' },
        { status: 400 }
      )
    }

    // Get or create Starter plan (14-day free trial)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let plan: any = null
    plan = await (db as any).client.plans.findFirst({ where: { name: 'Starter', isActive: true } })
    if (!plan) {
      // Create Starter plan if none exists
      plan = await (db as any).client.plans.create({
        data: {
          name: 'Starter',
          nameFa: 'پایه',
          durationDays: 14,
          price: 0,
          maxUsers: 2,
          maxProducts: 200,
          isActive: true,
        },
      })
    }

    // Create tenant
    const tenant = await (db as any).client.tenant.create({
      data: {
        id: `tenant-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
        subDomain,
        companyName,
        status: 'active',
        ownerMobile: mobile,
        planName: 'simple',
      },
    })

    // Create subscription (14-day free trial)
    const startDate = new Date()
    const endDate = new Date()
    endDate.setDate(endDate.getDate() + plan.durationDays)

    await (db as any).client.subscriptions.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        startDate,
        endDate,
        status: 'active',
        autoRenew: false,
      },
    })

    // ★ v11.9.5: Create store user (OWNER/MANAGER - فقط یک مدیر اصلی)
    // username همیشه 'admin' است و role همیشه 'Manager'
    const user = await (db as any).client.storeUser.create({
      data: {
        username: 'admin',
        password: await bcrypt.hash(password, 10),
        role: 'Manager',  // ★ همیشه Manager - این کاربر مالک/مدیر فروشگاه است
        mobile,
        tenantId: tenant.id,
        isActive: true,
      },
    })

    // ★ v11.9.5: لاگ ثبت‌نام موفق
    logger.info('فروشگاه جدید ثبت‌نام شد', {
      tenantId: tenant.id,
      subDomain,
      companyName,
      ownerMobile: mobile,
      planName: plan.name,
    })

    // Seed default accounts for the tenant
    const accountData = [
      { code: '1', name: 'دارایی‌ها', level: 1, type: 'Asset' },
      { code: '11', name: 'صندوق و بانک', level: 2, type: 'Asset' },
      { code: '111', name: 'صندوق فروشگاه', level: 3, type: 'Asset' },
      { code: '112', name: 'حساب بانکی', level: 3, type: 'Asset' },
      { code: '12', name: 'حساب‌های دریافتنی', level: 2, type: 'Asset' },
      { code: '121', name: 'مشتریان', level: 3, type: 'Asset' },
      { code: '13', name: 'موجودی کالا', level: 2, type: 'Asset' },
      { code: '4', name: 'درآمدها', level: 1, type: 'Income' },
      { code: '41', name: 'درآمد فروش', level: 2, type: 'Income' },
      { code: '5', name: 'هزینه‌ها', level: 1, type: 'Expense' },
      { code: '51', name: 'بهای تمام‌شده کالای فروش‌رفته', level: 2, type: 'Expense' },
    ]

    for (const acc of accountData) {
      await (db as any).client.account.create({
        data: {
          ...acc,
          tenantId: tenant.id,
        },
      })
    }

    // Seed default categories
    const categories = ['لبنیات', 'غلات', 'روغن', 'قند و شکر', 'نوشیدنی', 'کنسرو', 'بهداشت و آرایشی', 'چاشنی']
    for (const catName of categories) {
      await (db as any).client.category.create({
        data: {
          name: catName,
          tenantId: tenant.id,
          isActive: true,
        },
      })
    }

    // Create default store settings
    await (db as any).client.storeSetting.create({
      data: {
        storeName: companyName,
        defaultTaxRate: 9,
        tenantId: tenant.id,
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          name: user.username,
          tenantId: tenant.id,
          permissions: [],  // Manager always has full access
        },
        tenant: {
          id: tenant.id,
          subDomain: tenant.subDomain,
          companyName: tenant.companyName,
          planName: 'پایه (رایگان ۱۴ روزه)',
          status: tenant.status,
        },
        token: 'mock-jwt-token',
      },
    }, { status: 201 })
  } catch (error) {
    console.error('Register error:', error)
    return NextResponse.json(
      { success: false, error: 'خطای داخلی سرور' },
      { status: 500 }
    )
  }
}