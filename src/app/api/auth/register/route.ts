import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'

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
    const existingTenant = await db.tenant.findFirst({
      where: { subDomain },
    })

    if (existingTenant) {
      return NextResponse.json(
        { success: false, error: 'این زیردامنه قبلاً ثبت شده است' },
        { status: 400 }
      )
    }

    // Check mobile uniqueness
    const existingUser = await db.storeUser.findFirst({
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
    plan = await db.plan.findFirst({ where: { name: 'Starter', isActive: true } })
    if (!plan) {
      // Create Starter plan if none exists
      plan = await db.plan.create({
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
    const tenant = await db.tenant.create({
      data: {
        subDomain,
        companyName,
        dbName: subDomain,
        status: 'Active',
      },
    })

    // Create subscription (14-day free trial)
    const startDate = new Date()
    const endDate = new Date()
    endDate.setDate(endDate.getDate() + plan.durationDays)

    await db.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        startDate,
        endDate,
        status: 'Active',
        autoRenew: false,
      },
    })

    // Create store user (manager)
    const user = await db.storeUser.create({
      data: {
        username: 'admin',
    passwordHash: await bcrypt.hash(password, 10),
        role: 'Manager',
        mobile,
        tenantId: tenant.id,
        isActive: true,
      },
    })

    // Seed default accounts for the tenant
    const accountData = [
      { code: '1', name: 'دارایی‌ها', level: 1, type: 'Asset', nature: 'Debit', isSystem: true },
      { code: '11', name: 'صندوق و بانک', level: 2, type: 'Asset', nature: 'Debit', isSystem: true },
      { code: '111', name: 'صندوق فروشگاه', level: 3, type: 'Asset', nature: 'Debit', isSystem: true },
      { code: '112', name: 'حساب بانکی', level: 3, type: 'Asset', nature: 'Debit', isSystem: true },
      { code: '12', name: 'حساب‌های دریافتنی', level: 2, type: 'Asset', nature: 'Debit', isSystem: true },
      { code: '121', name: 'مشتریان', level: 3, type: 'Asset', nature: 'Debit', isSystem: true },
      { code: '13', name: 'موجودی کالا', level: 2, type: 'Asset', nature: 'Debit', isSystem: true },
      { code: '4', name: 'درآمدها', level: 1, type: 'Income', nature: 'Credit', isSystem: true },
      { code: '41', name: 'درآمد فروش', level: 2, type: 'Income', nature: 'Credit', isSystem: true },
      { code: '5', name: 'هزینه‌ها', level: 1, type: 'Expense', nature: 'Debit', isSystem: true },
      { code: '51', name: 'بهای تمام‌شده کالای فروش‌رفته', level: 2, type: 'Expense', nature: 'Debit', isSystem: true },
    ]

    for (const acc of accountData) {
      await db.account.create({
        data: {
          ...acc,
          tenantId: tenant.id,
        },
      })
    }

    // Seed default categories
    const categories = ['لبنیات', 'غلات', 'روغن', 'قند و شکر', 'نوشیدنی', 'کنسرو', 'بهداشت و آرایشی', 'چاشنی']
    for (const catName of categories) {
      await db.productCategory.create({
        data: {
          name: catName,
          tenantId: tenant.id,
          isActive: true,
        },
      })
    }

    // Create default store settings
    const settings = [
      { key: 'storeName', value: companyName },
      { key: 'defaultTaxRate', value: '9' },
      { key: 'currency', value: 'IRR' },
    ]
    for (const setting of settings) {
      await db.storeSetting.create({
        data: {
          key: setting.key,
          value: setting.value,
          tenantId: tenant.id,
        },
      })
    }

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