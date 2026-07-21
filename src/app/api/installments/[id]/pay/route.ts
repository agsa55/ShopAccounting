import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { amount, paymentType, reference } = body

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'مبلغ پرداخت الزامی است' },
        { status: 400 }
      )
    }

    // Find the installment
    const installment = await db.installment.findUnique({
      where: { id },
      include: {
        plan: {
          include: {
            invoice: {
              include: { customer: true },
            },
          },
        },
      },
    })

    if (!installment) {
      return NextResponse.json(
        { success: false, error: 'قسط یافت نشد' },
        { status: 404 }
      )
    }

    if (installment.status === 'Paid') {
      return NextResponse.json(
        { success: false, error: 'این قسط قبلاً پرداخت شده است' },
        { status: 400 }
      )
    }

    const tenantId = installment.plan.tenantId

    // Update installment
    const updatedInstallment = await db.installment.update({
      where: { id },
      data: {
        paidAmount: amount,
        status: 'Paid',
        paidAt: new Date(),
      },
    })

    // Create payment record for the invoice
    await db.invoicePayment.create({
      data: {
        invoiceId: installment.plan.invoiceId,
        amount,
        paymentType: paymentType || 'Cash',
        reference: reference || `پرداخت قسط ${installment.number}`,
        paidAt: new Date(),
        receivedBy: null,
      },
    })

    // Update invoice paid/remaining amounts
    const invoice = await db.invoice.findUnique({
      where: { id: installment.plan.invoiceId },
      include: { payments: true },
    })

    if (invoice) {
      const totalPaid = invoice.payments.reduce((sum, p) => sum + p.amount, 0) + amount
      const newRemaining = invoice.totalAmount - totalPaid
      let newStatus = invoice.status

      if (newRemaining <= 0) {
        newStatus = 'Paid'
      } else if (totalPaid > 0) {
        newStatus = 'PartiallyPaid'
      }

      await db.invoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount: totalPaid,
          remainingAmount: Math.max(0, newRemaining),
          status: newStatus,
        },
      })

      // Update customer balance
      if (invoice.customerId && installment.plan.invoice.customer) {
        await db.customer.update({
          where: { id: invoice.customerId },
          data: { currentBalance: { decrement: amount } },
        })
      }
    }

    // Auto-generate journal entry
    // Debit صندوق/بانک, Credit مشتریان
    const cashboxAccount = await db.account.findFirst({
      where: { code: '111', tenantId },
    })
    const customersAccount = await db.account.findFirst({
      where: { code: '121', tenantId },
    })

    if (cashboxAccount && customersAccount) {
      // Generate journal entry number
      const today = new Date()
      const dateStr = `${String(today.getFullYear() % 100)}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
      const lastEntry = await db.journalEntry.findFirst({
        where: { tenantId },
        orderBy: { number: 'desc' },
      })
      let entrySeq = 1
      if (lastEntry) {
        const lastEntrySeq = parseInt(lastEntry.number.split('-').pop() || '0')
        entrySeq = lastEntrySeq + 1
      }
      const entryNumber = `JE-${dateStr}${String(entrySeq).padStart(2, '0')}`

      const customerName = installment.plan.invoice.customer
        ? `${installment.plan.invoice.customer.firstName} ${installment.plan.invoice.customer.lastName}`
        : 'مشتری'

      const debitAccountId = paymentType === 'Card' || paymentType === 'Online'
        ? (await db.account.findFirst({ where: { code: '112', tenantId } }))?.id || cashboxAccount.id
        : cashboxAccount.id

      await db.journalEntry.create({
        data: {
          number: entryNumber,
          entryDate: new Date(),
          entryType: 'Automatic',
          description: `دریافت قسط ${installment.number} - فاکتور ${installment.plan.invoice?.number || ''}`,
          referenceType: 'Payment',
          referenceId: id,
          totalDebit: amount,
          totalCredit: amount,
          status: 'Confirmed',
          tenantId,
          lines: {
            create: [
              {
                accountId: debitAccountId,
                debit: amount,
                credit: 0,
                description: `دریافت ${paymentType === 'Cash' ? 'نقدی' : 'غیرنقدی'} قسط ${installment.number}`,
              },
              {
                accountId: customersAccount.id,
                debit: 0,
                credit: amount,
                description: `تسویه جزئی بدهی ${customerName}`,
              },
            ],
          },
        },
      })
    }

    return NextResponse.json({
      success: true,
      data: updatedInstallment,
      message: 'قسط با موفقیت پرداخت شد',
    })
  } catch (error) {
    console.error('Installment pay error:', error)
    return NextResponse.json(
      { success: false, error: 'خطای داخلی سرور' },
      { status: 500 }
    )
  }
}
