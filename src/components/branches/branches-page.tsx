'use client'

// ============================================================================
// src/components/branches/branches-page.tsx
// ShopAccounting v7.2 — Branches Management Page (مدیریت حرفه‌ای شعب)
// ============================================================================
// ★★★ بهبودها:
//   ★ افزودن نوار جستجو (بر اساس نام یا کد)
//   ★ افزودن نمای کارت ریسپانسیو برای موبایل
//   ★ استفاده از کامپوننت Switch به جای چک‌باکس خام
//   ★ فارسی‌سازی کامل تمام اعداد (تعداد انبار، تلفن و ...)
//   ★ بهبود پیام‌های خطا و هشدار هنگام حذف
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Building2, Plus, Loader2, Trash2, Edit2, Package, Phone, MapPin, User, 
  AlertTriangle, CheckCircle2, Search, Store, X
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

// ============================================================================
//  Types
// ============================================================================

interface Branch {
  id: string
  name: string
  code: string
  address: string | null
  phone: string | null
  manager: string | null
  isActive: boolean
  warehouseCount: number
  createdAt: string
}

// ============================================================================
//  Helpers
// ============================================================================

const toFa = (n: number | string | null | undefined) => {
  if (n === null || n === undefined) return '—'
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)])
}

const formatNumber = (n: number) => (n || 0).toLocaleString('fa-IR')

