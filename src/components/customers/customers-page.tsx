'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Users,
  Plus,
  Search,
  Pencil,
  Trash2,
  WifiOff,
  Loader2,
  CheckCircle2,
  Phone,
  Wallet,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

// ─── Types ────────────────────────────────────────────────────

interface Customer {
  id: string
  code: string
  firstName: string
  lastName: string
  mobile: string | null
  nationalCode: string | null
  address: string | null
  creditLimit: number
  currentBalance: number
  isBlacklisted: boolean
  _isOffline?: boolean
}

interface CustomerFormData {
  firstName: string
  lastName: string
  mobile: string
  nationalCode: string
  address: string
  creditLimit: string
}

const emptyForm: CustomerFormData = {
  firstName: '',
  lastName: '',
  mobile: '',
  nationalCode: '',
  address: '',
  creditLimit: '',
}

// ─── Helpers ──────────────────────────────────────────────────

function getTenantIdFromStore(): string {
  const state = useAppStore.getState()
  const ct = state.currentTenant
  if (ct && typeof ct === 'object' && ct.id) return ct.id
  if (ct && typeof ct === 'string') return ct
  if (state.tenantId) return state.tenantId
  if (state.user?.tenantId) return state.user.tenantId
  return ''
}

function formatPrice(price: number): string {
  return price.toLocaleString('fa-IR')
}

// ─── Main Component ───────────────────────────────────────────

