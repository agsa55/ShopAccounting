// src/app/api/invoices/service/route.ts — v8.7
// ============================================================================
// فاکتور تعمیرات و خدمات
// ----------------------------------------------------------------------------
// این endpoint یک فاکتور خدماتی ایجاد می‌کند:
//   - بدون نیاز به محصول (آیتم‌ها فقط توضیح خدمت + مبلغ هستند)
//   - شامل اطلاعات دستگاه/وسیله تعمیر شده (اختیاری)
//   - شامل گارانتی (اختیاری)
//   - صدور سند حسابداری (درآمد خدماتی + مالیات + صندوق/بدهکاران)
//   - بدون تأثیر روی موجودی انبار (چون کالایی فروخته نمی‌شود)
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'

// ═══════════════════════════════════════════════════════════════
//  POST /api/invoices/service
//  Body: {
//    customerId?,            // مشتری (اختیاری ولی برای نسیه الزامی)
//    serviceDevice?,         // نام/کد دستگاه تعمیر شده (اختیاری)
//    serviceWarranty?,       // گارانتی دارد؟ (boolean, پیش‌فرض false)
//    warrantyDays?,          // تعداد روز گارانتی (اختیاری)
//    description?,           // توضیحات کلی
//    paymentType,            // cash | credit | card
//    items: [{
//      serviceName,          // نام خدمت (مثلاً "تعمیر موتور یخچال")
//      description?,         // توضیحات جزئیات
//      quantity,             // تعداد/مقدار (مثلاً ۱ یا ۲.۵ ساعت)
//      unitLabel?,           // واحد (مثلاً "عدد", "ساعت", "روز")
//      unitPrice,            // مبلغ واحد
//      discountAmount?,
//      taxAmount?,
//    }],
//    payments?,              // [{ amount, paymentType, paymentRef? }]
//  }
// ═══════════════════════════════════════════════════════════════
export const POST = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const userId = tenant.user?.id

    const body = await req.json()
    const {
      customerId,
      serviceDevice,
      serviceWarranty = false,
      warrantyDays,
      description,
      paymentType = 'cash',
      items = [],
      payments = [],
    } = body

    // ★ اعتبارسنجی
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'حداقل یک خدمت الزامی است', code: 'NO_ITEMS' },
        { status: 400 }
      )
    }

    for (const item of items) {
      if (!item.serviceName || typeof item.serviceName !== 'string' || item.serviceName.trim().length < 2) {
        return NextResponse.json(
          { success: false, error: 'نام خدمت الزامی است (حداقل ۲ کاراکتر)' },
          { status: 400 }
        )
      }
      if (typeof item.quantity !== 'number' || item.quantity <= 0) {
        return NextResponse.json(
          { success: false, error: `مقدار خدمت باید بزرگتر از صفر باشد: ${item.serviceName}` },
          { status: 400 }
        )
      }
      if (typeof item.unitPrice !== 'number' || item.unitPrice < 0) {
        return NextResponse.json(
          { success: false, error: `مبلغ خدمت نامعتبر است: ${item.serviceName}` },
          { status: 400 }
        )
      }
    }

    // ★ برای نسیه، مشتری الزامی است
    const isCredit = paymentType === 'credit'
    if (isCredit && !customerId) {
      return NextResponse.json(
        { success: false, error: 'برای فروش نسیه انتخاب مشتری الزامی است', code: 'CUSTOMER_REQUIRED' },
        { status: 400 }
      )
    }

    // ★ محاسبه مبالغ
    let subTotal = 0
    let discountAmount = 0
    let taxAmount = 0

    const serviceItems = items.map((item: any) => {
      const lineDiscount = item.discountAmount || 0
      const lineTax = item.taxAmount || 0
      const lineTotal = item.quantity * item.unitPrice - lineDiscount + lineTax
      subTotal += item.quantity * item.unitPrice
      discountAmount += lineDiscount
      taxAmount += lineTax
      return {
        serviceName: item.serviceName.trim(),
        description: item.description?.trim() || null,
        quantity: item.quantity,
        unitLabel: item.unitLabel?.trim() || 'عدد',
        unitPrice: item.unitPrice,
        discountAmount: lineDiscount,
        taxAmount: lineTax,
        lineTotal,
      }
    })

    const totalAmount = subTotal - discountAmount + taxAmount

    if (totalAmount <= 0) {
      return NextResponse.json(
        { success: false, error: 'مبلغ کل فاکتور باید بزرگتر از صفر باشد' },
        { status: 400 }
      )
    }

    // ★ پرداخت‌ها
    let paidAmount = 0
    const invoicePayments = (payments || []).map((pay: any) => {
      paidAmount += pay.amount || 0
      return {
        amount: pay.amount || 0,
        paymentType: pay.paymentType || 'cash',
        paymentRef: pay.paymentRef || null,
        paidAt: new Date(),
        tenantId,
      }
    })

    if (isCredit) {
      paidAmount = 0
      invoicePayments.length = 0
    } else if (invoicePayments.length === 0) {
      paidAmount = totalAmount
      invoicePayments.push({
        amount: totalAmount,
        paymentType: paymentType.toLowerCase(),
        paidAt: new Date(),
        tenantId,
      })
    }

    // ★ وضعیت فاکتور
    let invoiceStatus = 'confirmed'
    if (isCredit) invoiceStatus = 'pending'
    else if (paidAmount >= totalAmount) invoiceStatus = 'paid'
    else if (paidAmount > 0) invoiceStatus = 'partial'

    // ★ شماره فاکتور خدماتی (SVC-XXXXXX)
    const count = await tenantDb.invoice.count({
      where: { tenantId, invoiceType: 'service' },
    })
    const invoiceNumber = `SVC-${(count + 1).toString().padStart(5, '0')}`

    const txClient = (tenantDb as any).$transaction ? tenantDb : db.client

    // ══════ شروع تراکنش ══════
    const invoice = await txClient.$transaction(async (tx: any) => {
      // ۱. ایجاد فاکتور خدماتی
      const inv = await tx.invoice.create({
        data: {
          number: invoiceNumber,
          customerId: customerId || null,
          invoiceDate: new Date(),
          status: invoiceStatus,
          paymentType,
          subTotal,
          discountAmount,
          taxAmount,
          totalAmount,
          paidAmount,
          remainingAmount: totalAmount - paidAmount,
          cashierId: userId,
          description: description || (serviceDevice ? `خدمات تعمیراتی — دستگاه: ${serviceDevice}` : 'فاکتور تعمیرات و خدمات'),
          tenantId,
          // ★★★ v8.7: فیلدهای مخصوص فاکتور خدماتی
          invoiceType: 'service',
          serviceDevice: serviceDevice?.trim() || null,
          serviceWarranty: !!serviceWarranty,
        },
      })

      // ۲. ایجاد آیتم‌های خدماتی
      for (const item of serviceItems) {
        await tx.invoiceItem.create({
          data: {
            invoiceId: inv.id,
            productId: null,  // فاکتور خدماتی محصول ندارد
            productName: item.serviceName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountAmount: item.discountAmount,
            taxAmount: item.taxAmount,
            lineTotal: item.lineTotal,
            description: item.description,
            unitLabel: item.unitLabel,
          },
        })
      }

      // ۳. ثبت پرداخت‌ها
      for (const pay of invoicePayments) {
        await tx.invoicePayment.create({
          data: {
            invoiceId: inv.id,
            amount: pay.amount,
            paymentType: pay.paymentType,
            paymentRef: pay.paymentRef,
            paidAt: pay.paidAt,
            tenantId,
          },
        })
      }

      // ۴. سند حسابداری (درآمد خدماتی + مالیات + صندوق/بدهکاران)
      try {
        const accounts = await tx.account.findMany({ where: { tenantId } })
        let cashAccountId: string | null = null
        let salesAccountId: string | null = null
        let serviceRevenueAccountId: string | null = null
        let receivablesAccountId: string | null = null
        let taxAccountId: string | null = null

        for (const acc of accounts) {
          const code = (acc.code || '').toLowerCase()
          const type = (acc.type || '').toLowerCase()
          const name = (acc.name || '').toLowerCase()

          if (!cashAccountId && (type === 'cash' || type === 'bank' || code.startsWith('110') || name.includes('صندوق') || name.includes('بانک'))) {
            cashAccountId = acc.id
          }
          // ★ اول حساب درآمد خدماتی (اگه وجود داره)، وگرنه درآمد فروش
          if (!serviceRevenueAccountId && (type === 'service_revenue' || code.startsWith('420') || name.includes('خدمات') || name.includes('تعمیر'))) {
            serviceRevenueAccountId = acc.id
          }
          if (!salesAccountId && (type === 'revenue' || type === 'sales' || code.startsWith('410') || name.includes('فروش') || name.includes('درآمد'))) {
            salesAccountId = acc.id
          }
          if (!receivablesAccountId && (type === 'receivable' || code.startsWith('130') || name.includes('طلب') || name.includes('بدهکار'))) {
            receivablesAccountId = acc.id
          }
          if (!taxAccountId && (type === 'tax' || code.startsWith('190') || name.includes('مالیات'))) {
            taxAccountId = acc.id
          }
        }

        // ★ استفاده از درآمد خدماتی اگه هست، وگرنه درآمد فروش
        const revenueAccountId = serviceRevenueAccountId || salesAccountId

        if (revenueAccountId) {
          const jeCount = await tx.journalEntry.count({ where: { tenantId } })
          const jeNumber = `JE-${(jeCount + 1).toString().padStart(6, '0')}`

          const netRevenue = subTotal - discountAmount
          const lines: any[] = []

          // بدهکار: صندوق (اگه نقدی) یا بدهکاران تجاری (اگه نسیه)
          const debitAccountId = isCredit ? (receivablesAccountId || cashAccountId) : cashAccountId
          if (debitAccountId) {
            lines.push({
              accountId: debitAccountId,
              debit: totalAmount,
              credit: 0,
              description: `بدهکار: ${isCredit ? 'بدهکاران تجاری' : 'صندوق'} — فاکتور خدماتی ${invoiceNumber}`,
            })
          }

          // بستانکار: درآمد خدماتی
          lines.push({
            accountId: revenueAccountId,
            debit: 0,
            credit: netRevenue,
            description: `بستانکار: درآمد ${serviceRevenueAccountId ? 'خدماتی' : 'فروش'} — فاکتور ${invoiceNumber}`,
          })

          // بستانکار: مالیات
          if (taxAmount > 0 && taxAccountId) {
            lines.push({
              accountId: taxAccountId,
              debit: 0,
              credit: taxAmount,
              description: `بستانکار: مالیات خدمات — فاکتور ${invoiceNumber}`,
            })
          }

          if (lines.length >= 2) {
            const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
            const totalCredit = lines.reduce((s, l) => s + l.credit, 0)

            await tx.journalEntry.create({
              data: {
                number: jeNumber,
                date: new Date(),
                description: `سند خودکار بابت فاکتور تعمیرات و خدمات ${invoiceNumber}`,
                status: 'posted',
                sourceType: 'service_invoice',
                sourceId: inv.id,
                totalDebit,
                totalCredit,
                createdBy: userId || null,
                tenantId,
                lines: { create: lines },
              },
            })
          }
        }
      } catch (jeErr: any) {
        console.warn('[Service Invoice] Auto journal entry failed (non-blocking):', jeErr?.message)
      }

      // ۵. در صورت نسیه، افزایش طلب از مشتری
      if (isCredit && customerId) {
        await tx.customer.update({
          where: { id: customerId },
          data: { currentBalance: { increment: totalAmount } },
        }).catch((err: any) => console.warn('[Service Invoice] خطا در Customer.update:', err?.message))
      }

      return inv
    })

    return NextResponse.json({
      success: true,
      data: {
        id: invoice.id,
        number: invoice.number,
        totalAmount: invoice.totalAmount,
        invoiceType: invoice.invoiceType,
        serviceDevice: invoice.serviceDevice,
        serviceWarranty: invoice.serviceWarranty,
      },
      message: `فاکتور تعمیرات و خدمات با شماره ${invoiceNumber} با موفقیت صادر شد. مبلغ: ${totalAmount.toLocaleString('fa-IR')} ریال`,
    })
  } catch (error: any) {
    console.error('[Service Invoice] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'خطا در صدور فاکتور تعمیرات و خدمات' },
      { status: 500 }
    )
  }
})
