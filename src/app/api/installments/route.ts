import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const status = searchParams.get('status') || ''
    const tenantId = searchParams.get('tenantId') || 'demo'

    const where: Record<string, unknown> = { tenantId }

    const plans = await db.installmentPlan.findMany({
      where,
      include: {
        invoice: {
          include: {
            customer: true,
          },
        },
        installments: { orderBy: { number: 'asc' } },
      },
      orderBy: { startDate: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    })

    const total = await db.installmentPlan.count({ where })

    // Enrich with computed data
    const enrichedPlans = plans.map(plan => {
      const paidCount = plan.installments.filter(i => i.status === 'Paid').length
      const remainingCount = plan.installments.filter(i => i.status !== 'Paid').length
      const overdueCount = plan.installments.filter(i =>
        i.status === 'Overdue' || (i.status === 'Pending' && new Date(i.dueDate) < new Date())
      ).length

      // Update overdue status
      for (const inst of plan.installments) {
        if (inst.status === 'Pending' && new Date(inst.dueDate) < new Date()) {
          db.installment.update({
            where: { id: inst.id },
            data: { status: 'Overdue' },
          }).catch(() => {})
        }
      }

      return {
        ...plan,
        customerName: plan.invoice?.customer
          ? `${plan.invoice.customer.firstName} ${plan.invoice.customer.lastName}`
          : null,
        invoiceNumber: plan.invoice?.number || null,
        paidCount,
        remainingCount,
        overdueCount,
      }
    })

    // Filter by status if provided
    let filteredPlans = enrichedPlans
    if (status === 'overdue') {
      filteredPlans = enrichedPlans.filter(p => p.overdueCount > 0)
    } else if (status === 'completed') {
      filteredPlans = enrichedPlans.filter(p => p.paidCount === p.numberOfInstallments)
    } else if (status === 'active') {
      filteredPlans = enrichedPlans.filter(p => p.paidCount < p.numberOfInstallments)
    }

    return NextResponse.json({
      success: true,
      data: filteredPlans,
      total,
      page,
      limit,
    })
  } catch (error) {
    console.error('Installments list error:', error)
    return NextResponse.json(
      { success: false, error: 'خطای داخلی سرور' },
      { status: 500 }
    )
  }
}
