/**
 * Offline API — ShopAccounting v5.0
 *
 * توابع API برای استفاده در کامپوننت‌ها
 * تمام درخواست‌ها با هدر Authorization ارسال می‌شوند (توسط fetch-interceptor)
 *
 * فایل: src/lib/offline-api.ts
 */

// ─── تایپ‌ها ───────────────────────────────────────────────

interface FetchProductsParams {
  limit?: number
  search?: string
  categoryId?: string
}

interface FetchCustomersParams {
  limit?: number
  search?: string
}

interface InvoiceItem {
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  discount: number
  taxRate: number
}

interface InvoicePayment {
  amount: number
  paymentType: string
}

interface CreateInvoiceParams {
  customerId?: string
  paymentType: string
  items: InvoiceItem[]
  payments: InvoicePayment[]
  discountAmount: number
  taxAmount: number
}

interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  _offline?: boolean
}

// ─── توابع کمکی ───────────────────────────────────────────

function getTenantId(): string {
  if (typeof window === 'undefined') return ''
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    return user.tenantId || ''
  } catch {
    return ''
  }
}

// ─── محصولات ───────────────────────────────────────────────

export async function fetchProducts(params?: FetchProductsParams): Promise<ApiResponse> {
  try {
    const tenantId = getTenantId()
    const searchParams = new URLSearchParams()
    if (tenantId) searchParams.set('tenantId', tenantId)
    if (params?.limit) searchParams.set('limit', String(params.limit))
    if (params?.search) searchParams.set('search', params.search)
    if (params?.categoryId) searchParams.set('categoryId', params.categoryId)

    const res = await fetch(`/api/products?${searchParams.toString()}`)
    const data = await res.json()
    return data
  } catch (error) {
    console.error('[fetchProducts] Error:', error)
    return { success: false, error: 'خطا در دریافت محصولات' }
  }
}

// ─── مشتریان ───────────────────────────────────────────────

export async function fetchCustomers(params?: FetchCustomersParams): Promise<ApiResponse> {
  try {
    const tenantId = getTenantId()
    const searchParams = new URLSearchParams()
    if (tenantId) searchParams.set('tenantId', tenantId)
    if (params?.limit) searchParams.set('limit', String(params.limit))
    if (params?.search) searchParams.set('search', params.search)

    const res = await fetch(`/api/customers?${searchParams.toString()}`)
    const data = await res.json()
    return data
  } catch (error) {
    console.error('[fetchCustomers] Error:', error)
    return { success: false, error: 'خطا در دریافت مشتریان' }
  }
}

// ─── دسته‌بندی‌ها ───────────────────────────────────────────

export async function fetchCategories(): Promise<ApiResponse> {
  try {
    const tenantId = getTenantId()
    const params = new URLSearchParams()
    if (tenantId) params.set('tenantId', tenantId)

    const res = await fetch(`/api/categories?${params.toString()}`)
    const data = await res.json()
    return data
  } catch (error) {
    console.error('[fetchCategories] Error:', error)
    return { success: false, error: 'خطا در دریافت دسته‌بندی‌ها' }
  }
}

// ─── فاکتورها ───────────────────────────────────────────────

export async function createInvoice(params: CreateInvoiceParams): Promise<ApiResponse> {
  try {
    const tenantId = getTenantId()
    const res = await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...params, tenantId }),
    })
    const data = await res.json()
    return data
  } catch (error) {
    console.error('[createInvoice] Error:', error)
    return { success: false, error: 'خطا در ثبت فاکتور' }
  }
}

export async function fetchInvoices(params?: { limit?: number; status?: string }): Promise<ApiResponse> {
  try {
    const tenantId = getTenantId()
    const searchParams = new URLSearchParams()
    if (tenantId) searchParams.set('tenantId', tenantId)
    if (params?.limit) searchParams.set('limit', String(params.limit))
    if (params?.status) searchParams.set('status', params.status)

    const res = await fetch(`/api/invoices?${searchParams.toString()}`)
    const data = await res.json()
    return data
  } catch (error) {
    console.error('[fetchInvoices] Error:', error)
    return { success: false, error: 'خطا در دریافت فاکتورها' }
  }
}

// ─── اقساط ──────────────────────────────────────────────────

export async function fetchInstallments(params?: { limit?: number }): Promise<ApiResponse> {
  try {
    const tenantId = getTenantId()
    const searchParams = new URLSearchParams()
    if (tenantId) searchParams.set('tenantId', tenantId)
    if (params?.limit) searchParams.set('limit', String(params.limit))

    const res = await fetch(`/api/installments?${searchParams.toString()}`)
    const data = await res.json()
    return data
  } catch (error) {
    console.error('[fetchInstallments] Error:', error)
    return { success: false, error: 'خطا در دریافت اقساط' }
  }
}

// ─── حسابداری ───────────────────────────────────────────────

export async function fetchJournalEntries(params?: { limit?: number }): Promise<ApiResponse> {
  try {
    const tenantId = getTenantId()
    const searchParams = new URLSearchParams()
    if (tenantId) searchParams.set('tenantId', tenantId)
    if (params?.limit) searchParams.set('limit', String(params.limit))

    const res = await fetch(`/api/journal-entries?${searchParams.toString()}`)
    const data = await res.json()
    return data
  } catch (error) {
    console.error('[fetchJournalEntries] Error:', error)
    return { success: false, error: 'خطا در دریافت اسناد حسابداری' }
  }
}

// ─── گزارشات ────────────────────────────────────────────────

export async function fetchReports(type: string): Promise<ApiResponse> {
  try {
    const tenantId = getTenantId()
    const searchParams = new URLSearchParams()
    if (tenantId) searchParams.set('tenantId', tenantId)
    searchParams.set('type', type)

    const res = await fetch(`/api/reports?${searchParams.toString()}`)
    const data = await res.json()
    return data
  } catch (error) {
    console.error('[fetchReports] Error:', error)
    return { success: false, error: 'خطا در دریافت گزارشات' }
  }
}
