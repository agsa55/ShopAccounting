'use client'

// ============================================================================
// src/components/contacts/contacts-page.tsx (v7.5 — Unified Contacts)
// ============================================================================
// ★★★ یکپارچه‌سازی مشتریان و تامین‌کنندگان در یک صفحه با تب‌بندی
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
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Users, Plus, Search, Edit2, Trash2, Loader2, User, Building2,
  Wallet, Phone, AlertTriangle, CheckCircle2,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

// ============================================================================
//  Types
// ============================================================================

type ContactType = 'customer' | 'supplier'
type PersonType = 'person' | 'legal'

interface Contact {
  id: string
  type: ContactType
  code: string
  name: string
  firstName?: string
  lastName?: string
  mobile: string | null
  nationalCode: string | null
  address: string | null
  currentBalance: number
  creditLimit: number
  isBlacklisted: boolean
  isActive: boolean
  personType: PersonType
  economicCode: string | null
  companyName: string | null
  legalForm: string | null
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
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

function getTenantId(): string {
  const state = useAppStore.getState()
  const ct = state.currentTenant as any
  if (ct && typeof ct === 'object' && ct.id) return ct.id
  if (ct && typeof ct === 'string') return ct
  if (state.tenantId) return state.tenantId
  if (state.user?.tenantId) return state.user.tenantId
  return ''
}

// ============================================================================
//  Form Data
// ============================================================================

interface ContactForm {
  type: ContactType
  personType: PersonType
  firstName: string
  lastName: string
  companyName: string
  mobile: string
  nationalCode: string
  economicCode: string
  legalForm: string
  address: string
  creditLimit: string
  isActive: boolean
}

const emptyForm: ContactForm = {
  type: 'customer',
  personType: 'person',
  firstName: '',
  lastName: '',
  companyName: '',
  mobile: '',
  nationalCode: '',
  economicCode: '',
  legalForm: '',
  address: '',
  creditLimit: '',
  isActive: true,
}

// ============================================================================
//  Main Component
// ============================================================================

export function ContactsPage() {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<'all' | 'customer' | 'supplier'>('all')
  const [customers, setCustomers] = useState<Contact[]>([])
  const [suppliers, setSuppliers] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [search, setSearch] = useState('')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [form, setForm] = useState<ContactForm>(emptyForm)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingContact, setDeletingContact] = useState<Contact | null>(null)

  // ═══ Load Data ═══
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const tid = getTenantId()
      if (!tid) { setLoading(false); return }

      const [custRes, supRes] = await Promise.all([
        fetch(`/api/customers?tenantId=${tid}&limit=9999`, { headers: getAuthHeaders() }),
        fetch(`/api/suppliers?tenantId=${tid}`, { headers: getAuthHeaders() }),
      ])
      const [custData, supData] = await Promise.all([custRes.json(), supRes.json()])

      const custList = custData.success ? (Array.isArray(custData.data) ? custData.data : (custData.data?.customers || [])) : []
      const supList = supData.success ? (supData.data || []) : []

      setCustomers(custList.map((c: any) => ({
        id: c.id, type: 'customer' as const, code: c.code,
        name: c.personType === 'legal' ? (c.companyName || `${c.firstName} ${c.lastName}`.trim()) : `${c.firstName} ${c.lastName}`.trim(),
        firstName: c.firstName, lastName: c.lastName,
        mobile: c.mobile, nationalCode: c.nationalCode, address: c.address,
        currentBalance: c.currentBalance || 0, creditLimit: c.creditLimit || 0,
        isBlacklisted: c.isBlacklisted, isActive: true,
        personType: c.personType || 'person', economicCode: c.economicCode, companyName: c.companyName, legalForm: c.legalForm,
        createdAt: c.createdAt,
      })))

