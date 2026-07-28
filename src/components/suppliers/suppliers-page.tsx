'use client'

// ============================================================================
// src/components/suppliers/suppliers-page.tsx — صفحه مدیریت تامین‌کنندگان
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Users, Plus, Search, Edit2, Trash2, Phone, Loader2, AlertCircle, Building2,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface Supplier {
  id: string
  code: string
  name: string
  mobile?: string
  nationalCode?: string
  address?: string
  creditLimit: number
  currentBalance: number
  isActive: boolean
}

const formatNumber = (n: number) => (n || 0).toLocaleString('fa-IR')

export function SuppliersPage() {
  const tenantId = useAppStore((s) => s.tenantId)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    name: '', code: '', mobile: '', nationalCode: '', address: '',
    creditLimit: '0', isActive: true,
  })
  const { toast } = useToast()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const tid = tenantId || useAppStore.getState().currentTenant?.id
      if (!tid) return
      const res = await fetch(`/api/suppliers?tenantId=${tid}&search=${encodeURIComponent(search)}`)
      const data = await res.json()
      if (data.success) {
        setSuppliers(data.data || [])
      }
    } catch (err) {
      console.error('Error loading suppliers:', err)
    }
    setLoading(false)
  }, [tenantId, search])

  useEffect(() => { loadData() }, [loadData])

  const handleOpenAdd = () => {
    setEditingSupplier(null)
    setForm({ name: '', code: '', mobile: '', nationalCode: '', address: '', creditLimit: '0', isActive: true })
    setDialogOpen(true)
  }

  const handleOpenEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier)
    setForm({
      name: supplier.name,
      code: supplier.code,
      mobile: supplier.mobile || '',
      nationalCode: supplier.nationalCode || '',
      address: supplier.address || '',
      creditLimit: String(supplier.creditLimit || 0),
      isActive: supplier.isActive,
    })
    setDialogOpen(true)
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast({ title: 'خطا', description: 'نام تامین‌کننده الزامی است', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    try {
      const tid = tenantId || useAppStore.getState().currentTenant?.id
      const url = '/api/suppliers'
      const method = editingSupplier ? 'PUT' : 'POST'
      const body: any = { ...form, tenantId: tid }
      if (editingSupplier) body.id = editingSupplier.id

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()

      if (data.success) {
        toast({ title: 'موفق', description: editingSupplier ? 'تامین‌کننده به‌روزرسانی شد' : 'تامین‌کننده ایجاد شد' })
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

  const handleDelete = async (supplier: Supplier) => {
    if (!confirm(`آیا از حذف "${supplier.name}" مطمئن هستید؟`)) return
    try {
      const tid = tenantId || useAppStore.getState().currentTenant?.id
      const res = await fetch(`/api/suppliers?id=${supplier.id}&tenantId=${tid}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        toast({ title: 'موفق', description: data.message })
        loadData()
      } else {
        toast({ title: 'خطا', description: data.error, variant: 'destructive' })
      }
    } catch (err: any) {
      toast({ title: 'خطا', description: err?.message, variant: 'destructive' })
    }
  }

  const filtered = suppliers.filter(s =>
    s.name.includes(search) || s.code.includes(search) || (s.mobile || '').includes(search)
  )

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">تامین‌کنندگان</h1>
            <p className="text-xs text-gray-500">{formatNumber(filtered.length)} تامین‌کننده</p>
          </div>
        </div>
        <Button onClick={handleOpenAdd} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4" />
          تامین‌کننده جدید
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="جستجو بر اساس نام، کد، موبایل..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pr-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <Users className="w-12 h-12 mb-2 text-gray-300" />
              <p className="text-sm">تامین‌کننده‌ای یافت نشد</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="text-right text-xs">کد</TableHead>
                  <TableHead className="text-right text-xs">نام</TableHead>
                  <TableHead className="text-right text-xs hidden sm:table-cell">موبایل</TableHead>
                  <TableHead className="text-right text-xs">مانده حساب</TableHead>
                  <TableHead className="text-center text-xs">وضعیت</TableHead>
                  <TableHead className="text-center text-xs">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((supplier) => (
                  <TableRow key={supplier.id} className="hover:bg-blue-50/50">
                    <TableCell className="text-xs font-mono" dir="ltr">{supplier.code}</TableCell>
                    <TableCell className="text-xs font-medium">{supplier.name}</TableCell>
                    <TableCell className="text-xs hidden sm:table-cell" dir="ltr">{supplier.mobile || '—'}</TableCell>
                    <TableCell className="text-xs">
                      <span className={supplier.currentBalance > 0 ? 'text-red-600 font-medium' : 'text-emerald-600'}>
                        {formatNumber(Math.abs(supplier.currentBalance))}
                        {supplier.currentBalance > 0 ? ' (بدهکار)' : ''}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={supplier.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}>
                        {supplier.isActive ? 'فعال' : 'غیرفعال'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(supplier)}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(supplier)} className="text-red-500">
                          <Trash2 className="w-3.5 h-3.5" />
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[450px]" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingSupplier ? 'ویرایش تامین‌کننده' : 'تامین‌کننده جدید'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">نام <span className="text-red-500">*</span></Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">کد (اختیاری)</Label>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="mt-1" placeholder="خودکار" />
              </div>
              <div>
                <Label className="text-xs">موبایل</Label>
                <Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} className="mt-1" dir="ltr" />
              </div>
            </div>
            <div>
              <Label className="text-xs">کد ملی / شناسه ملی</Label>
              <Input value={form.nationalCode} onChange={(e) => setForm({ ...form, nationalCode: e.target.value })} className="mt-1" dir="ltr" />
            </div>
            <div>
              <Label className="text-xs">آدرس</Label>
              <Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="mt-1" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>انصراف</Button>
            <Button onClick={handleSubmit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {editingSupplier ? 'به‌روزرسانی' : 'ایجاد'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
