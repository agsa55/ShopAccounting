// ============================================================================
// src/app/api/journal-entries/route.ts — GET/POST/PUT (v3.0)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { requireActiveSubscription } from '@/lib/plan-guard'

async function lookupAccounts(tenantDb: any, accountIds: string[], tenantId: string): Promise<Map<string, { code: string; name: string }>> {
  const accountMap = new Map<string, { code: string; name: string }>()
  if (accountIds.length === 0) return accountMap

  try {
    const uniqueIds = [...new Set(accountIds.filter(Boolean))]
    if (uniqueIds.length === 0) return accountMap

    const accounts = await tenantDb.account.findMany({
      where: { id: { in: uniqueIds }, tenantId },
      select: { id: true, code: true, name: true },
    })

    for (const acc of accounts) {
      accountMap.set(acc.id, { code: acc.code || '-', name: acc.name || '-' })
    }
  } catch (err: any) {
    console.warn('[JournalEntries] Account lookup failed:', err?.message)
  }

  return accountMap
}

export const GET = withTenantAndPermission('dashboard')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const type = searchParams.get('type')

    const where = { tenantId }
    const entries: any[] = []

    try {
      let manualEntries: any[] = []
      try {
        manualEntries = await tenantDb.journalEntry.findMany({
          where, include: { lines: true },
          orderBy: { date: 'desc' }, skip: (page - 1) * limit, take: limit,
        })
      } catch {
        try {
          manualEntries = await tenantDb.journalEntry.findMany({
            where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit,
          })
          manualEntries = manualEntries.map((e: any) => ({ ...e, lines: [] }))
        } catch { /* ignore */ }
      }

      const allAccountIds: string[] = []
      for (const entry of manualEntries) {
        if (entry.lines) {
          for (const line of entry.lines) {
            if (line.accountId) allAccountIds.push(line.accountId)
          }
        }
      }
      const accountMap = await lookupAccounts(tenantDb, allAccountIds, tenantId)

      for (const entry of manualEntries) {
        entries.push({
          id: entry.id, number: entry.number, date: entry.date, description: entry.description,
          status: entry.status, sourceType: entry.sourceType || 'manual', sourceId: entry.sourceId,
          totalDebit: entry.totalDebit, totalCredit: entry.totalCredit, fiscalYearId: entry.fiscalYearId || null,
          lines: (entry.lines || []).map((line: any) => {
            const acc = accountMap.get(line.accountId)
            return {
              id: line.id, accountId: line.accountId, accountName: acc?.name || '-',
              accountCode: acc?.code || '-', description: line.description, debit: line.debit, credit: line.credit,
            }
          }),
          isManual: true, createdAt: entry.createdAt,
        })
      }
    } catch (err: any) {
      console.warn('[JournalEntries GET] JournalEntry table not available:', err?.message)
    }

    if (entries.length === 0 || type === 'all' || type === 'income' || type === 'expense') {
      try {
        const invoices = await tenantDb.invoice.findMany({
          where: { ...where, status: 'confirmed' },
          select: {
            id: true, number: true, paymentType: true, subTotal: true, discountAmount: true,
            taxAmount: true, totalAmount: true, paidAmount: true, remainingAmount: true, customerId: true, createdAt: true,
          },
          orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit,
        })

        for (const inv of invoices) {
          entries.push({
            id: `je-inv-${inv.id}-debit`, number: `INV-${inv.number}`, date: inv.createdAt,
            description: `فروش - فاکتور ${inv.number}`, status: 'posted', sourceType: 'invoice', sourceId: inv.id,
            lines: [
              { accountCode: '1200', accountName: 'حساب‌های دریافتنی', debit: inv.totalAmount, credit: 0 },
              { accountCode: '4100', accountName: 'فروش', debit: 0, credit: inv.totalAmount },
            ],
            totalDebit: inv.totalAmount, totalCredit: inv.totalAmount, isManual: false, createdAt: inv.createdAt,
          })
        }
      } catch { /* ignore */ }

      try {
        const payments = await tenantDb.invoicePayment.findMany({
          where: { tenantId },
          select: { id: true, invoiceId: true, amount: true, paymentType: true, paymentRef: true, paidAt: true },
          orderBy: { paidAt: 'desc' }, skip: (page - 1) * limit, take: limit,
        })

        for (const pay of payments) {
          entries.push({
            id: `je-pay-${pay.id}`, number: `PAY-${pay.id ? pay.id.slice(0, 8) : Date.now()}`,
            date: pay.paidAt, description: `دریافت/پرداخت - ${pay.paymentType || 'نقدی'}`,
            status: 'posted', sourceType: 'payment', sourceId: pay.id,
            lines: [
              { accountCode: '1100', accountName: 'صندوق', debit: pay.amount, credit: 0 },
              { accountCode: '1200', accountName: 'حساب‌های دریافتنی', debit: 0, credit: pay.amount },
            ],
            totalDebit: pay.amount, totalCredit: pay.amount, isManual: false, createdAt: pay.paidAt,
          })
        }
      } catch { /* ignore */ }
    }

    let filtered = entries
    if (type === 'income') filtered = entries.filter(e => e.totalDebit > 0)
    else if (type === 'expense') filtered = entries.filter(e => e.totalCredit > 0)
    else if (type === 'manual') filtered = entries.filter(e => e.isManual)

    filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return NextResponse.json({
      success: true,
      data: { entries: filtered.slice(0, limit), total: filtered.length, page, limit },
    })
  } catch (error: any) {
    console.error('[JournalEntries GET] Error:', error)
    return NextResponse.json({ success: false, error: 'خطا در بارگذاری اسناد حسابداری' }, { status: 500 })
  }
})

