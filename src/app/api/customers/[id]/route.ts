import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const customer = await db.customer.findUnique({
      where: { id },
      include: {
        invoices: {
          include: {
            items: true,
            payments: true,
            installmentPlan: {
              include: { installments: true },
            },
          },
          orderBy: { invoiceDate: 'desc' },
        },
      },
    })

    if (!customer) {
      return NextResponse.json(
        { success: false, error: 'مشتری یافت نشد' },
        { status: 404 }
      )
    }

    // Calculate financial summary
    const activeInvoices = customer.invoices.filter(inv => inv.status !== 'Cancelled')
    const totalPurchases = activeInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0)
    const totalPaid = activeInvoices.reduce((sum, inv) => sum + inv.paidAmount, 0)
    const totalRemaining = activeInvoices.reduce((sum, inv) => sum + inv.remainingAmount, 0)

    // Get installment plans
    const installmentPlans = customer.invoices
      .filter(inv => inv.installmentPlan)
      .map(inv => ({
        ...inv.installmentPlan,
        invoiceNumber: inv.number,
      }))

    return NextResponse.json({
      success: true,
      data: {
        ...customer,
        totalPurchases,
        totalPaid,
        totalRemaining,
        invoiceCount: activeInvoices.length,
        installmentPlans,
      },
    })
  } catch (error) {
    console.error('Customer get error:', error)
    return NextResponse.json(
      { success: false, error: 'خطای داخلی سرور' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.customer.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'مشتری یافت نشد' },
        { status: 404 }
      )
    }

    // Check code uniqueness if changing
    if (body.code && body.code !== existing.code) {
      const duplicate = await db.customer.findFirst({
        where: { code: body.code, tenantId: existing.tenantId, id: { not: id } },
      })
      if (duplicate) {
        return NextResponse.json(
          { success: false, error: 'کد مشتری تکراری است' },
          { status: 400 }
        )
      }
    }

    const customer = await db.customer.update({
      where: { id },
      data: {
        code: body.code ?? existing.code,
        firstName: body.firstName ?? existing.firstName,
        lastName: body.lastName ?? existing.lastName,
        mobile: body.mobile ?? existing.mobile,
        nationalCode: body.nationalCode ?? existing.nationalCode,
        address: body.address ?? existing.address,
        creditLimit: body.creditLimit ?? existing.creditLimit,
        currentBalance: body.currentBalance ?? existing.currentBalance,
      },
    })

    return NextResponse.json({
      success: true,
      data: customer,
    })
  } catch (error) {
    console.error('Customer update error:', error)
    return NextResponse.json(
      { success: false, error: 'خطای داخلی سرور' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.customer.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'مشتری یافت نشد' },
        { status: 404 }
      )
    }

    // Toggle blacklist
    const customer = await db.customer.update({
      where: { id },
      data: {
        isBlacklisted: body.isBlacklisted !== undefined ? body.isBlacklisted : !existing.isBlacklisted,
      },
    })

    return NextResponse.json({
      success: true,
      data: customer,
      message: customer.isBlacklisted ? 'مشتری به لیست سیاه اضافه شد' : 'مشتری از لیست سیاه حذف شد',
    })
  } catch (error) {
    console.error('Customer patch error:', error)
    return NextResponse.json(
      { success: false, error: 'خطای داخلی سرور' },
      { status: 500 }
    )
  }
}
