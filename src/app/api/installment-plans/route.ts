// ============================================================================
// src/app/api/installment-plans/route.ts — GET (v3.1 ★★★ Dynamic Calculation)
// ============================================================================
// ★★★ v3.1: محاسبه پویای باقیمانده و کل پرداختی بر اساس اقساط واقعی
//   ★ جلوگیری از نمایش اعداد قدیمی یا ناهماهنگ در صفحه اقساط
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

export const GET = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    const planId = searchParams.get('id')

    if (planId) return await getSinglePlan(tenantDb, tenantId, planId)

    const where: any = { tenantId }
    if (status) where.status = status

    let plans: any[] = []
    try {
      plans = await tenantDb.installmentPlan.findMany({
        where,
        include: {
          schedules: { orderBy: { installmentNumber: 'asc' } },
          invoice: {
            select: { id: true, number: true, customer: { select: { id: true, firstName: true, lastName: true, mobile: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
      })
    } catch (err: any) {
      console.warn('[InstallmentPlans] Include failed, trying fallback:', err?.message)
      try {
        plans = await tenantDb.installmentPlan.findMany({ where, orderBy: { createdAt: 'desc' } })
        for (const plan of plans) {
          try {
            plan.schedules = await tenantDb.installmentSchedule.findMany({ where: { planId: plan.id }, orderBy: { installmentNumber: 'asc' } })
          } catch { plan.schedules = [] }
          try {
            plan.invoice = await tenantDb.invoice.findFirst({
              where: { id: plan.invoiceId },
              select: { id: true, number: true, customer: { select: { id: true, firstName: true, lastName: true, mobile: true } } },
            })
          } catch { plan.invoice = null }
        }
      } catch { plans = [] }
    }

    const result = plans.map((plan: any) => {
      const customerName = plan.invoice?.customer
        ? `${plan.invoice.customer.firstName || ''} ${plan.invoice.customer.lastName || ''}`.trim()
        : plan.customerId ? `مشتری ${plan.customerId.substring(0, 8)}...` : 'بدون مشتری'

      const invoiceNumber = plan.invoice?.number || '---'
      const schedules = (plan.schedules || []).map((s: any) => ({
        id: s.id, installmentNumber: s.installmentNumber, amount: s.amount, dueDate: s.dueDate,
        status: s.status, paidAmount: s.paidAmount, paidAt: s.paidAt, paymentRef: s.paymentRef,
        paymentType: s.paymentType, notes: s.notes,
      }))

      const paidCount = schedules.filter((s: any) => s.status?.toUpperCase() === 'PAID').length
      const totalCount = schedules.length
      
      // ★★★ v3.1: محاسبه پویای مبالغ بر اساس داده‌های واقعی اقساط
      const schedulePaidSum = schedules.reduce((sum: number, s: any) => sum + (Number(s.paidAmount) || 0), 0)
      const dynamicTotalPaid = (Number(plan.downPayment) || 0) + schedulePaidSum
      const dynamicRemaining = Math.max(0, (Number(plan.totalAmount) || 0) - dynamicTotalPaid)
      // ★★★ پایان محاسبات پویا

      const overdueCount = schedules.filter((s: any) => {
        if (s.status?.toUpperCase() === 'PAID') return false
        return new Date(s.dueDate) < new Date()
      }).length

      return {
        id: plan.id, invoiceId: plan.invoiceId, invoiceNumber, customerId: plan.customerId, customerName,
        totalAmount: plan.totalAmount, 
        downPayment: plan.downPayment, 
        
        // ★★★ استفاده از مقادیر محاسبه‌شده پویا به جای مقادیر دیتابیس
        remainingAmount: dynamicRemaining,
        totalPaidAmount: dynamicTotalPaid,
        // ★★★ پایان تغییرات
        
        interestRate: plan.interestRate, totalWithInterest: plan.totalWithInterest,
        numberOfInstallments: plan.numberOfInstallments, installmentAmount: plan.installmentAmount,
        installmentPeriod: plan.installmentPeriod, status: plan.status, 
        paidInstallments: plan.paidInstallments || paidCount,
        nextDueDate: plan.nextDueDate, description: plan.description,
        createdAt: plan.createdAt, updatedAt: plan.updatedAt, schedules,
        totalInstallments: totalCount, paidCount, overdueCount,
        progressPct: totalCount > 0 ? Math.round((paidCount / totalCount) * 100) : 0,
      }
    })

    let filtered = result
    if (search) {
      const q = search.toLowerCase()
      filtered = result.filter((p: any) => p.customerName.toLowerCase().includes(q) || p.invoiceNumber.toLowerCase().includes(q))
    }

    const summary = {
      totalPlans: result.length,
      activePlans: result.filter((p: any) => p.status?.toLowerCase() === 'active').length,
      completedPlans: result.filter((p: any) => p.status?.toLowerCase() === 'completed').length,
      overduePlans: result.filter((p: any) => p.overdueCount > 0).length,
      totalRemaining: result.reduce((sum: number, p: any) => sum + (p.remainingAmount || 0), 0),
      totalOverdueInstallments: result.reduce((sum: number, p: any) => sum + p.overdueCount, 0),
    }

    return NextResponse.json({ success: true, data: filtered, summary })
  } catch (error: any) {
    console.error('[InstallmentPlans] GET error:', error)
    return NextResponse.json({ success: false, error: 'خطا در بارگذاری طرح‌های قسطی' }, { status: 500 })
  }
})

async function getSinglePlan(tenantDb: any, tenantId: string, planId: string) {
  try {
    const plan = await tenantDb.installmentPlan.findFirst({
      where: { id: planId, tenantId },
      include: {
        schedules: { orderBy: { installmentNumber: 'asc' } },
        invoice: { select: { id: true, number: true, customer: { select: { id: true, firstName: true, lastName: true, mobile: true } } } },
      },
    })

    if (!plan) return NextResponse.json({ success: false, error: 'طرح قسطی یافت نشد' }, { status: 404 })

    const customerName = (plan.invoice as any)?.customer
      ? `${(plan.invoice as any).customer.firstName || ''} ${(plan.invoice as any).customer.lastName || ''}`.trim()
      : 'بدون مشتری'

    const schedules = (plan.schedules || []).map((s: any) => ({
      id: s.id, installmentNumber: s.installmentNumber, amount: s.amount, dueDate: s.dueDate,
      status: s.status, paidAmount: s.paidAmount, paidAt: s.paidAt, paymentRef: s.paymentRef,
      paymentType: s.paymentType, notes: s.notes,
    }))

    const paidCount = schedules.filter((s: any) => s.status?.toUpperCase() === 'PAID').length

    // ★★★ v3.1: محاسبه پویای مبالغ در حالت تک‌پلن نیز اعمال شود
    const schedulePaidSum = schedules.reduce((sum: number, s: any) => sum + (Number(s.paidAmount) || 0), 0)
    const dynamicTotalPaid = (Number(plan.downPayment) || 0) + schedulePaidSum
    const dynamicRemaining = Math.max(0, (Number(plan.totalAmount) || 0) - dynamicTotalPaid)
    // ★★★ پایان محاسبات پویا

    return NextResponse.json({
      success: true,
      data: {
        id: plan.id, invoiceId: plan.invoiceId, invoiceNumber: (plan.invoice as any)?.number || '---',
        customerId: plan.customerId, customerName, totalAmount: plan.totalAmount, downPayment: plan.downPayment,
        
        // ★★★ استفاده از مقادیر محاسبه‌شده پویا
        remainingAmount: dynamicRemaining,
        totalPaidAmount: dynamicTotalPaid,
        // ★★★ پایان تغییرات
        
        interestRate: plan.interestRate, totalWithInterest: plan.totalWithInterest,
        numberOfInstallments: plan.numberOfInstallments, installmentAmount: plan.installmentAmount,
        installmentPeriod: plan.installmentPeriod, status: plan.status, paidInstallments: plan.paidInstallments || paidCount,
        nextDueDate: plan.nextDueDate, description: plan.description,
        createdAt: plan.createdAt, updatedAt: plan.updatedAt, schedules, paidCount,
        totalInstallments: schedules.length,
        progressPct: schedules.length > 0 ? Math.round((paidCount / schedules.length) * 100) : 0,
      },
    })
  } catch (error: any) {
    console.error('[InstallmentPlans] GET single error:', error)
    return NextResponse.json({ success: false, error: 'خطا در بارگذاری طرح قسطی' }, { status: 500 })
  }
}