function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const token = localStorage.getItem('token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

// ============================================================================
//  Main Component
// ============================================================================

export function BranchesPage() {
  const { toast } = useToast()
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // ★ مودال ایجاد/ویرایش
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null)
  const [formName, setFormName] = useState('')
  const [formCode, setFormCode] = useState('')
  const [formAddress, setFormAddress] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formManager, setFormManager] = useState('')
  const [formIsActive, setFormIsActive] = useState(true)

  // ★ مودال حذف
  const [deletingBranch, setDeletingBranch] = useState<Branch | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/branches', { headers: getAuthHeaders() })
      const data = await res.json()
      const branchesData = data?.data || data?.branches || data || []
      setBranches(Array.isArray(branchesData) ? branchesData : [])
    } catch (err: any) {
      console.error('Error loading branches:', err)
      toast({ title: 'خطا', description: 'خطا در بارگذاری لیست شعب', variant: 'destructive' })
      setBranches([])
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { loadData() }, [loadData])

  // ★ فیلتر جستجو
  const filteredBranches = useMemo(() => {
    if (!searchQuery.trim()) return branches
    const q = searchQuery.trim().toLowerCase()
    return branches.filter(
      (b) => b.name.toLowerCase().includes(q) || b.code.toLowerCase().includes(q)
    )
  }, [branches, searchQuery])

  // ★ باز کردن مودال ایجاد
  const openCreateDialog = () => {
    setEditingBranch(null)
    setFormName('')
    setFormCode('')
    setFormAddress('')
    setFormPhone('')
    setFormManager('')
    setFormIsActive(true)
    setDialogOpen(true)
  }

  // ★ باز کردن مودال ویرایش
  const openEditDialog = (branch: Branch) => {
    setEditingBranch(branch)
    setFormName(branch.name)
    setFormCode(branch.code)
    setFormAddress(branch.address || '')
    setFormPhone(branch.phone || '')
    setFormManager(branch.manager || '')
    setFormIsActive(branch.isActive)
    setDialogOpen(true)
  }

  // ★ ذخیره (ایجاد یا ویرایش)
  const handleSave = async () => {
    if (!formName.trim()) {
      toast({ title: 'خطا', description: 'نام شعبه الزامی است', variant: 'destructive' })
      return
    }

    setSubmitting(true)
    try {
      const body: any = {
        name: formName.trim(),
        code: formCode.trim() || undefined,
        address: formAddress.trim() || null,
        phone: formPhone.trim() || null,
        manager: formManager.trim() || null,
        isActive: formIsActive,
      }

      let res: Response
      if (editingBranch) {
        res = await fetch('/api/branches', {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({ id: editingBranch.id, ...body }),
        })
      } else {
        res = await fetch('/api/branches', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(body),
        })
      }

      const data = await res.json()
      if (data.success) {
        toast({ title: 'موفق', description: data.message || 'عملیات با موفقیت انجام شد' })
        setDialogOpen(false)
        loadData()
      } else {
        toast({ title: 'خطا', description: data.error || 'خطای ناشناخته', variant: 'destructive' })
      }
    } catch (err: any) {
      toast({ title: 'خطا', description: err?.message || 'خطا در ارتباط با سرور', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  // ★ حذف شعبه
  const handleDelete = async () => {
    if (!deletingBranch) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/branches?id=${deletingBranch.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: 'موفق', description: data.message || 'شعبه با موفقیت حذف شد' })
        setDeletingBranch(null)
        loadData()
      } else {
        toast({ title: 'خطا', description: data.error || 'خطا در حذف شعبه', variant: 'destructive' })
      }
    } catch (err: any) {
      toast({ title: 'خطا', description: err?.message || 'خطا در ارتباط با سرور', variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  Render
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="space-y-4 p-3 sm:p-6" dir="rtl">
      {/* ★ Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">مدیریت شعب</h1>
            <p className="text-xs text-gray-500">{formatNumber(branches.length)} شعبه ثبت شده در سیستم</p>
          </div>
        </div>
        <Button onClick={openCreateDialog} className="gap-1.5 bg-purple-600 hover:bg-purple-700 text-white shrink-0">
          <Plus className="w-4 h-4" />
          شعبه جدید
        </Button>
      </div>

      {/* ★ Toolbar: Search */}
      {branches.length > 0 && (
        <Card className="border-gray-200">
          <CardContent className="p-3">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="جستجو بر اساس نام یا کد شعبه..."
                className="pr-9 text-xs h-9"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ★ لیست شعب */}
      <Card className="border-gray-200">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
              <p className="text-sm text-gray-500">در حال بارگذاری شعب...</p>
            </div>
          ) : filteredBranches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-3">
              <Store className="w-12 h-12 text-gray-300" />
              <p className="text-sm font-medium">
                {searchQuery ? 'شعبه‌ای با این مشخصات یافت نشد' : 'هنوز شعبه‌ای ثبت نشده است'}
              </p>
              {!searchQuery && (
                <Button onClick={openCreateDialog} variant="outline" className="mt-2 text-xs gap-1">
                  <Plus className="w-3 h-3" />
                  ایجاد اولین شعبه
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* ═══════════════════════════════════════════════════════
                  نمای دسکتاپ (جدول)
              ═══════════════════════════════════════════════════════ */}
              <div className="hidden lg:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="text-right text-xs">نام شعبه</TableHead>
                      <TableHead className="text-center text-xs">کد</TableHead>
                      <TableHead className="text-right text-xs">مدیر</TableHead>
                      <TableHead className="text-right text-xs">تلفن</TableHead>
                      <TableHead className="text-center text-xs">انبارها</TableHead>
                      <TableHead className="text-center text-xs">وضعیت</TableHead>
                      <TableHead className="text-center text-xs w-24">عملیات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBranches.map((branch) => (
                      <TableRow key={branch.id} className="hover:bg-purple-50/30 transition-colors">
                        <TableCell className="py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                              <Building2 className="w-4 h-4 text-purple-600" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-gray-800 text-sm truncate">{branch.name}</div>
                              {branch.address && (
                                <div className="text-[10px] text-gray-400 flex items-center gap-1 mt-0.5 truncate">
                                  <MapPin className="w-3 h-3 shrink-0" />
                                  {branch.address}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-xs font-mono text-gray-600" dir="ltr">
                          {toFa(branch.code)}
                        </TableCell>
                        <TableCell className="text-xs text-gray-600">
                          {branch.manager ? (
                            <span className="flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              <span className="truncate">{branch.manager}</span>
                            </span>
                          ) : <span className="text-gray-400">—</span>}
                        </TableCell>
                        <TableCell className="text-xs text-gray-600" dir="ltr">
                          {branch.phone ? toFa(branch.phone) : <span className="text-gray-400">—</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200 gap-1">
                            <Package className="w-3 h-3" />
                            {toFa(branch.warehouseCount)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={`text-[10px] gap-1 ${
                            branch.isActive
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-gray-50 text-gray-500 border-gray-200'
                          }`}>
                            {branch.isActive ? <CheckCircle2 className="w-3 h-3" /> : <X className="w-3 h-3" />}
                            {branch.isActive ? 'فعال' : 'غیرفعال'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEditDialog(branch)} className="h-8 w-8 p-0" title="ویرایش">
                              <Edit2 className="w-4 h-4 text-blue-600" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setDeletingBranch(branch)} className="h-8 w-8 p-0" title="حذف">
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* ═══════════════════════════════════════════════════════
                  نمای موبایل (کارت‌ها)
              ═══════════════════════════════════════════════════════ */}
              <div className="lg:hidden space-y-3 p-3">
                {filteredBranches.map((branch) => (
                  <Card key={branch.id} className="border-gray-200">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                            <Building2 className="w-4 h-4 text-purple-600" />
                          </div>
                          <div>
                            <div className="font-bold text-gray-800 text-sm">{branch.name}</div>
                            <div className="text-[10px] text-gray-500 font-mono mt-0.5" dir="ltr">کد: {toFa(branch.code)}</div>
                          </div>
                        </div>
                        <Badge variant="outline" className={`text-[10px] ${
                          branch.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-500'
                        }`}>
                          {branch.isActive ? 'فعال' : 'غیرفعال'}
                        </Badge>
                      </div>

                      <div className="space-y-2 text-xs text-gray-600 mb-3">
                        {branch.manager && (
                          <div className="flex items-center gap-2">
                            <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span>مدیر: {branch.manager}</span>
                          </div>
                        )}
                        {branch.phone && (
                          <div className="flex items-center gap-2" dir="ltr">
                            <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span>{toFa(branch.phone)}</span>
                          </div>
                        )}
                        {branch.address && (
                          <div className="flex items-start gap-2">
                            <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                            <span className="line-clamp-2">{branch.address}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 pt-1">
                          <Package className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span className="text-blue-700 font-medium">{toFa(branch.warehouseCount)} انبار متصل</span>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2 border-t border-gray-100">
                        <Button size="sm" variant="outline" className="flex-1 text-xs h-9" onClick={() => openEditDialog(branch)}>
                          <Edit2 className="w-3.5 h-3.5 ml-1.5 text-blue-600" />
                          ویرایش
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1 text-xs h-9 text-red-600 border-red-200 hover:bg-red-50" onClick={() => setDeletingBranch(branch)}>
                          <Trash2 className="w-3.5 h-3.5 ml-1.5" />
                          حذف
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ★ مودال ایجاد/ویرایش */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Building2 className="w-5 h-5 text-purple-600" />
              {editingBranch ? 'ویرایش شعبه' : 'ایجاد شعبه جدید'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {editingBranch ? `ویرایش اطلاعات شعبه «${editingBranch.name}»` : 'اطلاعات پایه شعبه جدید را وارد کنید'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs">نام شعبه <span className="text-red-500">*</span></Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="مثلاً: شعبه مرکزی تهران"
                className="mt-1.5 h-9"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">کد شعبه</Label>
                <Input
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value)}
                  placeholder="اختیاری"
                  className="mt-1.5 h-9"
                  dir="ltr"
                />
              </div>
              <div>
                <Label className="text-xs">مدیر شعبه</Label>
                <Input
                  value={formManager}
                  onChange={(e) => setFormManager(e.target.value)}
                  placeholder="نام و نام خانوادگی"
                  className="mt-1.5 h-9"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">تلفن تماس</Label>
              <Input
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                placeholder="۰۲۱-۱۲۳۴۵۶۷۸"
                className="mt-1.5 h-9"
                dir="ltr"
              />
            </div>

            <div>
              <Label className="text-xs">آدرس کامل</Label>
              <Input
                value={formAddress}
                onChange={(e) => setFormAddress(e.target.value)}
                placeholder="استان، شهر، خیابان، پلاک"
                className="mt-1.5 h-9"
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <div>
                <Label className="text-xs font-medium cursor-pointer" htmlFor="branch-active">وضعیت شعبه</Label>
                <p className="text-[10px] text-gray-500 mt-0.5">شعبه‌های غیرفعال در گزارش‌ها و انتخاب‌ها نمایش داده نمی‌شوند</p>
              </div>
              <Switch 
                id="branch-active"
                checked={formIsActive} 
                onCheckedChange={setFormIsActive} 
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="w-full sm:w-auto">انصراف</Button>
            <Button
              onClick={handleSave}
              disabled={submitting || !formName.trim()}
              className="bg-purple-600 hover:bg-purple-700 text-white w-full sm:w-auto gap-1.5"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {editingBranch ? 'ذخیره تغییرات' : 'ایجاد شعبه'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ★ مودال حذف */}
      <Dialog open={!!deletingBranch} onOpenChange={(open) => !open && setDeletingBranch(null)}>
        <DialogContent className="sm:max-w-[450px]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-red-600">
              <AlertTriangle className="w-5 h-5" />
              حذف شعبه
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-600">
              آیا از حذف دائم شعبه <strong>«{deletingBranch?.name}»</strong> مطمئن هستید؟ این عملیات غیرقابل بازگشت است.
            </DialogDescription>
          </DialogHeader>

          {deletingBranch && deletingBranch.warehouseCount > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              <div>
                <p className="font-bold">هشدار: این شعبه دارای {formatNumber(deletingBranch.warehouseCount)} انبار فعال است!</p>
                <p className="mt-1 text-amber-700">برای جلوگیری از از دست رفتن داده‌ها، لطفاً ابتدا انبارها را به شعبه دیگری منتقل کرده یا حذف نمایید.</p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeletingBranch(null)} className="w-full sm:w-auto">انصراف</Button>
            <Button
              onClick={handleDelete}
              disabled={deleting || (deletingBranch?.warehouseCount || 0) > 0}
              className="bg-red-600 hover:bg-red-700 text-white w-full sm:w-auto gap-1.5"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              حذف شعبه
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default BranchesPage