export const POST = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const subCheck = await requireActiveSubscription(tenant.tenantId)
    if (!subCheck.active) {
      return NextResponse.json({ success: false, error: subCheck.message }, { status: 403 })
    }

    const planTier = tenant.planTierName || 'simple'
    if (!['professional', 'enterprise'].includes(planTier)) {
      return NextResponse.json(
        {
          success: false,
          error: 'سند حسابداری دستی فقط در پلن حرفه‌ای و سازمانی در دسترس است. لطفاً پلن خود را ارتقا دهید.',
          code: 'PLAN_FEATURE_RESTRICTED',
        },
        { status: 403 }
      )
    }

    if (!['Manager', 'Admin', 'Owner'].includes(tenant.user?.role)) {
      return NextResponse.json({ success: false, error: 'فقط مدیران اجازه ایجاد سند حسابداری را دارند' }, { status: 403 })
    }

    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const body = await req.json()

    if (!body.lines || body.lines.length < 2) {
      return NextResponse.json({ success: false, error: 'حداقل دو ردیف سند الزامی است' }, { status: 400 })
    }

    const totalDebit = body.lines.reduce((sum: number, l: any) => sum + (Number(l.debit) || 0), 0)
    const totalCredit = body.lines.reduce((sum: number, l: any) => sum + (Number(l.credit) || 0), 0)

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return NextResponse.json(
        { success: false, error: `سند تراز نیست. جمع بدهکار: ${totalDebit}, جمع بستانکار: ${totalCredit}` },
        { status: 400 }
      )
    }

    let journalNumber = body.number
    if (!journalNumber) {
      try {
        const count = await tenantDb.journalEntry.count({ where: { tenantId } })
        journalNumber = `JE-${(count + 1).toString().padStart(6, '0')}`
      } catch {
        journalNumber = `JE-${Date.now().toString().slice(-6)}`
      }
    }

    const accountIds = body.lines.map((l: any) => l.accountId).filter(Boolean)
    if (accountIds.length > 0) {
      const accountMap = await lookupAccounts(tenantDb, accountIds, tenantId)
      for (const line of body.lines) {
        if (line.accountId && !accountMap.has(line.accountId)) {
          return NextResponse.json(
            { success: false, error: `حساب با شناسه ${line.accountId} یافت نشد` },
            { status: 400 }
          )
        }
      }
    }

    const journalEntry = await tenantDb.journalEntry.create({
      data: {
        number: journalNumber, fiscalYearId: body.fiscalYearId || null,
        date: body.date ? new Date(body.date) : new Date(),
        description: body.description || 'سند حسابداری دستی',
        status: body.status || 'draft', sourceType: 'manual', sourceId: null,
        totalDebit, totalCredit, createdBy: tenant.user?.id || null, tenantId,
        lines: {
          create: body.lines.map((line: any) => ({
            accountId: line.accountId || null, description: line.description || null,
            debit: Number(line.debit) || 0, credit: Number(line.credit) || 0,
          })),
        },
      },
      include: { lines: true },
    })

    const lineAccountIds = journalEntry.lines.map((l: any) => l.accountId).filter(Boolean)
    const accountMap = await lookupAccounts(tenantDb, lineAccountIds, tenantId)

    return NextResponse.json({
      success: true,
      data: {
        id: journalEntry.id, number: journalEntry.number, date: journalEntry.date,
        description: journalEntry.description, status: journalEntry.status, sourceType: journalEntry.sourceType,
        totalDebit: journalEntry.totalDebit, totalCredit: journalEntry.totalCredit,
        fiscalYearId: journalEntry.fiscalYearId || null,
        lines: journalEntry.lines.map((line: any) => {
          const acc = accountMap.get(line.accountId)
          return {
            id: line.id, accountId: line.accountId, accountName: acc?.name || '-',
            accountCode: acc?.code || '-', description: line.description, debit: line.debit, credit: line.credit,
          }
        }),
        createdAt: journalEntry.createdAt,
      },
    }, { status: 201 })
  } catch (error: any) {
    console.error('[JournalEntries POST] Error:', error)
    return NextResponse.json({ success: false, error: 'خطا در ایجاد سند حسابداری' }, { status: 500 })
  }
})

export const PUT = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    if (!['Manager', 'Admin', 'Owner'].includes(tenant.user?.role)) {
      return NextResponse.json({ success: false, error: 'فقط مدیران اجازه تغییر وضعیت سند را دارند' }, { status: 403 })
    }

    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const body = await req.json()

    if (!body.id) {
      return NextResponse.json({ success: false, error: 'شناسه سند الزامی است' }, { status: 400 })
    }

    const where: any = { id: body.id, tenantId }
    const existing = await tenantDb.journalEntry.findFirst({ where })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'سند یافت نشد' }, { status: 404 })
    }

    const allowedStatuses = ['draft', 'posted', 'cancelled']
    if (body.status && !allowedStatuses.includes(body.status)) {
      return NextResponse.json(
        { success: false, error: `وضعیت نامعتبر. مقادیر مجاز: ${allowedStatuses.join(', ')}` },
        { status: 400 }
      )
    }

    const updateData: Record<string, any> = {}
    if (body.status) updateData.status = body.status
    if (body.description !== undefined) updateData.description = body.description

    await tenantDb.journalEntry.update({ where: { id: body.id }, data: updateData })

    return NextResponse.json({ success: true, message: 'سند با موفقیت بروزرسانی شد' })
  } catch (error: any) {
    console.error('[JournalEntries PUT] Error:', error)
    return NextResponse.json({ success: false, error: 'خطا در بروزرسانی سند' }, { status: 500 })
  }
})
