'use client'

// ============================================================================
// src/components/branches/branches-page.tsx
// ShopAccounting v7.1 — Branches Management Page (مدیریت شعب)
// ============================================================================
// ★★★ ویژگی‌ها:
//   ★ لیست شعب با اطلاعات کامل (نام، کد، مدیر، تلفن، آدرس)
//   ★ ایجاد، ویرایش، حذف شعبه
//   ★ نمایش تعداد انبارهای هر شعبه
//   ★ فعال/غیرفعال کردن شعبه
//   ★ فقط برای پلن سازمانی (canMultiBranch)
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Building2, Plus, Loader2, Trash2, Edit2, Package, Phone, MapPin, User, X, AlertTriangle, CheckCircle2,
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

const toFa = (n: number | string) => String(n || 0).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)])
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
      // ★★★ v8.4: fallback برای فرمت‌های مختلف پاسخ API
      const branchesData = data?.data || data?.branches || data || []
      setBranches(Array.isArray(branchesData) ? branchesData : [])
    } catch (err: any) {
      console.error('Error loading branches:', err)
      setBranches([])
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

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
        toast({ title: 'موفق', description: data.message })
        setDialogOpen(false)
        loadData()
      } else {
        toast({ title: 'خطا', description: data.error, variant: 'destructive' })
      }
    } catch (err: any) {
      toast({ title: 'خطا', description: err?.message, variant: 'destructive' })
    }
    setSubmitting(false)
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
        toast({ title: 'موفق', description: data.message })
        setDeletingBranch(null)
        loadData()
      } else {
        toast({ title: 'خطا', description: data.error, variant: 'destructive' })
      }
    } catch (err: any) {
      toast({ title: 'خطا', description: err?.message, variant: 'destructive' })
    }
    setDeleting(false)
  }

  // ═══════════════════════════════════════════════════════════════
  //  Render
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="space-y-4" dir="rtl">
      {/* ★ Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">مدیریت شعب</h1>
            <p className="text-xs text-gray-500">{formatNumber(branches.length)} شعبه ثبت شده</p>
          </div>
        </div>
        <Button onClick={openCreateDialog} className="gap-1.5 bg-purple-600 hover:bg-purple-700">
          <Plus className="w-4 h-4" />
          شعبه جدید
        </Button>
      </div>

      {/* ★ لیست شعب */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
            </div>
          ) : branches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <Building2 className="w-12 h-12 mb-2 text-gray-300" />
              <p className="text-sm">شعبه‌ای ثبت نشده است</p>
              <Button onClick={openCreateDialog} variant="outline" className="mt-3 text-xs gap-1">
                <Plus className="w-3 h-3" />
                ایجاد اولین شعبه
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="text-right text-xs">نام شعبه</TableHead>
                  <TableHead className="text-center text-xs">کد</TableHead>
                  <TableHead className="text-right text-xs">مدیر</TableHead>
                  <TableHead className="text-right text-xs">تلفن</TableHead>
                  <TableHead className="text-center text-xs">انبارها</TableHead>
                  <TableHead className="text-center text-xs">وضعیت</TableHead>
                  <TableHead className="text-center text-xs">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.map((branch) => (
                  <TableRow key={branch.id} className="hover:bg-purple-50/30">
                    <TableCell className="text-xs py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                          <Building2 className="w-3.5 h-3.5 text-purple-600" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-800">{branch.name}</div>
                          {branch.address && (
                            <div className="text-[9px] text-gray-400 flex items-center gap-0.5 mt-0.5">
                              <MapPin className="w-2.5 h-2.5" />
                              {branch.address}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-xs font-mono" dir="ltr">{branch.code}</TableCell>
                    <TableCell className="text-xs text-gray-600">
                      {branch.manager ? (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3 text-gray-400" />
                          {branch.manager}
                        </span>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-gray-600" dir="ltr">
                      {branch.phone || '—'}
                    </TableCell>
                    <TableCell className="text-center text-xs">
                      <Badge variant="outline" className="text-[9px] bg-blue-50 text-blue-700">
                        <Package className="w-2.5 h-2.5 ml-0.5" />
                        {formatNumber(branch.warehouseCount)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={`text-[9px] ${
                        branch.isActive
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-gray-50 text-gray-500 border-gray-200'
                      }`}>
                        {branch.isActive ? 'فعال' : 'غیرفعال'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(branch)}
                          className="h-7 w-7 p-0"
                          title="ویرایش"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-blue-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingBranch(branch)}
                          className="h-7 w-7 p-0"
                          title="حذف"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ★ مودال ایجاد/ویرایش */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Building2 className="w-5 h-5 text-purple-600" />
              {editingBranch ? 'ویرایش شعبه' : 'شعبه جدید'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {editingBranch ? `ویرایش شعبه «${editingBranch.name}»` : 'اطلاعات شعبه جدید را وارد کنید'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="text-xs">نام شعبه <span className="text-red-500">*</span></Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="مثلاً: شعبه مرکزی"
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">کد شعبه</Label>
                <Input
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value)}
                  placeholder="خودکار"
                  className="mt-1"
                  dir="ltr"
                />
              </div>
              <div>
                <Label className="text-xs">مدیر شعبه</Label>
                <Input
                  value={formManager}
                  onChange={(e) => setFormManager(e.target.value)}
                  placeholder="نام مدیر"
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">تلفن</Label>
              <Input
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                placeholder="۰۲۱-۱۲۳۴۵۶۷۸"
                className="mt-1"
                dir="ltr"
              />
            </div>

            <div>
              <Label className="text-xs">آدرس</Label>
              <Input
                value={formAddress}
                onChange={(e) => setFormAddress(e.target.value)}
                placeholder="آدرس کامل شعبه"
                className="mt-1"
              />
            </div>

            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={formIsActive}
                onChange={(e) => setFormIsActive(e.target.checked)}
                className="w-4 h-4"
              />
              شعبه فعال است
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>انصراف</Button>
            <Button
              onClick={handleSave}
              disabled={submitting || !formName.trim()}
              className="bg-purple-600 hover:bg-purple-700 gap-1.5"
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
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              حذف شعبه
            </DialogTitle>
            <DialogDescription className="text-xs">
              آیا از حذف شعبه «{deletingBranch?.name}» مطمئن هستید؟
            </DialogDescription>
          </DialogHeader>

          {deletingBranch && deletingBranch.warehouseCount > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">این شعبه {formatNumber(deletingBranch.warehouseCount)} انبار دارد!</p>
                <p className="mt-1">ابتدا انبارها را به شعبه دیگری منتقل کنید.</p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingBranch(null)}>انصراف</Button>
            <Button
              onClick={handleDelete}
              disabled={deleting || (deletingBranch?.warehouseCount || 0) > 0}
              className="bg-red-600 hover:bg-red-700 gap-1.5"
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
