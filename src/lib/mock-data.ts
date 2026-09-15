/**
 * Mock Data — ShopAccounting v3.18 (Cleaned)
 *
 * ★★★ v3.18: حذف پلن‌های قدیمی (آزمایشی، خرید کامل)
 *   فقط ۳ پلن باقی مونده: simple, professional, enterprise
 *
 * داده‌های نمونه برای صفحاتی که هنوز وصل به API واقعی نشدن
 * (در آینده این فایل باید کاملاً حذف بشه)
 */

// ═══════════════════════════════════════════════════════════════
// تایپ‌ها (حفظ برای backward compatibility)
// ═══════════════════════════════════════════════════════════════

export interface Account {
  id: string
  code: string
  name: string
  // ★★★ v3.25: type به string ساده تغییر یافت تا با API واقعی (lowercase: cash, bank, ...)
  // و backward compatibility (uppercase: ASSET, LIABILITY, ...) هماهنگ باشد
  // Prisma schema این فیلد را به صورت String ذخیره می‌کند (بدون enum)
  type: string
  parentId: string | null
  isActive: boolean
  balance: number
}

export interface JournalEntry {
  id: string
  entryNumber: string
  number?: string
  date: string
  entryDate?: string
  description: string
  totalDebit: number
  totalCredit: number
  status: 'DRAFT' | 'POSTED' | 'CANCELLED' | string
  isPosted?: boolean // ← این خط را اضافه کنید
  entryType?: string
  referenceType?: string
  referenceId?: string
  sourceType?: string
  isManual?: boolean
  items: {
    accountId: string
    accountName: string
    accountCode?: string
    debit: number
    credit: number
  }[]
  lines?: any[]
}

export interface DashboardStats {
  todaySales: number
  todayInvoices: number
  monthSales: number
  monthInvoices: number
  overdueInstallments: number
  totalReceivable: number
  lowStockProducts: number
  monthlySales: number
  monthlyProfit: number
}

export interface DailySale {
  date: string
  sales: number
}

export interface CategorySale {
  name: string
  value: number
}

export interface MockProduct {
  id: string
  code: string
  barcode: string | null
  name: string
  categoryId: string | null
  categoryName: string | null
  category: string
  purchasePrice: number
  salePrice: number
  taxRate: number
  currentStock: number
  minStock: number
  unit: string
  isActive: boolean
}

export interface MockInvoice {
  id: string
  number: string
  invoiceNumber?: string
  invoiceDate: string
  date?: string
  customerName: string
  customerId?: string
  totalAmount: number
  paidAmount?: number
  remainingAmount?: number
  paymentType: string
  status: string
  paymentStatus?: string
  subTotal?: number
  discountAmount?: number
  taxAmount?: number
  items: any[]
  payments?: any[]
  installmentPlan?: any
  cashierName?: string
  createdAt?: string
  updatedAt?: string
}

export interface InstallmentPlan {
  id: string
  invoiceId: string
  invoiceNumber: string
  customerId: string
  customerName: string
  totalAmount: number
  paidAmount: number
  remainingAmount: number
  monthlyPayment: number
  totalInstallments: number
  numberOfInstallments: number
  intervalDays: number
  paidInstallments: number
  status: 'ACTIVE' | 'COMPLETED' | 'OVERDUE' | 'CANCELLED' | string
  startDate: string
  nextDueDate: string
  installments?: Installment[]
  paidCount?: number
  overdueCount?: number
  progressPct?: number
  totalInstallments_count?: number
  downPayment?: number
  interestRate?: number
  totalWithInterest?: number
  installmentAmount?: number
  installmentPeriod?: string
  description?: string
  createdAt?: string
  updatedAt?: string
}

export interface Installment {
  id: string
  planId: string
  installmentNumber: number
  amount: number
  dueDate: string
  paidDate: string | null
  paidAt?: string | null
  paidAmount?: number
  paymentRef?: string | null
  notes?: string | null
  status: 'PENDING' | 'Pending' | 'PAID' | 'Paid' | 'OVERDUE' | 'Overdue' | string
}

export interface MockCustomer {
  id: string
  code: string
  firstName: string
  lastName: string
  mobile: string | null
  currentBalance: number
  isBlacklisted: boolean
  creditLimit?: number
  address?: string | null
  nationalCode?: string | null
  lastPurchaseAt?: string | null
}

export interface MockStoreUser {
  id: string
  username: string
  role: string
  isActive: boolean
  createdAt: string
}

// ═══════════════════════════════════════════════════════════════
// ★★★ v3.18: فقط ۳ پلن واقعی (حذف آزمایشی و خرید کامل)
// ═══════════════════════════════════════════════════════════════

