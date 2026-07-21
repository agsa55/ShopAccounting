// src/app/api/purchase-invoices/service/route.ts — v8.7
// ============================================================================
// فاکتور خرید تعمیرات و خدمات
// ----------------------------------------------------------------------------
// این endpoint یک فاکتور خرید خدماتی ایجاد می‌کند:
//   - فروشگاه پول می‌دهد تا یک تعمیرکار یا ارائه‌دهنده خدمت برای آن کار کند
//   - مثال: تعمیر یخچال فروشگاه، نصب دوربین، تعمیر کولر، خدمات نظافت
//   - بدون نیاز به محصول انبار (خدماتی است)
//   - سند حسابداری: بدهکار (هزینه تعمیرات/خدمات)، بستانکار (صندوق/بدهکاران تجاری)
//   - بدون تأثیر روی موجودی انبار (چون کالا خریداری نمی‌شود)
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'

// ═══════════════════════════════════════════════════════════════
//  POST /api/purchase-invoices/service
//  Body: {
//    serviceCategory,        // 'repair' | 'service' — تعمیرات یا خدمات
//    supplierId?,            // آی‌دی تامین‌کننده/تعمیرکار
//    supplierName?,          // اگه تامین‌کننده ثبت نشده، نام آزاد
//    serviceDevice?,         // دستگاه/محل انجام کار (اختیاری)
//    description?,           // توضیحات کلی
//    invoiceDate?,           // تاریخ فاکتور
//    paymentType,            // cash | credit
//    warehouseId?,           // انبار (الزامی در schema، پس پیش‌فرض می‌گیریم)
//    items: [{
//      serviceName,          // نام خدمت/تعمیر
//      description?,         // توضیحات
//      quantity,
//      unitLabel?,           // عدد/ساعت/روز/ماه
//      unitPrice,
//      discountAmount?,
//      taxAmount?,
//    }]
//  }
// ═══════════════════════════════════════════════════════════════
export const POST = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const userId = tenant.user?.id

    const body = await req.json()
    const {
      serviceCategory = 'repair',  // repair | service
      supplierId,
      supplierName,
      serviceDevice,
      description,
      invoiceDate,
      paymentType = 'cash',
      warehouseId,
      items = [],
    } = body

    // ★ اعتبارسنجی نوع
    if (!['repair', 'service'].includes(serviceCategory)) {
      return NextResponse.json(
        { success: false, error: 'نوع فاکتور نامعتبر است (باید repair یا service باشد)' },
        { status: 400 }
      )
    }

    // ★ اعتبارسنجی آیتم‌ها
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'حداقل یک خدمت/تعمیر الزامی است', code: 'NO_ITEMS' },
        { status: 400 }
      )
    }

    for (const item of items) {
      if (!item.serviceName || typeof item.serviceName !== 'string' || item.serviceName.trim().length < 2) {
        return NextResponse.json(
          { success: false, error: 'نام خدمت/تعمیر الزامی است (حداقل ۲ کاراکتر)' },
          { status: 400 }
        )
      }
      if (typeof item.quantity !== 'number' || item.quantity <= 0) {
        return NextResponse.json(
          { success: false, error: `مقدار باید بزرگتر از صفر باشد: ${item.serviceName}` },
          { status: 400 }
        )
      }
      if (typeof item.unitPrice !== 'number' || item.unitPrice < 0) {
        return NextResponse.json(
          { success: false, error: `مبلغ نامعتبر است: ${item.serviceName}` },
          { status: 400 }
        )
      }
    }

    // ★ برای نسیه، تامین‌کننده الزامی است
    const isCredit = paymentType === 'credit'
    if (isCredit && !supplierId) {
      return NextResponse.json(
        { success: false, error: 'برای خرید نسیه، انتخاب تامین‌کننده الزامی است', code: 'SUPPLIER_REQUIRED' },
        { status: 400 }
      )
    }

    // ★ پیدا کردن انبار پیش‌فرض (الزامی در schema)
    let whId = warehouseId
    if (!whId) {
      const defaultWh = await tenantDb.warehouse.findFirst({
        where: { tenantId, isDefault: true, isActive: true },
      })
      if (defaultWh) {
        whId = defaultWh.id
      } else {
        const firstWh = await tenantDb.warehouse.findFirst({ where: { tenantId, isActive: true } })
        if (firstWh) whId = firstWh.id
      }
    }
    if (!whId) {
      return NextResponse.json(
        { success: false, error: 'انباری برای ثبت فاکتور یافت نشد. ابتدا یک انبار ایجاد کنید.' },
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

    // ★ تولید شماره فاکتور
    // تعمیرات: RP-XXXXXX (Repair Purchase)
    // خدمات: SP-XXXXXX (Service Purchase)
    const prefix = serviceCategory === 'repair' ? 'RP' : 'SP'
    const count = await tenantDb.purchaseInvoice.count({
      where: { tenantId, invoiceType: 'service' },
    })
    const invoiceNumber = `${prefix}-${(count + 1).toString().padStart(5, '0')}`

    const paidAmount = isCredit ? 0 : totalAmount
    const remainingAmount = isCredit ? totalAmount : 0

    // ★ توضیحات فاکتور
    const categoryLabel = serviceCategory === 'repair' ? 'تعمیرات' : 'خدمات'
    const fullDescription = description ||
      `فاکتور ${categoryLabel} — ${serviceDevice ? `دستگاه: ${serviceDevice}` : ''}`.trim()

    const txClient = (tenantDb as any).$transaction ? tenantDb : db.client

    // ══════ شروع تراکنش ══════
    const invoice = await txClient.$transaction(async (tx: any) => {
      // ۱. ایجاد فاکتور خرید خدماتی
      const inv = await tx.purchaseInvoice.create({
        data: {
          tenantId,
          supplierId: supplierId || null,
          number: invoiceNumber,
          invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
          status: 'confirmed',
          paymentType,
          subTotal,
          discountAmount,
          taxAmount,
          totalAmount,
          paidAmount,
          remainingAmount,
          warehouseId: whId,
          description: fullDescription,
          cashierId: userId,
          invoiceType: 'service',  // ★★★ نشان می‌دهد که این فاکتور خدماتی است
        },
      })

      // ۲. ایجاد آیتم‌های خدماتی
      for (const item of serviceItems) {
        await tx.purchaseInvoiceItem.create({
          data: {
            purchaseInvoiceId: inv.id,
            productId: null,  // فاکتور خدماتی محصول ندارد
            productName: item.serviceName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountAmount: item.discountAmount,
            taxAmount: item.taxAmount,
            lineTotal: item.lineTotal,
            returnReason: item.description,  // ★ باز استفاده از این فیلد برای توضیحات خدمت
          },
        })
      }

      // ۳. سند حسابداری (هزینه تعمیرات/خدمات + مالیات + صندوق/بدهکاران)
      try {
        const accounts = await tx.account.findMany({ where: { tenantId } })
        let cashAccountId: string | null = null
        let payableAccountId: string | null = null
        let taxAccountId: string | null = null
        // ★ حساب‌های هزینه تعمیرات و خدمات
        let repairExpenseAccountId: string | null = null
        let serviceExpenseAccountId: string | null = null
        // ★ fallback: حساب هزینه عمومی
        let expenseAccountId: string | null = null

        for (const acc of accounts) {
          const code = (acc.code || '').toLowerCase()
          const type = (acc.type || '').toLowerCase()
          const name = (acc.name || '').toLowerCase()

          if (!cashAccountId && (type === 'cash' || type === 'bank' || code.startsWith('110') || name.includes('صندوق') || name.includes('بانک'))) {
            cashAccountId = acc.id
          }
          if (!payableAccountId && (type === 'payable' || type === 'accounts_payable' || code.startsWith('210') || name.includes('بدهکاران') || name.includes('تامین'))) {
            payableAccountId = acc.id
          }
          if (!taxAccountId && (type === 'tax' || code.startsWith('190') || name.includes('مالیات'))) {
            taxAccountId = acc.id
          }
          // ★ حساب هزینه تعمیرات (کد 610 یا نام شامل "تعمیر")
          if (!repairExpenseAccountId && (type === 'repair_expense' || code.startsWith('610') || name.includes('تعمیر'))) {
            repairExpenseAccountId = acc.id
          }
          // ★ حساب هزینه خدمات (کد 620 یا نام شامل "خدمات")
          if (!serviceExpenseAccountId && (type === 'service_expense' || code.startsWith('620') || name.includes('خدمات'))) {
            serviceExpenseAccountId = acc.id
          }
          // ★ fallback: هر حساب هزینه‌ای
          if (!expenseAccountId && (type === 'expense' || type === 'cost' || code.startsWith('5') || code.startsWith('6') || name.includes('هزینه'))) {
            expenseAccountId = acc.id
          }
        }

        // ★ انتخاب حساب هزینه مناسب بر اساس نوع
        const expenseAccount =
          serviceCategory === 'repair'
            ? (repairExpenseAccountId || expenseAccountId)
            : (serviceExpenseAccountId || expenseAccountId)

        if (expenseAccount) {
          const jeCount = await tx.journalEntry.count({ where: { tenantId } })
          const jeNumber = `JE-${(jeCount + 1).toString().padStart(6, '0')}`

          const netAmount = subTotal - discountAmount
          const lines: any[] = []

          // بدهکار: هزینه تعمیرات/خدمات
          lines.push({
            accountId: expenseAccount,
            debit: netAmount,
            credit: 0,
            description: `بدهکار: هزینه ${categoryLabel} — فاکتور ${invoiceNumber}`,
          })

          // بدهکار: مالیات
          if (taxAmount > 0 && taxAccountId) {
            lines.push({
              accountId: taxAccountId,
              debit: taxAmount,
              credit: 0,
              description: `بدهکار: مالیات ${categoryLabel} — فاکتور ${invoiceNumber}`,
            })
          }

          // بستانکار: صندوق (اگه نقدی) یا بدهکاران تجاری (اگه نسیه)
          const creditAccountId = isCredit ? (payableAccountId || cashAccountId) : cashAccountId
          if (creditAccountId) {
            lines.push({
              accountId: creditAccountId,
              debit: 0,
              credit: totalAmount,
              description: `بستانکار: ${isCredit ? 'بدهکاران تجاری' : 'صندوق'} — فاکتور ${categoryLabel} ${invoiceNumber}`,
            })
          }

          if (lines.length >= 2) {
            const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
            const totalCredit = lines.reduce((s, l) => s + l.credit, 0)

            const journalEntry = await tx.journalEntry.create({
              data: {
                number: jeNumber,
                date: new Date(),
                description: `سند خودکار بابت فاکتور ${categoryLabel} ${invoiceNumber}`,
                status: 'posted',
                sourceType: 'service_purchase',
                sourceId: inv.id,
                totalDebit,
                totalCredit,
                createdBy: userId || null,
                tenantId,
                lines: { create: lines },
              },
            })

            await tx.purchaseInvoice.update({
              where: { id: inv.id },
              data: { journalEntryId: journalEntry.id },
            })
          }
        }
      } catch (jeErr: any) {
        console.warn('[Service Purchase] Auto journal entry failed (non-blocking):', jeErr?.message)
      }

      // ۴. در صورت نسیه، افزایش بدهی به تامین‌کننده
      if (isCredit && supplierId) {
        await tx.supplier.update({
          where: { id: supplierId },
          data: { currentBalance: { increment: totalAmount } },
        }).catch((err: any) => console.warn('[Service Purchase] خطا در Supplier.update:', err?.message))
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
        serviceCategory,
      },
      message: `فاکتور ${categoryLabel} با شماره ${invoiceNumber} با موفقیت صادر شد. مبلغ: ${totalAmount.toLocaleString('fa-IR')} ریال`,
    })
  } catch (error: any) {
    console.error('[Service Purchase] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'خطا در صدور فاکتور تعمیرات/خدمات' },
      { status: 500 }
    )
  }
})