      setSuppliers(supList.map((s: any) => ({
        id: s.id, type: 'supplier' as const, code: s.code,
        name: s.personType === 'legal' ? (s.companyName || s.name) : s.name,
        firstName: '', lastName: s.name,
        mobile: s.mobile, nationalCode: s.nationalCode, address: s.address,
        currentBalance: s.currentBalance || 0, creditLimit: s.creditLimit || 0,
        isBlacklisted: false, isActive: s.isActive !== false,
        personType: s.personType || 'person', economicCode: s.economicCode, companyName: s.companyName, legalForm: s.legalForm,
        createdAt: s.createdAt,
      })))
    } catch (err) {
      console.error('Error loading contacts:', err)
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ═══ Filtered List ═══
  const allContacts = useMemo(() => [...customers, ...suppliers], [customers, suppliers])

  const filteredContacts = useMemo(() => {
    let list = activeTab === 'customer' ? customers : activeTab === 'supplier' ? suppliers : allContacts
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        (c.mobile || '').includes(q) ||
        (c.nationalCode || '').includes(q) ||
        (c.companyName || '').toLowerCase().includes(q)
      )
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [activeTab, customers, suppliers, allContacts, search])

  // ═══ Stats ═══
  const stats = useMemo(() => ({
    total: allContacts.length,
    customers: customers.length,
    suppliers: suppliers.length,
    totalDebit: customers.reduce((s, c) => s + (c.currentBalance > 0 ? c.currentBalance : 0), 0),
    totalCredit: suppliers.reduce((s, c) => s + (c.currentBalance > 0 ? c.currentBalance : 0), 0),
  }), [allContacts, customers, suppliers])

  // ═══ Handlers ═══
  const handleOpenAdd = () => {
    setEditingContact(null)
    setForm({ ...emptyForm, type: activeTab === 'supplier' ? 'supplier' : 'customer' })
    setDialogOpen(true)
  }

  const handleOpenEdit = (contact: Contact) => {
    setEditingContact(contact)
    setForm({
      type: contact.type,
      personType: contact.personType,
      firstName: contact.firstName || '',
      lastName: contact.lastName || '',
      companyName: contact.companyName || '',
      mobile: contact.mobile || '',
      nationalCode: contact.nationalCode || '',
      economicCode: contact.economicCode || '',
      legalForm: contact.legalForm || '',
      address: contact.address || '',
      creditLimit: contact.creditLimit ? String(contact.creditLimit) : '',
      isActive: contact.isActive,
    })
    setDialogOpen(true)
  }

  const handleSubmit = async () => {
    if (form.personType === 'person' && !form.firstName.trim()) {
      toast({ title: 'خطا', description: 'نام الزامی است', variant: 'destructive' })
      return
    }
    if (form.personType === 'legal' && !form.companyName.trim()) {
      toast({ title: 'خطا', description: 'نام شرکت الزامی است', variant: 'destructive' })
      return
    }

    setSubmitting(true)
    try {
      const tid = getTenantId()
      const isCustomer = form.type === 'customer'
      const api = isCustomer ? '/api/customers' : '/api/suppliers'

      const body: any = {
        tenantId: tid,
        personType: form.personType,
        mobile: form.mobile.trim() || null,
        nationalCode: form.nationalCode.trim() || null,
        address: form.address.trim() || null,
        creditLimit: form.creditLimit ? Number(form.creditLimit) : 0,
        economicCode: form.economicCode.trim() || null,
        companyName: form.companyName.trim() || null,
        legalForm: form.legalForm.trim() || null,
      }

      if (isCustomer) {
        body.firstName = form.firstName.trim()
        body.lastName = form.lastName.trim()
      } else {
        body.name = form.personType === 'legal' ? (form.companyName.trim() || form.firstName.trim()) : `${form.firstName} ${form.lastName}`.trim()
      }

      if (editingContact) {
        body.id = editingContact.id
        const res = await fetch(api, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify(body) })
        const data = await res.json()
        if (data.success) {
          toast({ title: 'موفق', description: 'طرف حساب به‌روزرسانی شد' })
          setDialogOpen(false); loadData()
        } else { toast({ title: 'خطا', description: data.error, variant: 'destructive' }) }
      } else {
        const res = await fetch(api, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(body) })
        const data = await res.json()
        if (data.success) {
          toast({ title: 'موفق', description: 'طرف حساب جدید ایجاد شد' })
          setDialogOpen(false); loadData()
        } else { toast({ title: 'خطا', description: data.error, variant: 'destructive' }) }
      }
    } catch (err: any) {
      toast({ title: 'خطا', description: err?.message, variant: 'destructive' })
    }
    setSubmitting(false)
  }

  const handleDelete = async () => {
    if (!deletingContact) return
    setSubmitting(true)
    try {
      const tid = getTenantId()
      const api = deletingContact.type === 'customer' ? `/api/customers?id=${deletingContact.id}&tenantId=${tid}` : `/api/suppliers?id=${deletingContact.id}&tenantId=${tid}`
      const res = await fetch(api, { method: 'DELETE', headers: getAuthHeaders() })
      const data = await res.json()
      if (data.success) {
        toast({ title: 'موفق', description: 'طرف حساب حذف شد' })
        setDeleteDialogOpen(false); setDeletingContact(null); loadData()
      } else { toast({ title: 'خطا', description: data.error, variant: 'destructive' }) }
    } catch (err: any) { toast({ title: 'خطا', description: err?.message, variant: 'destructive' }) }
    setSubmitting(false)
  }

  // ═══ Render ═══
  return (
    <div className="space-y-4" dir="rtl">
      {/* ★ Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center">
            <Users className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">طرف حساب</h1>
            <p className="text-xs text-gray-500">{toFa(stats.total)} طرف حساب</p>
          </div>
        </div>
        <Button onClick={handleOpenAdd} className="gap-1.5 bg-indigo-600 hover:bg-indigo-700">
          <Plus className="w-4 h-4" />افزودن
        </Button>
      </div>

      {/* ★ KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div className="border rounded-lg p-2.5 border-emerald-200 bg-emerald-50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center"><Users className="w-4 h-4 text-emerald-600" /></div>
            <div><p className="text-[10px] text-gray-500">مشتریان</p><p className="text-sm font-bold">{toFa(stats.customers)}</p></div>
          </div>
        </div>
        <div className="border rounded-lg p-2.5 border-amber-200 bg-amber-50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center"><Building2 className="w-4 h-4 text-amber-600" /></div>
            <div><p className="text-[10px] text-gray-500">تامین‌کنندگان</p><p className="text-sm font-bold">{toFa(stats.suppliers)}</p></div>
          </div>
        </div>
        <div className="border rounded-lg p-2.5 border-red-200 bg-red-50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center"><Wallet className="w-4 h-4 text-red-600" /></div>
            <div><p className="text-[10px] text-gray-500">بدهکاران</p><p className="text-sm font-bold" dir="ltr">{formatNumber(stats.totalDebit)}</p></div>
          </div>
        </div>
        <div className="border rounded-lg p-2.5 border-orange-200 bg-orange-50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center"><Wallet className="w-4 h-4 text-orange-600" /></div>
            <div><p className="text-[10px] text-gray-500">بستانکاران</p><p className="text-sm font-bold" dir="ltr">{formatNumber(stats.totalCredit)}</p></div>
          </div>
        </div>
      </div>

      {/* ★ Tabs + Search */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-0.5 bg-gray-100 rounded-md">
            {[
              { val: 'all' as const, label: 'همه', count: stats.total },
              { val: 'customer' as const, label: 'مشتریان', count: stats.customers },
              { val: 'supplier' as const, label: 'تامین‌کنندگان', count: stats.suppliers },
            ].map(t => (
              <button key={t.val} onClick={() => setActiveTab(t.val)}
                className={`px-3 py-1 text-[11px] rounded transition-colors flex items-center gap-1 ${
                  activeTab === t.val ? 'bg-white text-indigo-700 font-bold shadow-sm' : 'text-gray-500'
                }`}>
                {t.label}
                <span className="text-[9px] opacity-60">({toFa(t.count)})</span>
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input placeholder="جستجو..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9" />
          </div>
        </CardContent>
      </Card>

      {/* ★ Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
          ) : filteredContacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <Users className="w-12 h-12 mb-2 text-gray-300" />
              <p className="text-sm">طرف حسابی یافت نشد</p>
            </div>
          ) : (
            <Table>
              <TableHeader><TableRow className="bg-gray-50">
                <TableHead className="text-right text-xs">نام / شرکت</TableHead>
                <TableHead className="text-center text-xs">نوع</TableHead>
                <TableHead className="text-center text-xs">شخصیت</TableHead>
                <TableHead className="text-center text-xs hidden sm:table-cell">موبایل</TableHead>
                <TableHead className="text-left text-xs">مانده</TableHead>
                <TableHead className="text-center text-xs">عملیات</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filteredContacts.map((c) => (
                  <TableRow key={`${c.type}-${c.id}`} className="hover:bg-indigo-50/30">
                    <TableCell className="text-xs py-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          c.type === 'customer' ? 'bg-emerald-100' : 'bg-amber-100'
                        }`}>
                          {c.personType === 'legal' ? <Building2 className={`w-3.5 h-3.5 ${c.type === 'customer' ? 'text-emerald-600' : 'text-amber-600'}`} /> : <User className={`w-3.5 h-3.5 ${c.type === 'customer' ? 'text-emerald-600' : 'text-amber-600'}`} />}
                        </div>
                        <div>
                          <div className="font-medium text-gray-800">{c.name}</div>
                          <div className="text-[9px] text-gray-400" dir="ltr">{c.code}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={`text-[9px] ${c.type === 'customer' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                        {c.type === 'customer' ? 'مشتری' : 'تامین‌کننده'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={`text-[9px] ${c.personType === 'legal' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                        {c.personType === 'legal' ? 'حقوقی' : 'حقیقی'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center text-xs hidden sm:table-cell" dir="ltr">{c.mobile || '—'}</TableCell>
                    <TableCell className="text-left text-xs">
                      {c.currentBalance === 0 ? <span className="text-gray-400">—</span> : (
                        <span className={`font-bold ${c.type === 'customer' ? 'text-emerald-600' : 'text-amber-600'}`} dir="ltr">
                          {formatNumber(Math.abs(c.currentBalance))}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(c)} className="h-7 w-7 p-0"><Edit2 className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => { setDeletingContact(c); setDeleteDialogOpen(true) }} className="h-7 w-7 p-0 text-red-500"><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ★ Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingContact ? 'ویرایش طرف حساب' : 'طرف حساب جدید'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* ★ نوع طرف حساب */}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setForm({ ...form, type: 'customer' })}
                className={`p-2.5 rounded-lg border-2 text-xs font-bold transition-all ${form.type === 'customer' ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-400'}`}>
                مشتری (خریدار)
              </button>
              <button onClick={() => setForm({ ...form, type: 'supplier' })}
                className={`p-2.5 rounded-lg border-2 text-xs font-bold transition-all ${form.type === 'supplier' ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-400'}`}>
                تامین‌کننده (فروشنده)
              </button>
            </div>

            {/* ★ نوع شخص */}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setForm({ ...form, personType: 'person' })}
                className={`p-2 rounded-lg border-2 text-xs font-medium transition-all ${form.personType === 'person' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-400'}`}>
                <User className="w-3.5 h-3.5 inline ml-1" /> شخص حقیقی
              </button>
              <button onClick={() => setForm({ ...form, personType: 'legal' })}
                className={`p-2 rounded-lg border-2 text-xs font-medium transition-all ${form.personType === 'legal' ? 'border-purple-400 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-400'}`}>
                <Building2 className="w-3.5 h-3.5 inline ml-1" /> شخص حقوقی
              </button>
            </div>

            {/* ★ فیلدهای حقیقی */}
            {form.personType === 'person' ? (
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">نام <span className="text-red-500">*</span></Label><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="mt-1" /></div>
                <div><Label className="text-xs">نام خانوادگی</Label><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="mt-1" /></div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">نام شرکت <span className="text-red-500">*</span></Label><Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} className="mt-1" /></div>
                <div><Label className="text-xs">نوع شخصیت حقوقی</Label><Input value={form.legalForm} onChange={(e) => setForm({ ...form, legalForm: e.target.value })} className="mt-1" placeholder="سهامی، مسئولیت محدود..." /></div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">موبایل</Label><Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} className="mt-1" dir="ltr" /></div>
              <div><Label className="text-xs">{form.personType === 'legal' ? 'شناسه ملی' : 'کد ملی'}</Label><Input value={form.nationalCode} onChange={(e) => setForm({ ...form, nationalCode: e.target.value })} className="mt-1" dir="ltr" /></div>
            </div>

            {form.personType === 'legal' && (
              <div><Label className="text-xs">کد اقتصادی</Label><Input value={form.economicCode} onChange={(e) => setForm({ ...form, economicCode: e.target.value })} className="mt-1" dir="ltr" /></div>
            )}

            <div><Label className="text-xs">آدرس</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="mt-1" /></div>
            <div><Label className="text-xs">سقف اعتبار (ریال)</Label><Input type="number" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} className="mt-1" dir="ltr" /></div>

            {editingContact && (
              <div className="flex items-center justify-between"><Label className="text-xs">فعال</Label><Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} /></div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>انصراف</Button>
            <Button onClick={handleSubmit} disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700 gap-1.5">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {editingContact ? 'ذخیره' : 'ایجاد'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ★ Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[400px]" dir="rtl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-500" /> حذف طرف حساب</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600">آیا از حذف «{deletingContact?.name}» مطمئن هستید؟</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>انصراف</Button>
            <Button onClick={handleDelete} disabled={submitting} className="bg-red-600 hover:bg-red-700 gap-1.5">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default ContactsPage