export const mockPlans = [
  {
    id: 'simple',
    nameFa: 'ساده',
    nameEn: 'Simple',
    price: 390000,
    durationDays: 30,
    maxUsers: 2,
    maxProducts: 200,
    maxInvoices: 500,
    features: ['فروش نقدی', 'گزارش ساده', 'چاپ فاکتور', 'پشتیبان‌گیری'],
  },
  {
    id: 'professional',
    nameFa: 'حرفه‌ای',
    nameEn: 'Professional',
    price: 790000,
    durationDays: 30,
    maxUsers: 5,
    maxProducts: 2000,
    maxInvoices: 0,
    features: ['تمام قابلیت‌های ساده', 'فروش نسیه/قسطی', 'چارت حساب‌ها', 'سند دستی', 'تراز آزمایشی', 'مدیریت اقساط'],
  },
  {
    id: 'enterprise',
    nameFa: 'سازمانی',
    nameEn: 'Enterprise',
    price: 1090000,
    durationDays: 30,
    maxUsers: 0,
    maxProducts: 0,
    maxInvoices: 0,
    features: ['تمام قابلیت‌های حرفه‌ای', 'حسابداری شعب', 'گزارش تلفیقی', 'بستن سال مالی', 'اتصال مودیان', 'چند صندوق'],
  },
]

// ═══════════════════════════════════════════════════════════════
// داده‌های نمونه (فقط برای backward compatibility)
// ═══════════════════════════════════════════════════════════════

export const mockAccounts: Account[] = [
  { id: 'acc-1', code: '1000', name: 'صندوق', type: 'ASSET', parentId: null, isActive: true, balance: 0 },
  { id: 'acc-2', code: '1100', name: 'بانک', type: 'ASSET', parentId: null, isActive: true, balance: 0 },
  { id: 'acc-3', code: '1200', name: 'حساب‌های دریافتنی', type: 'ASSET', parentId: null, isActive: true, balance: 0 },
  { id: 'acc-4', code: '1300', name: 'موجودی کالا', type: 'ASSET', parentId: null, isActive: true, balance: 0 },
  { id: 'acc-5', code: '2000', name: 'حساب‌های پرداختنی', type: 'LIABILITY', parentId: null, isActive: true, balance: 0 },
  { id: 'acc-6', code: '3000', name: 'سرمایه', type: 'EQUITY', parentId: null, isActive: true, balance: 0 },
  { id: 'acc-7', code: '3100', name: 'سود انباشته', type: 'EQUITY', parentId: null, isActive: true, balance: 0 },
  { id: 'acc-8', code: '4000', name: 'فروش', type: 'REVENUE', parentId: null, isActive: true, balance: 0 },
  { id: 'acc-9', code: '5000', name: 'بهای تمام‌شده کالا', type: 'EXPENSE', parentId: null, isActive: true, balance: 0 },
  { id: 'acc-10', code: '5100', name: 'هزینه‌های اداری', type: 'EXPENSE', parentId: null, isActive: true, balance: 0 },
]

// ★★★ v3.18: mockJournalEntries خالی شد — دیگر نباید استفاده بشه
// ★★★ داده‌های نمونه برای تست حالت آفلاین
export const mockJournalEntries: JournalEntry[] = [
  {
    id: 'mock-offline-1',
    entryNumber: 'JV-1403-001',
    number: 'JV-1403-001',
    date: new Date().toISOString(),
    entryDate: new Date().toISOString(),
    description: 'سند نمونه تست حالت آفلاین - پرداخت هزینه',
    totalDebit: 2500000,
    totalCredit: 2500000,
    status: 'POSTED',
    isPosted: true,
    sourceType: 'manual',
    isManual: true,
    items: [
      { accountId: 'acc-10', accountName: 'هزینه‌های اداری', accountCode: '5100', debit: 2500000, credit: 0 },
      { accountId: 'acc-1', accountName: 'صندوق', accountCode: '1000', debit: 0, credit: 2500000 },
    ],
    lines: [
      { accountId: 'acc-10', accountName: 'هزینه‌های اداری', accountCode: '5100', debit: 2500000, credit: 0 },
      { accountId: 'acc-1', accountName: 'صندوق', accountCode: '1000', debit: 0, credit: 2500000 },
    ]
  }
]
export const mockDashboardStats: DashboardStats = {
  todaySales: 0,
  todayInvoices: 0,
  monthSales: 0,
  monthInvoices: 0,
  overdueInstallments: 0,
  totalReceivable: 0,
  lowStockProducts: 0,
  monthlySales: 0,
  monthlyProfit: 0,
}

export const mockDailySales: DailySale[] = []
export const mockCategorySales: CategorySale[] = []
export const mockProducts: MockProduct[] = []
export const mockInvoices: MockInvoice[] = []
export const mockInstallmentPlans: InstallmentPlan[] = []
export const mockCustomers: MockCustomer[] = []
export const mockStoreUsers: MockStoreUser[] = []