export default function CustomersPage() {
  const { toast } = useToast()

  // Store
  const isOnline = useAppStore((s) => s.isOnline)
  const currentTenant = useAppStore((s) => s.currentTenant)

  // Data
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Search
  const [searchQuery, setSearchQuery] = useState('')

  // Add/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [form, setForm] = useState<CustomerFormData>(emptyForm)

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null)

  // ─── Load Customers ───────────────────────────────────────

  const loadCustomers = useCallback(async () => {
    setLoading(true)
    try {
      const tid = getTenantIdFromStore()
      if (!tid) {
        setCustomers([])
        setLoading(false)
        return
      }

      const params = new URLSearchParams({
        tenantId: tid,
        limit: '9999',
      })

      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim())
      }

      const res = await fetch(`/api/customers?${params.toString()}`)
      const data = await res.json()

      if (data.success && data.data) {
        const list = data.data.customers || data.data
        setCustomers(Array.isArray(list) ? list : [])
      } else {
        setCustomers([])
      }
    } catch (error) {
      console.error('Error loading customers:', error)
      setCustomers([])
    }
    setLoading(false)
  }, [searchQuery])

  useEffect(() => {
    loadCustomers()
  }, [loadCustomers])

  // ─── Filtered Customers (client-side fallback) ────────────

  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return customers
    const q = searchQuery.trim().toLowerCase()
    return customers.filter(
      (c) =>
        c.firstName.toLowerCase().includes(q) ||
        c.lastName.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        (c.mobile && c.mobile.includes(q)) ||
        (c.nationalCode && c.nationalCode.includes(q))
    )
  }, [customers, searchQuery])

  // ─── Stats ────────────────────────────────────────────────

  const totalCustomers = customers.length
  const blacklistedCount = customers.filter((c) => c.isBlacklisted).length
  const totalDebt = customers.reduce((sum, c) => sum + (c.currentBalance > 0 ? c.currentBalance : 0), 0)

  // ─── Open Add Dialog ──────────────────────────────────────

  const handleOpenAdd = useCallback(() => {
    setEditingCustomer(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }, [])

  // ─── Open Edit Dialog ─────────────────────────────────────

  const handleOpenEdit = useCallback((customer: Customer) => {
    setEditingCustomer(customer)
    setForm({
      firstName: customer.firstName || '',
      lastName: customer.lastName || '',
      mobile: customer.mobile || '',
      nationalCode: customer.nationalCode || '',
      address: customer.address || '',
      creditLimit: customer.creditLimit ? String(customer.creditLimit) : '',
    })
    setDialogOpen(true)
  }, [])

  // ─── Submit (Add/Edit) ────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!form.firstName.trim()) {
      toast({
        title: 'خطا',
        description: 'نام مشتری الزامی است',
        variant: 'destructive',
      })
      return
    }

    setSubmitting(true)
    try {
      const tid = getTenantIdFromStore()
      if (!tid) {
        toast({ title: 'خطا', description: 'خطا در ارتباط با سرور', variant: 'destructive' })
        setSubmitting(false)
        return
      }

      const body: Record<string, unknown> = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        mobile: form.mobile.trim() || null,
        nationalCode: form.nationalCode.trim() || null,
        address: form.address.trim() || null,
        creditLimit: form.creditLimit ? Number(form.creditLimit) : 0,
        tenantId: tid,
      }

      let res: Response

      if (editingCustomer) {
        body.id = editingCustomer.id
        res = await fetch('/api/customers', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      } else {
        res = await fetch('/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }

      const data = await res.json()

      if (data.success) {
        toast({
          title: editingCustomer ? 'مشتری ویرایش شد' : 'مشتری جدید اضافه شد',
          description: editingCustomer
            ? 'اطلاعات مشتری با موفقیت به‌روزرسانی شد'
            : 'مشتری جدید با موفقیت به فروشگاه اضافه شد',
        })
        setDialogOpen(false)
        setForm(emptyForm)
        setEditingCustomer(null)
        loadCustomers()
      } else {
        toast({
          title: 'خطا',
          description: data.error || 'خطا در ارتباط با سرور',
          variant: 'destructive',
        })
      }
    } catch (error) {
      toast({
        title: 'خطا',
        description: 'خطا در ارتباط با سرور',
        variant: 'destructive',
      })
    }
    setSubmitting(false)
  }, [form, editingCustomer, loadCustomers, toast])

  // ─── Open Delete Dialog ───────────────────────────────────

  const handleOpenDelete = useCallback((customer: Customer) => {
    setDeletingCustomer(customer)
    setDeleteDialogOpen(true)
  }, [])

  // ─── Confirm Delete ───────────────────────────────────────

  const handleConfirmDelete = useCallback(async () => {
    if (!deletingCustomer) return

    setSubmitting(true)
    try {
      const tid = getTenantIdFromStore()
      if (!tid) {
        toast({ title: 'خطا', description: 'خطا در ارتباط با سرور', variant: 'destructive' })
        setSubmitting(false)
        return
      }

      const res = await fetch(`/api/customers?id=${deletingCustomer.id}&tenantId=${tid}`, {
        method: 'DELETE',
      })

      const data = await res.json()

      if (data.success) {
        toast({ title: 'مشتری حذف شد', description: 'مشتری با موفقیت حذف شد' })
        setDeleteDialogOpen(false)
        setDeletingCustomer(null)
        loadCustomers()
      } else {
        toast({
          title: 'خطا',
          description: data.error || 'خطا در حذف مشتری',
          variant: 'destructive',
        })
      }
    } catch (error) {
      toast({
        title: 'خطا',
        description: 'خطا در ارتباط با سرور',
        variant: 'destructive',
      })
    }
    setSubmitting(false)
  }, [deletingCustomer, loadCustomers, toast])

  // ─── Form field updater ───────────────────────────────────

  const updateField = useCallback((field: keyof CustomerFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }, [])

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-gray-50/80" dir="rtl">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-3 sm:px-6 py-3 sm:py-4 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-blue-600 text-white">
              <Users className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-gray-900">مشتریان</h1>
              <p className="text-xs sm:text-sm text-gray-500">
                مدیریت مشتریان فروشگاه
                {currentTenant?.companyName && ` — ${currentTenant.companyName}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isOnline && (
              <Badge variant="outline" className="gap-1 text-xs border-amber-300 text-amber-700 bg-amber-50">
                <WifiOff className="w-3 h-3" />
                آفلاین
              </Badge>
            )}
            <Button
              onClick={handleOpenAdd}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm shadow-sm"
            >
              <Plus className="w-4 h-4 ml-1.5" />
              افزودن مشتری
            </Button>
          </div>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="px-3 sm:px-6 py-3 sm:py-4 shrink-0">
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-3 sm:p-4 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600" />
                <span className="text-[10px] sm:text-xs text-gray-500">کل مشتریان</span>
              </div>
              <p className="text-lg sm:text-2xl font-black text-gray-900">
                {formatPrice(totalCustomers)}
              </p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-3 sm:p-4 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Wallet className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-500" />
                <span className="text-[10px] sm:text-xs text-gray-500">بدهکاران</span>
              </div>
              <p className="text-lg sm:text-2xl font-black text-red-600">
                {formatPrice(blacklistedCount)}
              </p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-3 sm:p-4 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <span className="text-[10px] sm:text-xs text-gray-500">کل بدهی</span>
              </div>
              <p className="text-sm sm:text-lg font-black text-orange-600">
                {formatPrice(totalDebt)} <span className="text-[9px] sm:text-xs font-normal text-gray-400">ریال</span>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 sm:px-6 pb-3 sm:pb-4 shrink-0">
        <div className="relative max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            type="text"
            placeholder="جستجوی مشتری..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-10 h-9 sm:h-10 bg-white border-gray-200 focus:border-blue-400 focus:ring-blue-400/20 text-xs sm:text-sm"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-3 sm:px-6 pb-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <Loader2 className="w-8 h-10 animate-spin text-blue-600 mb-3" />
                <p className="text-sm font-medium">در حال بارگذاری</p>
              </div>
            ) : filteredCustomers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <Users className="w-12 h-12 mb-3 opacity-40" />
                <p className="text-sm font-medium">مشتری یافت نشد</p>
                <p className="text-xs mt-1 text-gray-300">با دکمه «افزودن مشتری» مشتری جدید اضافه کنید</p>
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                        <TableHead className="text-xs font-bold text-gray-600 text-right">کد</TableHead>
                        <TableHead className="text-xs font-bold text-gray-600 text-right">نام</TableHead>
                        <TableHead className="text-xs font-bold text-gray-600 text-right">موبایل</TableHead>
                        <TableHead className="text-xs font-bold text-gray-600 text-right">موجودی</TableHead>
                        <TableHead className="text-xs font-bold text-gray-600 text-right">وضعیت</TableHead>
                        <TableHead className="text-xs font-bold text-gray-600 text-center">عملیات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCustomers.map((customer) => (
                        <TableRow key={customer.id} className="hover:bg-blue-50/40 transition-colors">
                          <TableCell className="text-xs font-mono text-gray-500">
                            {customer.code || '—'}
                          </TableCell>
                          <TableCell className="text-sm font-medium text-gray-900">
                            <div>
                              {customer.firstName} {customer.lastName}
                            </div>
                            {customer._isOffline && (
                              <Badge variant="outline" className="mt-1 text-[9px] border-amber-300 text-amber-600 bg-amber-50">
                                آفلاین
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-gray-600">
                            {customer.mobile ? (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3 text-gray-400" />
                                {customer.mobile}
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {customer.currentBalance > 0 ? (
                              <span className="flex items-center gap-1 text-red-600 font-bold">
                                <Wallet className="w-3 h-3" />
                                بدهی: {formatPrice(customer.currentBalance)}
                              </span>
                            ) : (
                              <Badge variant="outline" className="text-[10px] border-emerald-200 text-emerald-700 bg-emerald-50">
                                بدون بدهی
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {customer.isBlacklisted ? (
                              <Badge variant="outline" className="text-[10px] border-red-200 text-red-600 bg-red-50">
                                لیست سیاه
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] border-emerald-200 text-emerald-700 bg-emerald-50">
                                فعال
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                onClick={() => handleOpenEdit(customer)}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => handleOpenDelete(customer)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden divide-y divide-gray-100">
                  {filteredCustomers.map((customer) => (
                    <div key={customer.id} className="p-3 hover:bg-gray-50/60 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-sm font-bold text-gray-900 truncate">
                              {customer.firstName} {customer.lastName}
                            </h3>
                            {customer.isBlacklisted ? (
                              <Badge variant="outline" className="text-[9px] border-red-200 text-red-600 bg-red-50 shrink-0">
                                لیست سیاه
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px] border-emerald-200 text-emerald-700 bg-emerald-50 shrink-0">
                                فعال
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-gray-500">
                            {customer.code && <span className="font-mono">کد: {customer.code}</span>}
                            {customer.mobile && (
                              <span className="flex items-center gap-0.5">
                                <Phone className="w-2.5 h-2.5" />
                                {customer.mobile}
                              </span>
                            )}
                          </div>
                          <div className="mt-1.5">
                            {customer.currentBalance > 0 ? (
                              <span className="flex items-center gap-1 text-xs text-red-600 font-bold">
                                <Wallet className="w-3 h-3" />
                                بدهی: {formatPrice(customer.currentBalance)} ریال
                              </span>
                            ) : (
                              <span className="text-[10px] text-emerald-600">بدون بدهی</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-blue-600 hover:bg-blue-50"
                            onClick={() => handleOpenEdit(customer)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-600 hover:bg-red-50"
                            onClick={() => handleOpenDelete(customer)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px] w-[calc(100%-2rem)]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-700 text-sm sm:text-base">
              {editingCustomer ? (
                <>
                  <Pencil className="w-4 h-4 sm:w-5 sm:h-5" />
                  ویرایش مشتری
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                  افزودن مشتری جدید
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {editingCustomer
                ? 'اطلاعات مشتری را ویرایش کنید'
                : 'مشتری جدید به فروشگاه اضافه کنید'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 sm:space-y-4 py-2 sm:py-3">
            {/* First Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700">
                نام <span className="text-red-500">*</span>
              </label>
              <Input
                value={form.firstName}
                onChange={(e) => updateField('firstName', e.target.value)}
                placeholder="نام مشتری"
                className="h-9 sm:h-10 text-sm border-gray-200 focus:border-blue-400 focus:ring-blue-400/20"
              />
            </div>

            {/* Last Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700">نام خانوادگی</label>
              <Input
                value={form.lastName}
                onChange={(e) => updateField('lastName', e.target.value)}
                placeholder="نام خانوادگی (اختیاری)"
                className="h-9 sm:h-10 text-sm border-gray-200 focus:border-blue-400 focus:ring-blue-400/20"
              />
            </div>

            {/* Mobile */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700">موبایل</label>
              <Input
                value={form.mobile}
                onChange={(e) => updateField('mobile', e.target.value)}
                placeholder="شماره موبایل (اختیاری)"
                className="h-9 sm:h-10 text-sm border-gray-200 focus:border-blue-400 focus:ring-blue-400/20"
                dir="ltr"
              />
            </div>

            {/* National Code */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700">کد ملی</label>
              <Input
                value={form.nationalCode}
                onChange={(e) => updateField('nationalCode', e.target.value)}
                placeholder="کد ملی (اختیاری)"
                className="h-9 sm:h-10 text-sm border-gray-200 focus:border-blue-400 focus:ring-blue-400/20"
                dir="ltr"
              />
            </div>

            {/* Credit Limit */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700">سقف اعتبار (ریال)</label>
              <Input
                type="number"
                value={form.creditLimit}
                onChange={(e) => updateField('creditLimit', e.target.value)}
                placeholder="محدودیت اعتبار (اختیاری)"
                className="h-9 sm:h-10 text-sm border-gray-200 focus:border-blue-400 focus:ring-blue-400/20"
                dir="ltr"
              />
            </div>

            {/* Address */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700">آدرس</label>
              <Input
                value={form.address}
                onChange={(e) => updateField('address', e.target.value)}
                placeholder="آدرس (اختیاری)"
                className="h-9 sm:h-10 text-sm border-gray-200 focus:border-blue-400 focus:ring-blue-400/20"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
              className="border-gray-300 text-xs sm:text-sm h-9 sm:h-10"
            >
              انصراف
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm h-9 sm:h-10"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : editingCustomer ? (
                <>
                  <CheckCircle2 className="w-4 h-4 ml-1.5" />
                  ذخیره تغییرات
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 ml-1.5" />
                  ذخیره
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700 text-sm sm:text-base">
              <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
              حذف مشتری
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs sm:text-sm">
              آیا از حذف مشتری اطمینان دارید؟ این عمل قابل بازگشت نیست.
              {deletingCustomer && (
                <span className="block mt-2 font-bold text-gray-700">
                  {deletingCustomer.firstName} {deletingCustomer.lastName}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel disabled={submitting} className="text-xs sm:text-sm">
              انصراف
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={submitting}
              className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs sm:text-sm"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'حذف مشتری'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
