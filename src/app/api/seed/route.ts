import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const tenantId = body.tenantId || 'demo'

    // Check if already seeded
    const existingTenant = await db.tenant.findFirst({
      where: { subDomain: 'demo' },
    })

    if (existingTenant && existingTenant.id === tenantId) {
      // Check if products already exist
      const existingProducts = await db.product.count({
        where: { tenantId },
      })
      if (existingProducts > 0) {
        return NextResponse.json({
          success: true,
          message: 'دیتابیس قبلاً مقداردهی شده است',
          data: { tenantId, alreadySeeded: true },
        })
      }
    }

    // 1. Create Plans
    const planStarter = await db.plan.upsert({
      where: { id: 'plan-1' },
      update: {},
      create: {
        id: 'plan-1',
        name: 'Starter',
        nameFa: 'پایه',
        durationDays: 30,
        price: 290000,
        maxUsers: 2,
        maxProducts: 200,
        isActive: true,
      },
    })

    await db.plan.upsert({
      where: { id: 'plan-2' },
      update: {},
      create: {
        id: 'plan-2',
        name: 'Professional',
        nameFa: 'حرفه‌ای',
        durationDays: 30,
        price: 590000,
        maxUsers: 5,
        maxProducts: 1000,
        isActive: true,
      },
    })

    await db.plan.upsert({
      where: { id: 'plan-3' },
      update: {},
      create: {
        id: 'plan-3',
        name: 'Enterprise',
        nameFa: 'سازمانی',
        durationDays: 30,
        price: 990000,
        maxUsers: 20,
        maxProducts: 5000,
        isActive: true,
      },
    })

    // 2. Create Demo Tenant
    const tenant = await db.tenant.upsert({
      where: { id: tenantId },
      update: {},
      create: {
        id: tenantId,
        subDomain: 'demo',
        companyName: 'فروشگاه دمو',
        dbName: 'demo',
        status: 'Active',
      },
    })

    // 3. Create Subscription
    const startDate = new Date()
    const endDate = new Date()
    endDate.setDate(endDate.getDate() + planStarter.durationDays)

    await db.subscription.upsert({
      where: { id: 'sub-demo' },
      update: {},
      create: {
        id: 'sub-demo',
        tenantId: tenant.id,
        planId: planStarter.id,
        startDate,
        endDate,
        status: 'Active',
        autoRenew: false,
      },
    })

       // 4. Create Store Users
    await db.storeUser.upsert({
      where: { username_tenantId: { username: 'admin', tenantId } },
      update: {},
      create: {
        id: 'su-1',
        username: 'admin',
        passwordHash: await bcrypt.hash('admin123', 10),
        role: 'Manager',
        mobile: '09121234567',
        isActive: true,
        tenantId,
        // Manager doesn't need permissions - always full access
      },
    })

    await db.storeUser.upsert({
      where: { username_tenantId: { username: 'cashier1', tenantId } },
      update: {},
      create: {
        id: 'su-2',
        username: 'cashier1',
        passwordHash: await bcrypt.hash('cashier123', 10),
        role: 'Cashier',
        mobile: '09129876543',
        isActive: true,
        tenantId,
        permissions: JSON.stringify(['dashboard', 'pos', 'products', 'customers']),
      },
    })

    await db.storeUser.upsert({
      where: { username_tenantId: { username: 'cashier2', tenantId } },
      update: {},
      create: {
        id: 'su-3',
        username: 'cashier2',
        passwordHash: await bcrypt.hash('cashier123', 10),
        role: 'Cashier',
        mobile: '09135556677',
        isActive: false,
        tenantId,
        permissions: JSON.stringify(['pos']),
      },
    })

    // 5. Create Accounts (Chart of Accounts)
    const accountsData = [
      { id: 'acc-1', code: '1', name: 'دارایی‌ها', parentId: null, level: 1, type: 'Asset', nature: 'Debit', isSystem: true },
      { id: 'acc-2', code: '11', name: 'صندوق و بانک', parentId: 'acc-1', level: 2, type: 'Asset', nature: 'Debit', isSystem: true },
      { id: 'acc-3', code: '111', name: 'صندوق فروشگاه', parentId: 'acc-2', level: 3, type: 'Asset', nature: 'Debit', isSystem: true },
      { id: 'acc-4', code: '112', name: 'حساب بانکی', parentId: 'acc-2', level: 3, type: 'Asset', nature: 'Debit', isSystem: true },
      { id: 'acc-5', code: '12', name: 'حساب‌های دریافتنی', parentId: 'acc-1', level: 2, type: 'Asset', nature: 'Debit', isSystem: true },
      { id: 'acc-6', code: '121', name: 'مشتریان', parentId: 'acc-5', level: 3, type: 'Asset', nature: 'Debit', isSystem: true },
      { id: 'acc-7', code: '13', name: 'موجودی کالا', parentId: 'acc-1', level: 2, type: 'Asset', nature: 'Debit', isSystem: true },
      { id: 'acc-8', code: '4', name: 'درآمدها', parentId: null, level: 1, type: 'Income', nature: 'Credit', isSystem: true },
      { id: 'acc-9', code: '41', name: 'درآمد فروش', parentId: 'acc-8', level: 2, type: 'Income', nature: 'Credit', isSystem: true },
      { id: 'acc-10', code: '5', name: 'هزینه‌ها', parentId: null, level: 1, type: 'Expense', nature: 'Debit', isSystem: true },
      { id: 'acc-11', code: '51', name: 'بهای تمام‌شده کالای فروش‌رفته', parentId: 'acc-10', level: 2, type: 'Expense', nature: 'Debit', isSystem: true },
    ]

    for (const acc of accountsData) {
      await db.account.upsert({
        where: { id: acc.id },
        update: {},
        create: { ...acc, tenantId },
      })
    }

    // 6. Create Categories
    const categoriesData = [
      { id: 'cat-1', name: 'لبنیات' },
      { id: 'cat-2', name: 'غلات' },
      { id: 'cat-3', name: 'روغن' },
      { id: 'cat-4', name: 'قند و شکر' },
      { id: 'cat-5', name: 'نوشیدنی' },
      { id: 'cat-6', name: 'کنسرو' },
      { id: 'cat-7', name: 'بهداشت و آرایشی' },
      { id: 'cat-8', name: 'چاشنی' },
    ]

    for (const cat of categoriesData) {
      await db.productCategory.upsert({
        where: { id: cat.id },
        update: {},
        create: { id: cat.id, name: cat.name, isActive: true, tenantId },
      })
    }

    // 7. Create Products
    const productsData = [
      { id: 'p1', code: 'PRD-001', barcode: '6901234567890', name: 'شیر پرچرب کاله', categoryId: 'cat-1', purchasePrice: 25000, salePrice: 32000, taxRate: 9, currentStock: 150, minStock: 20 },
      { id: 'p2', code: 'PRD-002', barcode: '6901234567891', name: 'ماست سون ۹٪', categoryId: 'cat-1', purchasePrice: 18000, salePrice: 24000, taxRate: 9, currentStock: 80, minStock: 15 },
      { id: 'p3', code: 'PRD-003', barcode: '6901234567892', name: 'پنیر ویوله ۲۰۰ گرم', categoryId: 'cat-1', purchasePrice: 45000, salePrice: 58000, taxRate: 9, currentStock: 45, minStock: 10 },
      { id: 'p4', code: 'PRD-004', barcode: '6901234567893', name: 'برنج هاشمی ۵ کیلو', categoryId: 'cat-2', purchasePrice: 120000, salePrice: 155000, taxRate: 9, currentStock: 30, minStock: 5 },
      { id: 'p5', code: 'PRD-005', barcode: '6901234567894', name: 'روغن آفتابگردان ۱ لیتری', categoryId: 'cat-3', purchasePrice: 65000, salePrice: 82000, taxRate: 9, currentStock: 60, minStock: 10 },
      { id: 'p6', code: 'PRD-006', barcode: '6901234567895', name: 'قند کلهر ۱ کیلو', categoryId: 'cat-4', purchasePrice: 35000, salePrice: 42000, taxRate: 9, currentStock: 100, minStock: 20 },
      { id: 'p7', code: 'PRD-007', barcode: '6901234567896', name: 'چای احمد ۲۰۰ گرم', categoryId: 'cat-5', purchasePrice: 55000, salePrice: 72000, taxRate: 9, currentStock: 40, minStock: 8 },
      { id: 'p8', code: 'PRD-008', barcode: '6901234567897', name: 'کنسرو ماهی کیلکا ۱۵۰ گرم', categoryId: 'cat-6', purchasePrice: 28000, salePrice: 35000, taxRate: 9, currentStock: 70, minStock: 15 },
      { id: 'p9', code: 'PRD-009', barcode: '6901234567898', name: 'رنگ مو بیولاژ', categoryId: 'cat-7', purchasePrice: 85000, salePrice: 110000, taxRate: 9, currentStock: 25, minStock: 5 },
      { id: 'p10', code: 'PRD-010', barcode: '6901234567899', name: 'صابون لوکس ۱۲۵ گرم', categoryId: 'cat-7', purchasePrice: 12000, salePrice: 16000, taxRate: 9, currentStock: 200, minStock: 30 },
      { id: 'p11', code: 'PRD-011', barcode: null, name: 'خمیر دندانی پاکت ۵۰ گرم', categoryId: 'cat-7', purchasePrice: 15000, salePrice: 20000, taxRate: 9, currentStock: 3, minStock: 10 },
      { id: 'p12', code: 'PRD-012', barcode: null, name: 'شامپو شایین ۴۰۰ میلی‌لیتر', categoryId: 'cat-7', purchasePrice: 72000, salePrice: 95000, taxRate: 9, currentStock: 18, minStock: 5 },
      { id: 'p13', code: 'PRD-013', barcode: null, name: 'ماکارونی مقصد ۵۰۰ گرم', categoryId: 'cat-2', purchasePrice: 22000, salePrice: 28000, taxRate: 9, currentStock: 55, minStock: 10 },
      { id: 'p14', code: 'PRD-014', barcode: null, name: 'سس گوجه‌فرنگی فارال', categoryId: 'cat-8', purchasePrice: 18000, salePrice: 24000, taxRate: 9, currentStock: 35, minStock: 8 },
      { id: 'p15', code: 'PRD-015', barcode: null, name: 'کاغذ توالت بایودنت ۱۰ تایی', categoryId: 'cat-7', purchasePrice: 48000, salePrice: 62000, taxRate: 9, currentStock: 22, minStock: 5 },
    ]

    for (const prod of productsData) {
      await db.product.upsert({
        where: { id: prod.id },
        update: {},
        create: {
          ...prod,
          isActive: true,
          tenantId,
        },
      })
    }

    // 8. Create Customers
    const customersData = [
      { id: 'c1', code: 'CUS-001', firstName: 'محمد', lastName: 'احمدی', mobile: '09121234567', nationalCode: '1234567890', address: 'تهران، خیابان ولیعصر، پلاک ۱۲', creditLimit: 5000000, currentBalance: 1200000, isBlacklisted: false },
      { id: 'c2', code: 'CUS-002', firstName: 'فاطمه', lastName: 'محمدی', mobile: '09129876543', nationalCode: '0987654321', address: 'اصفهان، خیابان چهارباغ', creditLimit: 10000000, currentBalance: 3500000, isBlacklisted: false },
      { id: 'c3', code: 'CUS-003', firstName: 'علی', lastName: 'رضایی', mobile: '09135556677', nationalCode: '5678901234', address: 'شیراز، بلوار ارم', creditLimit: 3000000, currentBalance: 0, isBlacklisted: false },
      { id: 'c4', code: 'CUS-004', firstName: 'زهرا', lastName: 'حسینی', mobile: '09144445556', nationalCode: null, address: 'تبریز، خیابان ائتلاف', creditLimit: 8000000, currentBalance: 5200000, isBlacklisted: true },
      { id: 'c5', code: 'CUS-005', firstName: 'حسن', lastName: 'کریمی', mobile: '09156667778', nationalCode: '3456789012', address: 'مشهد، خیابان وکیل‌آباد', creditLimit: 7000000, currentBalance: 1800000, isBlacklisted: false },
      { id: 'c6', code: 'CUS-006', firstName: 'مریم', lastName: 'نجفی', mobile: '09168889990', nationalCode: null, address: 'کرمان، بلوار جمهوری', creditLimit: 4000000, currentBalance: 900000, isBlacklisted: false },
      { id: 'c7', code: 'CUS-007', firstName: 'رضا', lastName: 'عباسی', mobile: '09171112223', nationalCode: '7890123456', address: 'اهواز، خیابان پاسداران', creditLimit: 6000000, currentBalance: 2800000, isBlacklisted: false },
      { id: 'c8', code: 'CUS-008', firstName: 'سارا', lastName: 'موسوی', mobile: '09183334445', nationalCode: '2345678901', address: 'رشت، میدان شهرداری', creditLimit: 2000000, currentBalance: 0, isBlacklisted: false },
    ]

    for (const cust of customersData) {
      await db.customer.upsert({
        where: { id: cust.id },
        update: {},
        create: {
          ...cust,
          tenantId,
          createdAt: new Date(),
          lastPurchaseAt: cust.currentBalance > 0 ? new Date() : null,
        },
      })
    }

    // 9. Create Sample Invoices
    const inv1Date = new Date()
    inv1Date.setDate(inv1Date.getDate() - 0)
    inv1Date.setHours(10, 30, 0, 0)

    const inv1 = await db.invoice.upsert({
      where: { id: 'inv-1' },
      update: {},
      create: {
        id: 'inv-1',
        number: 'INV-14031201',
        customerId: 'c1',
        invoiceDate: inv1Date,
        dueDate: null,
        status: 'Paid',
        paymentType: 'Cash',
        subTotal: 320000,
        discountAmount: 10000,
        taxAmount: 27900,
        totalAmount: 337900,
        paidAmount: 337900,
        remainingAmount: 0,
        cashierId: 'su-1',
        description: null,
        tenantId,
        items: {
          create: [
            { id: 'ii-1', productId: 'p1', productName: 'شیر پرچرب کاله', quantity: 5, unitPrice: 32000, discount: 0, taxRate: 9, lineTotal: 174400 },
            { id: 'ii-2', productId: 'p5', productName: 'روغن آفتابگردان ۱ لیتری', quantity: 2, unitPrice: 82000, discount: 0, taxRate: 9, lineTotal: 178760 },
          ],
        },
      },
    })

    // Create payment for inv-1
    await db.invoicePayment.upsert({
      where: { id: 'ip-1' },
      update: {},
      create: {
        id: 'ip-1',
        invoiceId: inv1.id,
        amount: 337900,
        paymentType: 'Cash',
        reference: null,
        paidAt: inv1Date,
        receivedBy: 'su-1',
      },
    })

    const inv2Date = new Date()
    inv2Date.setDate(inv2Date.getDate() - 0)
    inv2Date.setHours(11, 15, 0, 0)

    const inv2 = await db.invoice.upsert({
      where: { id: 'inv-2' },
      update: {},
      create: {
        id: 'inv-2',
        number: 'INV-14031202',
        customerId: 'c2',
        invoiceDate: inv2Date,
        dueDate: new Date(inv2Date.getTime() + 90 * 24 * 60 * 60 * 1000),
        status: 'PartiallyPaid',
        paymentType: 'Installment',
        subTotal: 1250000,
        discountAmount: 50000,
        taxAmount: 108000,
        totalAmount: 1308000,
        paidAmount: 436000,
        remainingAmount: 872000,
        cashierId: 'su-2',
        description: 'خرید قسطی',
        tenantId,
        items: {
          create: [
            { id: 'ii-3', productId: 'p4', productName: 'برنج هاشمی ۵ کیلو', quantity: 3, unitPrice: 155000, discount: 0, taxRate: 9, lineTotal: 506850 },
            { id: 'ii-4', productId: 'p9', productName: 'رنگ مو بیولاژ', quantity: 5, unitPrice: 110000, discount: 10, taxRate: 9, lineTotal: 540450 },
            { id: 'ii-5', productId: 'p12', productName: 'شامپو شایین ۴۰۰ میلی‌لیتر', quantity: 3, unitPrice: 95000, discount: 0, taxRate: 9, lineTotal: 310650 },
          ],
        },
      },
    })

    await db.invoicePayment.upsert({
      where: { id: 'ip-2' },
      update: {},
      create: {
        id: 'ip-2',
        invoiceId: inv2.id,
        amount: 436000,
        paymentType: 'Cash',
        reference: null,
        paidAt: inv2Date,
        receivedBy: 'su-2',
      },
    })

    // Create installment plan for inv-2
    await db.installmentPlan.upsert({
      where: { id: 'isp-1' },
      update: {},
      create: {
        id: 'isp-1',
        invoiceId: inv2.id,
        totalAmount: 1308000,
        numberOfInstallments: 3,
        startDate: inv2Date,
        intervalDays: 30,
        interestRate: 0,
        tenantId,
        installments: {
          create: [
            { id: 'ins-1', number: 1, dueDate: new Date(inv2Date.getTime() + 30 * 24 * 60 * 60 * 1000), amount: 436000, status: 'Paid', paidAmount: 436000, paidAt: inv2Date },
            { id: 'ins-2', number: 2, dueDate: new Date(inv2Date.getTime() + 60 * 24 * 60 * 60 * 1000), amount: 436000, status: 'Pending', paidAmount: 0 },
            { id: 'ins-3', number: 3, dueDate: new Date(inv2Date.getTime() + 90 * 24 * 60 * 60 * 1000), amount: 436000, status: 'Pending', paidAmount: 0 },
          ],
        },
      },
    })

    const inv3Date = new Date()
    inv3Date.setDate(inv3Date.getDate() - 0)
    inv3Date.setHours(14, 0, 0, 0)

    await db.invoice.upsert({
      where: { id: 'inv-3' },
      update: {},
      create: {
        id: 'inv-3',
        number: 'INV-14031203',
        customerId: null,
        invoiceDate: inv3Date,
        dueDate: null,
        status: 'Confirmed',
        paymentType: 'Cash',
        subTotal: 88000,
        discountAmount: 0,
        taxAmount: 7920,
        totalAmount: 95920,
        paidAmount: 0,
        remainingAmount: 95920,
        cashierId: 'su-1',
        description: 'فروش عمومی',
        tenantId,
        items: {
          create: [
            { id: 'ii-6', productId: 'p6', productName: 'قند کلهر ۱ کیلو', quantity: 2, unitPrice: 42000, discount: 0, taxRate: 9, lineTotal: 91560 },
          ],
        },
      },
    })

    const inv4Date = new Date()
    inv4Date.setDate(inv4Date.getDate() - 1)
    inv4Date.setHours(9, 30, 0, 0)

    const inv4 = await db.invoice.upsert({
      where: { id: 'inv-4' },
      update: {},
      create: {
        id: 'inv-4',
        number: 'INV-14031101',
        customerId: 'c5',
        invoiceDate: inv4Date,
        dueDate: new Date(inv4Date.getTime() + 90 * 24 * 60 * 60 * 1000),
        status: 'Confirmed',
        paymentType: 'Installment',
        subTotal: 890000,
        discountAmount: 0,
        taxAmount: 80100,
        totalAmount: 970100,
        paidAmount: 0,
        remainingAmount: 970100,
        cashierId: 'su-1',
        description: 'خرید قسطی - اقساط ۳ ماهه',
        tenantId,
        items: {
          create: [
            { id: 'ii-7', productId: 'p4', productName: 'برنج هاشمی ۵ کیلو', quantity: 2, unitPrice: 155000, discount: 0, taxRate: 9, lineTotal: 337900 },
            { id: 'ii-8', productId: 'p5', productName: 'روغن آفتابگردان ۱ لیتری', quantity: 4, unitPrice: 82000, discount: 0, taxRate: 9, lineTotal: 357520 },
            { id: 'ii-9', productId: 'p10', productName: 'صابون لوکس ۱۲۵ گرم', quantity: 10, unitPrice: 16000, discount: 0, taxRate: 9, lineTotal: 174400 },
          ],
        },
      },
    })

    // Create installment plan for inv-4
    await db.installmentPlan.upsert({
      where: { id: 'isp-2' },
      update: {},
      create: {
        id: 'isp-2',
        invoiceId: inv4.id,
        totalAmount: 970100,
        numberOfInstallments: 3,
        startDate: inv4Date,
        intervalDays: 30,
        interestRate: 0,
        tenantId,
        installments: {
          create: [
            { id: 'ins-4', number: 1, dueDate: new Date(inv4Date.getTime() + 30 * 24 * 60 * 60 * 1000), amount: 323367, status: 'Pending', paidAmount: 0 },
            { id: 'ins-5', number: 2, dueDate: new Date(inv4Date.getTime() + 60 * 24 * 60 * 60 * 1000), amount: 323367, status: 'Pending', paidAmount: 0 },
            { id: 'ins-6', number: 3, dueDate: new Date(inv4Date.getTime() + 90 * 24 * 60 * 60 * 1000), amount: 323366, status: 'Pending', paidAmount: 0 },
          ],
        },
      },
    })

    const inv5Date = new Date()
    inv5Date.setDate(inv5Date.getDate() - 2)
    inv5Date.setHours(16, 45, 0, 0)

    await db.invoice.upsert({
      where: { id: 'inv-5' },
      update: {},
      create: {
        id: 'inv-5',
        number: 'INV-14031001',
        customerId: 'c4',
        invoiceDate: inv5Date,
        dueDate: null,
        status: 'Cancelled',
        paymentType: 'Cash',
        subTotal: 240000,
        discountAmount: 0,
        taxAmount: 21600,
        totalAmount: 261600,
        paidAmount: 0,
        remainingAmount: 0,
        cashierId: 'su-2',
        description: 'لغو شده - مرجوعی کالا',
        tenantId,
        items: {
          create: [
            { id: 'ii-10', productId: 'p9', productName: 'رنگ مو بیولاژ', quantity: 2, unitPrice: 110000, discount: 0, taxRate: 9, lineTotal: 239800 },
          ],
        },
      },
    })

    // 10. Create Journal Entries
    await db.journalEntry.upsert({
      where: { id: 'je-1' },
      update: {},
      create: {
        id: 'je-1',
        number: 'JE-14031201',
        entryDate: inv1Date,
        entryType: 'Automatic',
        description: 'صدور فاکتور نقدی INV-14031201',
        referenceType: 'Invoice',
        referenceId: 'inv-1',
        totalDebit: 337900,
        totalCredit: 337900,
        status: 'Confirmed',
        tenantId,
        lines: {
          create: [
            { id: 'jel-1', accountId: 'acc-3', debit: 337900, credit: 0, description: 'دریافت نقدی فاکتور INV-14031201' },
            { id: 'jel-2', accountId: 'acc-9', debit: 0, credit: 337900, description: 'درآمد فروش نقدی' },
          ],
        },
      },
    })

    await db.journalEntry.upsert({
      where: { id: 'je-2' },
      update: {},
      create: {
        id: 'je-2',
        number: 'JE-14031202',
        entryDate: inv2Date,
        entryType: 'Automatic',
        description: 'صدور فاکتور نسیه INV-14031202',
        referenceType: 'Invoice',
        referenceId: 'inv-2',
        totalDebit: 1308000,
        totalCredit: 1308000,
        status: 'Confirmed',
        tenantId,
        lines: {
          create: [
            { id: 'jel-3', accountId: 'acc-6', debit: 1308000, credit: 0, description: 'بدهی فاطمه محمدی - فاکتور INV-14031202' },
            { id: 'jel-4', accountId: 'acc-9', debit: 0, credit: 1308000, description: 'درآمد فروش نسیه' },
          ],
        },
      },
    })

    await db.journalEntry.upsert({
      where: { id: 'je-3' },
      update: {},
      create: {
        id: 'je-3',
        number: 'JE-14031203',
        entryDate: inv2Date,
        entryType: 'Automatic',
        description: 'دریافت قسط - فاکتور INV-14031202',
        referenceType: 'Payment',
        referenceId: 'ip-2',
        totalDebit: 436000,
        totalCredit: 436000,
        status: 'Confirmed',
        tenantId,
        lines: {
          create: [
            { id: 'jel-5', accountId: 'acc-3', debit: 436000, credit: 0, description: 'دریافت نقدی قسط اول' },
            { id: 'jel-6', accountId: 'acc-6', debit: 0, credit: 436000, description: 'تسویه جزئی بدهی فاطمه محمدی' },
          ],
        },
      },
    })

    await db.journalEntry.upsert({
      where: { id: 'je-4' },
      update: {},
      create: {
        id: 'je-4',
        number: 'JE-14031101',
        entryDate: inv4Date,
        entryType: 'Automatic',
        description: 'صدور فاکتور نسیه INV-14031101',
        referenceType: 'Invoice',
        referenceId: 'inv-4',
        totalDebit: 970100,
        totalCredit: 970100,
        status: 'Confirmed',
        tenantId,
        lines: {
          create: [
            { id: 'jel-7', accountId: 'acc-6', debit: 970100, credit: 0, description: 'بدهی حسن کریمی - فاکتور INV-14031101' },
            { id: 'jel-8', accountId: 'acc-9', debit: 0, credit: 970100, description: 'درآمد فروش نسیه' },
          ],
        },
      },
    })

    // 11. Create Store Settings
    const storeSettings = [
      { key: 'storeName', value: 'فروشگاه دمو' },
      { key: 'storeAddress', value: 'تهران، خیابان آزادی' },
      { key: 'storePhone', value: '02112345678' },
      { key: 'registrationNumber', value: '12345' },
      { key: 'defaultTaxRate', value: '9' },
      { key: 'currency', value: 'IRR' },
    ]

    for (const setting of storeSettings) {
      await db.storeSetting.upsert({
        where: { key_tenantId: { key: setting.key, tenantId } },
        update: {},
        create: { key: setting.key, value: setting.value, tenantId },
      })
    }

    // 12. Create Payment Gateway Setting
    await db.paymentGatewaySetting.upsert({
      where: { id: 'pgw-1' },
      update: {},
      create: {
        id: 'pgw-1',
        gatewayType: 'ZarinPal',
        merchantIdEncrypted: 'demo-merchant-id',
        apiKeyEncrypted: 'demo-api-key',
        isSandbox: true,
        isActive: false,
        priority: 1,
        tenantId,
      },
    })

    // 13. Create POS Setting
    await db.posSetting.upsert({
      where: { id: 'pos-1' },
      update: {},
      create: {
        id: 'pos-1',
        portType: 'Simulator',
        terminalId: 'TERM-001',
        merchantCode: 'MERC-001',
        isActive: false,
        tenantId,
      },
    })

    // 14. Create Invoice Template
    await db.invoiceTemplate.upsert({
      where: { id: 'tmpl-1' },
      update: {},
      create: {
        id: 'tmpl-1',
        headerText: 'فروشگاه دمو',
        footerText: 'با تشکر از خرید شما',
        bankAccounts: 'بانک ملت: 6104-xxxx-xxxx-xxxx',
        contactInfo: 'تلفن: 02112345678',
        primaryColor: '#16a34a',
        showTax: true,
        showDiscount: true,
        tenantId,
      },
    })

    // 15. Create Notifications
    const notifications = [
      { title: 'خوش آمدید', message: 'به فروشگاه دمو خوش آمدید!', type: 'Info' },
      { title: 'موجودی بحرانی', message: 'خمیر دندانی پاکت ۵۰ گرم به موجودی بحرانی رسیده است', type: 'Warning' },
      { title: 'قسط سررسید', message: 'قسط دوم فاکتور INV-14031202 نزدیک سررسید است', type: 'Warning' },
    ]

    for (const notif of notifications) {
      await db.notification.create({
        data: {
          userId: 'su-1',
          title: notif.title,
          message: notif.message,
          type: notif.type,
          isRead: false,
          tenantId,
        },
      })
    }

    return NextResponse.json({
      success: true,
      message: 'دیتابیس با موفقیت مقداردهی شد',
      data: {
        tenantId,
        seeded: {
          plans: 3,
          tenant: 1,
          users: 3,
          accounts: 11,
          categories: 8,
          products: 15,
          customers: 8,
          invoices: 5,
          journalEntries: 4,
          installmentPlans: 2,
          notifications: 3,
        },
      },
    }, { status: 201 })
  } catch (error) {
    console.error('Seed error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در مقداردهی دیتابیس', details: String(error) },
      { status: 500 }
    )
  }
}
