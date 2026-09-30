// ============================================================================
// src/lib/reports/report-datasets.ts — v12.5 ★★★
// ShopAccounting — Report Dataset Definitions
// ----------------------------------------------------------------------------
// ★ v12.5: بازنویسی کامل بر اساس schema.prisma واقعی
//   - همه فیلدها با مدل‌های Prisma مطابقت دارند
//   - groupByKey برای فیلدهای رابطه‌ای تعریف شده
//   - فیلدهای فرمولی (isFormula) به درستی تعریف شده‌اند
//   - فیلدهای NOT NULL شناسایی شده‌اند
// ============================================================================

import type { Dataset, DatasetSummary } from './report-types'

// ═══════════════════════════════════════════════════════════════
//  تعریف کامل دیتاست‌ها
// ═══════════════════════════════════════════════════════════════

const DATASETS: Record<string, Dataset> = {
  // ═══════════════════════════════════════════════════════════════
  //  ۱. فاکتورهای فروش
  // ═══════════════════════════════════════════════════════════════
  sales_invoices: {
    id: 'sales_invoices',
    label: 'فاکتورهای فروش',
    description: 'گزارش‌های تحلیلی از فاکتورهای فروش فروشگاه',
    model: 'Invoice',
    icon: 'FileText',
    color: 'amber',
    allowGroupBy: true,
    defaultFilter: {
      field: 'invoiceType',
      operator: 'equals',
      value: 'sale',
    },
    fields: [
      // ── فیلدهای شناسایی ──
      {
        id: 'id',
        label: 'شناسه فاکتور',
        type: 'string',
        source: 'id',
        description: 'شناسه یکتای فاکتور',
      },
      {
        id: 'number',
        label: 'شماره فاکتور',
        type: 'string',
        source: 'number',
        description: 'شماره فاکتور (مثل INV-000001)',
      },
        // ★ فیلد شمارشی برای شمارش تعداد فاکتورها
     {
        id: 'invoiceCount',
        label: 'تعداد فاکتور',
        type: 'number',
        source: 'totalAmount',
        aggregatable: true,
        description: 'تعداد فاکتورها (با تجمیع تعداد استفاده شود)',
      },
      {
        id: 'invoiceDate',
        label: 'تاریخ فاکتور',
        type: 'datetime',
        source: 'invoiceDate',
        description: 'تاریخ صدور فاکتور',
      },
      {
        id: 'dueDate',
        label: 'سررسید',
        type: 'datetime',
        source: 'dueDate',
        description: 'تاریخ سررسید پرداخت (اختیاری)',
      },

      // ── وضعیت و نوع ──
      {
        id: 'status',
        label: 'وضعیت',
        type: 'enum',
        source: 'status',
        enumValues: ['draft', 'confirmed', 'paid', 'partial', 'cancelled'],
        enumLabels: {
          draft: 'پیش‌نویس',
          confirmed: 'تأیید شده',
          paid: 'پرداخت شده',
          partial: 'پرداخت جزئی',
          cancelled: 'لغو شده',
        },
        description: 'وضعیت فاکتور',
      },
      {
        id: 'paymentType',
        label: 'نوع پرداخت',
        type: 'enum',
        source: 'paymentType',
        enumValues: ['cash', 'card', 'check', 'credit', 'installment' ,'online'],
        enumLabels: {
          cash: 'نقدی',
          card: 'کارتخوان',
          check: 'چک',
          credit: 'نسیه',
          installment: 'قسطی',
          online:'آنلاین'
        },
        description: 'روش پرداخت فاکتور',
      },
      {
        id: 'invoiceType',
        label: 'نوع فاکتور',
        type: 'enum',
        source: 'invoiceType',
        enumValues: ['sale', 'sale_return', 'service'],
        enumLabels: {
          sale: 'فروش عادی',
          sale_return: 'برگشتی فروش',
          service: 'خدماتی',
        },
        description: 'نوع فاکتور',
      },

      // ── مبالغ ──
      {
        id: 'subTotal',
        label: 'جمع قبل از تخفیف',
        type: 'currency',
        source: 'subTotal',
        aggregatable: true,
        description: 'جمع کل قبل از اعمال تخفیف',
      },
      {
        id: 'discountAmount',
        label: 'مبلغ تخفیف',
        type: 'currency',
        source: 'discountAmount',
        aggregatable: true,
        description: 'مبلغ تخفیف اعمال شده',
      },
      {
        id: 'taxAmount',
        label: 'مالیات',
        type: 'currency',
        source: 'taxAmount',
        aggregatable: true,
        description: 'مبلغ مالیات',
      },
      {
        id: 'totalAmount',
        label: 'مبلغ کل فاکتور',
        type: 'currency',
        source: 'totalAmount',
        aggregatable: true,
        description: 'مبلغ نهایی فاکتور',
      },
      {
        id: 'paidAmount',
        label: 'مبلغ پرداخت شده',
        type: 'currency',
        source: 'paidAmount',
        aggregatable: true,
        description: 'مبلغی که تاکنون پرداخت شده',
      },
      {
        id: 'remainingAmount',
        label: 'مبلغ باقیمانده',
        type: 'currency',
        source: 'remainingAmount',
        aggregatable: true,
        description: 'مبلغی که هنوز پرداخت نشده',
      },
      {
        id: 'cogsAmount',
        label: 'بهای تمام شده',
        type: 'currency',
        source: 'cogsAmount',
        aggregatable: true,
        description: 'بهای تمام شده کالای فروش رفته',
      },

      // ── فرمول‌ها ──
      {
        id: 'grossProfit',
        label: 'سود ناخالص',
        type: 'currency',
        source: 'totalAmount',
        isFormula: true,
        formula: 'totalAmount - cogsAmount',
        aggregatable: true,
        description: 'سود ناخالص = مبلغ کل - بهای تمام شده',
      },
      {
        id: 'profitMargin',
        label: 'حاشیه سود (%)',
        type: 'number',
        source: 'totalAmount',
        isFormula: true,
        formula: '(totalAmount - cogsAmount) / totalAmount * 100',
        aggregatable: false,
        description: 'درصد حاشیه سود',
      },

      // ── فیلدهای رابطه‌ای ──
      {
        id: 'customerFirstName',
        label: 'نام مشتری',
        type: 'string',
        source: 'customer.firstName',
        groupByKey: 'customerId',
        description: 'نام کوچک مشتری',
      },
      {
        id: 'customerLastName',
        label: 'نام خانوادگی مشتری',
        type: 'string',
        source: 'customer.lastName',
        groupByKey: 'customerId',
        description: 'نام خانوادگی مشتری',
      },
      {
        id: 'customerCompanyName',
        label: 'نام شرکت مشتری',
        type: 'string',
        source: 'customer.companyName',
        groupByKey: 'customerId',
        description: 'نام شرکت (برای مشتریان حقوقی)',
      },
      {
        id: 'customerMobile',
        label: 'موبایل مشتری',
        type: 'string',
        source: 'customer.mobile',
        groupByKey: 'customerId',
        description: 'شماره موبایل مشتری',
      },
      {
        id: 'cashierName',
        label: 'نام صندوق‌دار',
        type: 'string',
        source: 'cashier.username',
        groupByKey: 'cashierId',
        description: 'نام کاربری صندوق‌دار',
      },
      {
        id: 'warehouseName',
        label: 'نام انبار',
        type: 'string',
        source: 'warehouse.name',
        groupByKey: 'warehouseId',
        description: 'نام انبار',
      },

      // ── سایر فیلدها ──
      {
        id: 'description',
        label: 'توضیحات',
        type: 'string',
        source: 'description',
        description: 'توضیحات فاکتور',
      },
      {
        id: 'createdAt',
        label: 'تاریخ ثبت',
        type: 'datetime',
        source: 'createdAt',
        description: 'تاریخ ثبت فاکتور در سیستم',
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  //  ۲. مشتریان
  // ═══════════════════════════════════════════════════════════════
  customers: {
    id: 'customers',
    label: 'مشتریان',
    description: 'اطلاعات مشتریان، مانده حساب و تاریخچه',
    model: 'Customer',
    icon: 'User',
    color: 'blue',
    allowGroupBy: true,
    fields: [
      {
        id: 'id',
        label: 'شناسه',
        type: 'string',
        source: 'id',
        description: 'شناسه یکتای مشتری',
      },
      {
        id: 'code',
        label: 'کد مشتری',
        type: 'string',
        source: 'code',
        description: 'کد اختصاصی مشتری',
      },
            // ★ فیلد شمارشی برای شمارش تعداد مشتریان
      {
        id: 'customerCount',
        label: 'تعداد مشتری',
        type: 'number',
        source: 'currentBalance',
        aggregatable: true,
        description: 'تعداد مشتریان (با تجمیع تعداد استفاده شود)',
      },
      {
        id: 'firstName',
        label: 'نام',
        type: 'string',
        source: 'firstName',
        description: 'نام کوچک',
      },
      {
        id: 'lastName',
        label: 'نام خانوادگی',
        type: 'string',
        source: 'lastName',
        description: 'نام خانوادگی',
      },
      {
        id: 'fullName',
        label: 'نام کامل',
        type: 'string',
        source: 'firstName',
        isFormula: true,
        formula: 'firstName + " " + lastName',
        description: 'ترکیب نام و نام خانوادگی',
      },
      {
        id: 'companyName',
        label: 'نام شرکت',
        type: 'string',
        source: 'companyName',
        description: 'نام شرکت (حقوقی)',
      },
      {
        id: 'personType',
        label: 'نوع شخص',
        type: 'enum',
        source: 'personType',
        enumValues: ['person', 'legal'],
        enumLabels: {
          person: 'حقیقی',
          legal: 'حقوقی',
        },
        description: 'حقیقی یا حقوقی',
      },
      {
        id: 'mobile',
        label: 'موبایل',
        type: 'string',
        source: 'mobile',
        description: 'شماره موبایل',
      },
      {
        id: 'nationalCode',
        label: 'کد ملی',
        type: 'string',
        source: 'nationalCode',
        description: 'کد ملی یا شناسه ملی',
      },
      {
        id: 'economicCode',
        label: 'کد اقتصادی',
        type: 'string',
        source: 'economicCode',
        description: 'کد اقتصادی (حقوقی)',
      },
      {
        id: 'address',
        label: 'آدرس',
        type: 'string',
        source: 'address',
        description: 'آدرس پستی',
      },
      {
        id: 'creditLimit',
        label: 'سقف اعتبار',
        type: 'currency',
        source: 'creditLimit',
        aggregatable: true,
        description: 'حداکثر اعتبار مجاز',
      },
      {
        id: 'currentBalance',
        label: 'مانده حساب',
        type: 'currency',
        source: 'currentBalance',
        aggregatable: true,
        description: 'مانده فعلی (مثبت = بدهکار)',
      },
      {
        id: 'isBlacklisted',
        label: 'لیست سیاه',
        type: 'boolean',
        source: 'isBlacklisted',
        description: 'آیا در لیست سیاه است؟',
      },
      {
        id: 'lastPurchaseAt',
        label: 'آخرین خرید',
        type: 'datetime',
        source: 'lastPurchaseAt',
        description: 'تاریخ آخرین خرید',
      },
      {
        id: 'createdAt',
        label: 'تاریخ ثبت',
        type: 'datetime',
        source: 'createdAt',
        description: 'تاریخ ثبت در سیستم',
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  //  ۳. کالاها
  // ═══════════════════════════════════════════════════════════════
  products: {
    id: 'products',
    label: 'کالاها',
    description: 'اطلاعات محصولات، موجودی و قیمت‌ها',
    model: 'Product',
    icon: 'Package',
    color: 'green',
    allowGroupBy: true,
    fields: [
      {
        id: 'id',
        label: 'شناسه',
        type: 'string',
        source: 'id',
        description: 'شناسه یکتای محصول',
      },
      {
        id: 'code',
        label: 'کد کالا',
        type: 'string',
        source: 'code',
        description: 'کد اختصاصی کالا',
      },
            // ★ فیلد شمارشی برای شمارش تعداد کالاها
    {
        id: 'productCount',
        label: 'تعداد کالا',
        type: 'number',
        source: 'currentStock',
        aggregatable: true,
        description: 'تعداد کالاها (با تجمیع تعداد استفاده شود)',
      },
      {
        id: 'barcode',
        label: 'بارکد',
        type: 'string',
        source: 'barcode',
        description: 'بارکد محصول',
      },
      {
        id: 'name',
        label: 'نام کالا',
        type: 'string',
        source: 'name',
        description: 'نام محصول',
      },
   
      // ✅ بعد - با enumLabels فارسی
      {
        id: 'unitLabel',
        label: 'واحد',
        type: 'enum',
        source: 'unitLabel',
        enumValues: [
          'عدد', 'کیلوگرم', 'گرم', 'متر', 'لیتر', 'جعبه', 'بسته', 'کیسه', 'تن',
          'میلی‌متر', 'سانتی‌متر', 'میلی‌لیتر', 'متر مربع', 'متر مکعب', 'دستگاه',
          'kg', 'g', 'meter', 'liter', 'pcs', 'box', 'pack', 'bag', 'ton',
          'mm', 'cm', 'm', 'L', 'ml', 'm2', 'm3', 'unit', 'piece', 'dozen',
        ],
        enumLabels: {
          'عدد': 'عدد',
          'کیلوگرم': 'کیلوگرم',
          'گرم': 'گرم',
          'متر': 'متر',
          'لیتر': 'لیتر',
          'جعبه': 'جعبه',
          'بسته': 'بسته',
          'کیسه': 'کیسه',
          'تن': 'تن',
          'میلی‌متر': 'میلی‌متر',
          'سانتی‌متر': 'سانتی‌متر',
          'میلی‌لیتر': 'میلی‌لیتر',
          'متر مربع': 'متر مربع',
          'متر مکعب': 'متر مکعب',
          'دستگاه': 'دستگاه',
          'kg': 'کیلوگرم',
          'g': 'گرم',
          'meter': 'متر',
          'liter': 'لیتر',
          'pcs': 'عدد',
          'box': 'جعبه',
          'pack': 'بسته',
          'bag': 'کیسه',
          'ton': 'تن',
          'mm': 'میلی‌متر',
          'cm': 'سانتی‌متر',
          'm': 'متر',
          'L': 'لیتر',
          'ml': 'میلی‌لیتر',
          'm2': 'متر مربع',
          'm3': 'متر مکعب',
          'unit': 'عدد',
          'piece': 'عدد',
          'dozen': 'دوجین',
        },
        description: 'واحد اندازه‌گیری',
      },
      {
        id: 'purchasePrice',
        label: 'قیمت خرید',
        type: 'currency',
        source: 'purchasePrice',
        aggregatable: true,
        description: 'قیمت خرید محصول',
      },
      {
        id: 'salePrice',
        label: 'قیمت فروش',
        type: 'currency',
        source: 'salePrice',
        aggregatable: true,
        description: 'قیمت فروش محصول',
      },
    
      {
        id: 'currentStock',
        label: 'موجودی فعلی',
        type: 'number',
        source: 'currentStock',
        aggregatable: true,
        description: 'موجودی فعلی در انبار',
      },
      {
        id: 'minStock',
        label: 'حداقل موجودی',
        type: 'number',
        source: 'minStock',
        aggregatable: false,
        description: 'حداقل موجودی مجاز',
      },
      {
        id: 'stockValue',
        label: 'ارزش موجودی',
        type: 'currency',
        source: 'currentStock',
        isFormula: true,
        formula: 'currentStock * purchasePrice',
        aggregatable: true,
        description: 'ارزش ریالی موجودی فعلی',
      },
         // ★ فیلدهای سود - جدید
      {
        id: 'profitPerUnit',
        label: 'سود هر واحد',
        type: 'currency',
        source: 'salePrice',
        isFormula: true,
        formula: 'salePrice - purchasePrice',
        aggregatable: false,
        description: 'سود هر واحد = قیمت فروش - قیمت خرید',
      },
      {
        id: 'profitMarginPercent',
        label: 'حاشیه سود (%)',
        type: 'number',
        source: 'salePrice',
        isFormula: true,
        formula: '(salePrice - purchasePrice) / salePrice * 100',
        aggregatable: false,
        description: 'درصد حاشیه سود هر واحد',
      },
      {
        id: 'potentialProfit',
        label: 'سود بالقوه موجودی',
        type: 'currency',
        source: 'currentStock',
        isFormula: true,
        formula: 'currentStock * (salePrice - purchasePrice)',
        aggregatable: true,
        description: 'سود کل اگر همه موجودی فعلی فروخته شود',
      },
      {
        id: 'isActive',
        label: 'فعال',
        type: 'boolean',
        source: 'isActive',
        description: 'آیا محصول فعال است؟',
      },
      {
        id: 'categoryName',
        label: 'دسته‌بندی',
        type: 'string',
        source: 'category.name',
        groupByKey: 'categoryId',
        description: 'نام دسته‌بندی',
      },
     {
        id: 'unitName',
        label: 'نام واحد',
        type: 'enum',
        source: 'unit.name',
        groupByKey: 'unitId',
        enumValues: [
          'عدد', 'کیلوگرم', 'گرم', 'متر', 'لیتر', 'جعبه', 'بسته', 'کیسه', 'تن',
          'میلی‌متر', 'سانتی‌متر', 'میلی‌لیتر', 'متر مربع', 'متر مکعب', 'دستگاه',
          'kg', 'g', 'meter', 'liter', 'pcs', 'box', 'pack', 'bag', 'ton',
          'mm', 'cm', 'm', 'L', 'ml', 'm2', 'm3', 'unit', 'piece', 'dozen',
        ],
        enumLabels: {
          'عدد': 'عدد',
          'کیلوگرم': 'کیلوگرم',
          'گرم': 'گرم',
          'متر': 'متر',
          'لیتر': 'لیتر',
          'جعبه': 'جعبه',
          'بسته': 'بسته',
          'کیسه': 'کیسه',
          'تن': 'تن',
          'میلی‌متر': 'میلی‌متر',
          'سانتی‌متر': 'سانتی‌متر',
          'میلی‌لیتر': 'میلی‌لیتر',
          'متر مربع': 'متر مربع',
          'متر مکعب': 'متر مکعب',
          'دستگاه': 'دستگاه',
          'kg': 'کیلوگرم',
          'g': 'گرم',
          'meter': 'متر',
          'liter': 'لیتر',
          'pcs': 'عدد',
          'box': 'جعبه',
          'pack': 'بسته',
          'bag': 'کیسه',
          'ton': 'تن',
          'mm': 'میلی‌متر',
          'cm': 'سانتی‌متر',
          'm': 'متر',
          'L': 'لیتر',
          'ml': 'میلی‌لیتر',
          'm2': 'متر مربع',
          'm3': 'متر مکعب',
          'unit': 'عدد',
          'piece': 'عدد',
          'dozen': 'دوجین',
        },
        description: 'نام واحد اندازه‌گیری',
      },
      {
        id: 'createdAt',
        label: 'تاریخ ثبت',
        type: 'datetime',
        source: 'createdAt',
        description: 'تاریخ ثبت در سیستم',
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  //  ۴. اقلام فاکتور فروش
  // ═══════════════════════════════════════════════════════════════
  invoice_items: {
    id: 'invoice_items',
    label: 'اقلام فاکتور فروش',
    description: 'جزئیات آیتم‌های فروخته شده در فاکتورها',
    model: 'InvoiceItem',
    icon: 'Layers',
    color: 'purple',
    allowGroupBy: true,
        tenantFilterPath: 'invoice.tenantId',
    fields: [
      {
        id: 'id',
        label: 'شناسه',
        type: 'string',
        source: 'id',
        description: 'شناسه یکتای آیتم',
      },
      {
        id: 'productName',
        label: 'نام محصول',
        type: 'string',
        source: 'productName',
        description: 'نام محصول فروخته شده',
      },
            // ★ فیلد شمارشی برای شمارش تعداد آیتم‌ها
      {
        id: 'itemCount',
        label: 'تعداد آیتم',
        type: 'number',
        source: 'quantity',
        aggregatable: true,
        description: 'تعداد کل آیتم‌های فروخته‌شده',
      },
          {
        id: 'unitLabel',
        label: 'واحد',
        type: 'enum',
        source: 'unitLabel',
        enumValues: [
          'عدد', 'کیلوگرم', 'گرم', 'متر', 'لیتر', 'جعبه', 'بسته', 'کیسه', 'تن',
          'میلی‌متر', 'سانتی‌متر', 'میلی‌لیتر', 'متر مربع', 'متر مکعب', 'دستگاه',
          'kg', 'g', 'meter', 'liter', 'pcs', 'box', 'pack', 'bag', 'ton',
          'mm', 'cm', 'm', 'L', 'ml', 'm2', 'm3', 'unit', 'piece', 'dozen',
        ],
        enumLabels: {
          'عدد': 'عدد',
          'کیلوگرم': 'کیلوگرم',
          'گرم': 'گرم',
          'متر': 'متر',
          'لیتر': 'لیتر',
          'جعبه': 'جعبه',
          'بسته': 'بسته',
          'کیسه': 'کیسه',
          'تن': 'تن',
          'میلی‌متر': 'میلی‌متر',
          'سانتی‌متر': 'سانتی‌متر',
          'میلی‌لیتر': 'میلی‌لیتر',
          'متر مربع': 'متر مربع',
          'متر مکعب': 'متر مکعب',
          'دستگاه': 'دستگاه',
          'kg': 'کیلوگرم',
          'g': 'گرم',
          'meter': 'متر',
          'liter': 'لیتر',
          'pcs': 'عدد',
          'box': 'جعبه',
          'pack': 'بسته',
          'bag': 'کیسه',
          'ton': 'تن',
          'mm': 'میلی‌متر',
          'cm': 'سانتی‌متر',
          'm': 'متر',
          'L': 'لیتر',
          'ml': 'میلی‌لیتر',
          'm2': 'متر مربع',
          'm3': 'متر مکعب',
          'unit': 'عدد',
          'piece': 'عدد',
          'dozen': 'دوجین',
        },
        description: 'واحد اندازه‌گیری',
      },
      {
        id: 'quantity',
        label: 'تعداد',
        type: 'number',
        source: 'quantity',
        aggregatable: true,
        description: 'تعداد فروخته شده',
      },
      {
        id: 'unitPrice',
        label: 'قیمت واحد',
        type: 'currency',
        source: 'unitPrice',
        aggregatable: false,
        description: 'قیمت هر واحد',
      },
      {
        id: 'discountAmount',
        label: 'تخفیف',
        type: 'currency',
        source: 'discountAmount',
        aggregatable: true,
        description: 'مبلغ تخفیف آیتم',
      },
      {
        id: 'taxAmount',
        label: 'مالیات',
        type: 'currency',
        source: 'taxAmount',
        aggregatable: true,
        description: 'مبلغ مالیات آیتم',
      },
      {
        id: 'lineTotal',
        label: 'جمع ردیف',
        type: 'currency',
        source: 'lineTotal',
        aggregatable: true,
        description: 'جمع کل این ردیف',
      },
      {
        id: 'description',
        label: 'توضیحات',
        type: 'string',
        source: 'description',
        description: 'توضیحات آیتم',
      },
      {
        id: 'invoiceNumber',
        label: 'شماره فاکتور',
        type: 'string',
        source: 'invoice.number',
        groupByKey: 'invoiceId',
        description: 'شماره فاکتور مربوطه',
      },
      {
        id: 'invoiceDate',
        label: 'تاریخ فاکتور',
        type: 'datetime',
        source: 'invoice.invoiceDate',
        groupByKey: 'invoiceId',
        description: 'تاریخ فاکتور مربوطه',
      },
        // ★ فیلدهای جدید - رابطه با محصول
      {
        id: 'productCategoryName',
        label: 'دسته‌بندی محصول',
        type: 'string',
        source: 'product.category.name',
        groupByKey: 'productId',
        description: 'نام دسته‌بندی محصول',
      },
      {
        id: 'productPurchasePrice',
        label: 'قیمت خرید محصول',
        type: 'currency',
        source: 'product.purchasePrice',
        groupByKey: 'productId',
        description: 'قیمت خرید محصول از فاکتور خرید',
      },
      {
        id: 'itemProfit',
        label: 'سود آیتم',
        type: 'currency',
        source: 'lineTotal',
        isFormula: true,
        formula: 'lineTotal - (quantity * productPurchasePrice)',
        aggregatable: true,
        description: 'سود = جمع ردیف - (تعداد × قیمت خرید)',
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  //  ۵. پرداخت‌ها
  // ═══════════════════════════════════════════════════════════════
  payments: {
    id: 'payments',
    label: 'پرداخت‌های فاکتور',
    description: 'گزارش پرداخت‌های ثبت شده برای فاکتورها',
    model: 'InvoicePayment',
    icon: 'CreditCard',
    color: 'teal',
    allowGroupBy: true,
    fields: [
      {
        id: 'id',
        label: 'شناسه',
        type: 'string',
        source: 'id',
        description: 'شناسه یکتای پرداخت',
      },
      {
        id: 'amount',
        label: 'مبلغ پرداخت',
        type: 'currency',
        source: 'amount',
        aggregatable: true,
        description: 'مبلغ پرداخت شده',
      },
      {
        id: 'paymentType',
        label: 'نوع پرداخت',
        type: 'enum',
        source: 'paymentType',
        enumValues: ['cash', 'card', 'check', 'credit', 'installment' ,'online'],
        enumLabels: {
          cash: 'نقدی',
          card: 'کارتخوان',
          check: 'چک',
          credit: 'نسیه',
          installment: 'قسطی',
          online:'آنلاین'
        },
        description: 'روش پرداخت',
      },
      {
        id: 'paymentRef',
        label: 'شماره پیگیری',
        type: 'string',
        source: 'paymentRef',
        description: 'شماره پیگیری یا مرجع پرداخت',
      },
            // ★ فیلد شمارشی برای شمارش تعداد پرداخت‌ها
       {
        id: 'paymentCount',
        label: 'تعداد پرداخت',
        type: 'number',
        source: 'amount',
        aggregatable: true,
        description: 'تعداد پرداخت‌ها (با تجمیع تعداد استفاده شود)',
      },
      {
        id: 'paidAt',
        label: 'تاریخ پرداخت',
        type: 'datetime',
        source: 'paidAt',
        description: 'تاریخ و ساعت پرداخت',
      },
      {
        id: 'invoiceNumber',
        label: 'شماره فاکتور',
        type: 'string',
        source: 'invoice.number',
        groupByKey: 'invoiceId',
        description: 'شماره فاکتور مربوطه',
      },
      {
        id: 'customerFirstName',
        label: 'نام مشتری',
        type: 'string',
        source: 'invoice.customer.firstName',
        groupByKey: 'invoiceId',
        description: 'نام مشتری',
      },
    ],
  },
}

// ═══════════════════════════════════════════════════════════════
//  Exported functions
// ═══════════════════════════════════════════════════════════════

/**
 * لیست خلاصه دیتاست‌ها (برای نمایش در پالت)
 */
export function getDatasetSummaries(): DatasetSummary[] {
  return Object.values(DATASETS).map((ds) => ({
    id: ds.id,
    label: ds.label,
    description: ds.description,
    icon: ds.icon,
    color: ds.color,
    fieldsCount: ds.fields.length,
    aggregatableFieldsCount: ds.fields.filter((f) => f.aggregatable).length,
    allowGroupBy: ds.allowGroupBy ?? false,
  }))
}
/**
 * گرفتن تعریف کامل یک دیتاست
 */
export function getDataset(datasetId: string): Dataset | undefined {
  return DATASETS[datasetId]
}

/**
 * گرفتن یک فیلد خاص از یک دیتاست
 */
export function getDatasetField(
  datasetId: string,
  fieldId: string
): import('./report-types').DatasetField | undefined {
  const dataset = DATASETS[datasetId]
  if (!dataset) return undefined
  return dataset.fields.find((f) => f.id === fieldId)
}

/**
 * لیست همه دیتاست‌های موجود
 */
export function getAllDatasetIds(): string[] {
  return Object.keys(DATASETS)
}