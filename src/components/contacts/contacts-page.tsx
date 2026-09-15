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
  Wallet, Phone, AlertTriangle, CheckCircle2, WifiOff, CloudOff, RefreshCw, Upload,
} from 'lucide-react'

// ============================================================================
//  Offline Types & Helpers
// ============================================================================
interface SyncQueueItem {
  id: string
  offlineId: string
  serverId?: string
  type: 'customer' | 'supplier'
  action: 'create' | 'update' | 'delete'
  payload: any
  retryCount: number
  createdAt: string
}
const STORAGE_KEYS = {
  CONTACTS: 'contacts_offline',
  SYNC_QUEUE: 'contacts_sync_queue',
  LAST_SYNC: 'contacts_last_sync',
} as const

function generateOfflineId() {
  return `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function loadFromStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : defaultValue
  } catch { return defaultValue }
}
function saveToStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}
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
    _offlineId?: string
  _isOffline?: boolean
  _offlineAction?: 'create' | 'update' | 'delete'
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

  // ★ آفلاین State
  const isOnline = useAppStore((s) => s.isOnline)
  const [syncQueue, setSyncQueue] = useState<SyncQueueItem[]>([])
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null)

  const loadSyncQueue = useCallback(() => loadFromStorage<SyncQueueItem[]>(STORAGE_KEYS.SYNC_QUEUE, []), [])
  const saveSyncQueue = useCallback((queue: SyncQueueItem[]) => {
    saveToStorage(STORAGE_KEYS.SYNC_QUEUE, queue)
    setSyncQueue(queue)
  }, [])
  const addToSyncQueue = useCallback((item: Omit<SyncQueueItem, 'id' | 'retryCount' | 'createdAt'>) => {
    const queue = loadSyncQueue()
    const newItem: SyncQueueItem = { ...item, id: generateOfflineId(), retryCount: 0, createdAt: new Date().toISOString() }
    saveSyncQueue([...queue, newItem])
    return newItem
  }, [loadSyncQueue, saveSyncQueue])
  const removeFromSyncQueue = useCallback((queueItemId: string) => {
    saveSyncQueue(loadSyncQueue().filter(i => i.id !== queueItemId))
  }, [loadSyncQueue, saveSyncQueue])
  

  // ═══ Load Data ═══
   const loadData = useCallback(async () => {
    setLoading(true)
    const tid = getTenantId()
    const trulyOnline = isOnline && navigator.onLine

    if (!trulyOnline) {
      const cached = loadFromStorage<Contact[]>(STORAGE_KEYS.CONTACTS, [])
      // تفکیک کش به مشتریان و تامین‌کنندگان
      setCustomers(cached.filter(c => c.type === 'customer'))
      setSuppliers(cached.filter(c => c.type === 'supplier'))
      setSyncQueue(loadSyncQueue())
      setLoading(false)
      return
    }

    if (!tid) { setLoading(false); return }

    try {
      const [custRes, supRes] = await Promise.all([
        fetch(`/api/customers?tenantId=${tid}&limit=9999`, { headers: getAuthHeaders() }),
        fetch(`/api/suppliers?tenantId=${tid}`, { headers: getAuthHeaders() }),
      ])
      const [custData, supData] = await Promise.all([custRes.json(), supRes.json()])

      const custList = custData.success ? (Array.isArray(custData.data) ? custData.data : (custData.data?.customers || [])) : []
      const supList = supData.success ? (supData.data || []) : []

      const formattedCust = custList.map((c: any) => ({
        id: c.id, type: 'customer' as const, code: c.code,
        name: c.personType === 'legal' ? (c.companyName || `${c.firstName} ${c.lastName}`.trim()) : `${c.firstName} ${c.lastName}`.trim(),
        firstName: c.firstName, lastName: c.lastName,
        mobile: c.mobile, nationalCode: c.nationalCode, address: c.address,
        currentBalance: c.currentBalance || 0, creditLimit: c.creditLimit || 0,
        isBlacklisted: c.isBlacklisted, isActive: true,
        personType: c.personType || 'person', economicCode: c.economicCode, companyName: c.companyName, legalForm: c.legalForm,
        createdAt: c.createdAt,
      }))

      const formattedSup = supList.map((s: any) => ({
        id: s.id, type: 'supplier' as const, code: s.code,
        name: s.personType === 'legal' ? (s.companyName || s.name) : s.name,
        firstName: '', lastName: s.name,
        mobile: s.mobile, nationalCode: s.nationalCode, address: s.address,
        currentBalance: s.currentBalance || 0, creditLimit: s.creditLimit || 0,
        isBlacklisted: false, isActive: s.isActive !== false,
        personType: s.personType || 'person', economicCode: s.economicCode, companyName: s.companyName, legalForm: s.legalForm,
        createdAt: s.createdAt,
      }))

      setCustomers(formattedCust)
      setSuppliers(formattedSup)
      
      // ذخیره در کش
      saveToStorage(STORAGE_KEYS.CONTACTS, [...formattedCust, ...formattedSup])
      const now = new Date().toISOString()
      saveToStorage(STORAGE_KEYS.LAST_SYNC, now)
      setLastSyncTime(now)
      setSyncQueue(loadSyncQueue())

    } catch (err) {
      console.warn('[ContactsPage] Network error, falling back to cache')
      const cached = loadFromStorage<Contact[]>(STORAGE_KEYS.CONTACTS, [])
      setCustomers(cached.filter(c => c.type === 'customer'))
      setSuppliers(cached.filter(c => c.type === 'supplier'))
    }
    setLoading(false)
  }, [isOnline, loadSyncQueue])

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
      toast({ title: 'خطا', description: 'نام الزامی است', variant: 'destructive' }); return
    }
    if (form.personType === 'legal' && !form.companyName.trim()) {
      toast({ title: 'خطا', description: 'نام شرکت الزامی است', variant: 'destructive' }); return
    }

    setSubmitting(true)
    const tid = getTenantId()
    const trulyOnline = isOnline && navigator.onLine

    const body: any = {
      tenantId: tid, personType: form.personType, mobile: form.mobile.trim() || null,
      nationalCode: form.nationalCode.trim() || null, address: form.address.trim() || null,
      creditLimit: form.creditLimit ? Number(form.creditLimit) : 0, economicCode: form.economicCode.trim() || null,
      companyName: form.companyName.trim() || null, legalForm: form.legalForm.trim() || null,
    }
    if (form.type === 'customer') { body.firstName = form.firstName.trim(); body.lastName = form.lastName.trim() }
    else { body.name = form.personType === 'legal' ? (form.companyName.trim() || form.firstName.trim()) : `${form.firstName} ${form.lastName}`.trim() }

    // ★ حالت آفلاین
    if (!trulyOnline) {
      const offlineId = editingContact?._offlineId || generateOfflineId()
      const newContact: Contact = {
        id: offlineId, type: form.type, code: `OFF-${Date.now()}`,
        name: form.personType === 'legal' ? form.companyName : `${form.firstName} ${form.lastName}`.trim(),
        firstName: form.firstName, lastName: form.lastName, mobile: form.mobile, nationalCode: form.nationalCode,
        address: form.address, currentBalance: 0, creditLimit: Number(form.creditLimit) || 0,
        isBlacklisted: false, isActive: form.isActive, personType: form.personType,
        economicCode: form.economicCode, companyName: form.companyName, legalForm: form.legalForm,
        createdAt: new Date().toISOString(), _offlineId: offlineId, _isOffline: true, _offlineAction: editingContact ? 'update' : 'create'
      } as any

      const cached = loadFromStorage<Contact[]>(STORAGE_KEYS.CONTACTS, [])
      let updated: Contact[]
      if (editingContact) {
        updated = cached.map(c => (c.id === editingContact.id || (c as any)._offlineId === editingContact.id) ? { ...c, ...newContact } : c)
      } else {
        updated = [newContact, ...cached]
      }
      saveToStorage(STORAGE_KEYS.CONTACTS, updated)
      setCustomers(updated.filter(c => c.type === 'customer'))
      setSuppliers(updated.filter(c => c.type === 'supplier'))

      addToSyncQueue({ offlineId, serverId: editingContact?.id, type: form.type, action: editingContact ? 'update' : 'create', payload: body })
      
      toast({ title: 'ذخیره آفلاین ✓', description: 'پس از اتصال به اینترنت همگام‌سازی می‌شود' })
      setDialogOpen(false); setSubmitting(false); return
    }

    // ★ حالت آنلاین
    try {
      const api = form.type === 'customer' ? '/api/customers' : '/api/suppliers'
      const method = editingContact ? 'PUT' : 'POST'
      if (editingContact) body.id = editingContact.id
      
      const res = await fetch(api, { method, headers: getAuthHeaders(), body: JSON.stringify(body) })
      const data = await res.json()
      if (data.success) {
        toast({ title: 'موفق', description: editingContact ? 'طرف حساب به‌روزرسانی شد' : 'طرف حساب جدید ایجاد شد' })
        setDialogOpen(false); loadData()
      } else { toast({ title: 'خطا', description: data.error, variant: 'destructive' }) }
    } catch (err: any) { toast({ title: 'خطا', description: err?.message, variant: 'destructive' }) }
    setSubmitting(false)
  }

  const handleDelete = async () => {
    if (!deletingContact) return
    setSubmitting(true)
    const tid = getTenantId()
    const trulyOnline = isOnline && navigator.onLine

    // ★ حالت آفلاین
    if (!trulyOnline || (deletingContact as any)._isOffline) {
      const cached = loadFromStorage<Contact[]>(STORAGE_KEYS.CONTACTS, [])
      const updated = cached.filter(c => c.id !== deletingContact.id && (c as any)._offlineId !== deletingContact.id)
      saveToStorage(STORAGE_KEYS.CONTACTS, updated)
      setCustomers(updated.filter(c => c.type === 'customer'))
      setSuppliers(updated.filter(c => c.type === 'supplier'))

      if (!(deletingContact as any)._isOffline) {
        addToSyncQueue({ offlineId: deletingContact.id, serverId: deletingContact.id, type: deletingContact.type, action: 'delete', payload: { id: deletingContact.id } })
      }
      toast({ title: 'حذف در صف', description: 'پس از اتصال به اینترنت حذف می‌شود' })
      setDeleteDialogOpen(false); setDeletingContact(null); setSubmitting(false); return
    }

    // ★ حالت آنلاین
    try {
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
  // ═══ Sync Engine ═══
  const syncOfflineData = useCallback(async () => {
    const queue = loadSyncQueue()
    if (queue.length === 0 || !isOnline) return
    setIsSyncing(true)
    let successCount = 0

    for (const item of queue) {
      if (item.retryCount >= 3) continue
      try {
        const tid = getTenantId()
        const api = item.type === 'customer' ? '/api/customers' : '/api/suppliers'
        let res: Response
        if (item.action === 'create') res = await fetch(api, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ ...item.payload, tenantId: tid }) })
        else if (item.action === 'update') res = await fetch(`${api}/${item.serverId || item.payload.id}`, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify({ ...item.payload, tenantId: tid }) })
        else res = await fetch(`${api}?id=${item.serverId || item.payload.id}&tenantId=${tid}`, { method: 'DELETE', headers: getAuthHeaders() })

        const data = await res.json()
        if (data.success) {
          removeFromSyncQueue(item.id)
          successCount++
        }
      } catch { /* retry later */ }
    }
    setIsSyncing(false)
    if (successCount > 0) {
      toast({ title: 'همگام‌سازی موفق', description: `${toFa(successCount)} مورد با سرور همگام شد` })
      loadData()
    }
  }, [isOnline, loadSyncQueue, removeFromSyncQueue, loadData, toast])

  useEffect(() => {
    if (isOnline) {
      const queue = loadSyncQueue()
      if (queue.length > 0) {
        const timer = setTimeout(() => syncOfflineData(), 1500)
        return () => clearTimeout(timer)
   }
    }
  }, [isOnline])

  // ═══ Render ═══
  // ═══ Mobile Contact Card ═══
  const MobileContactCard = ({ c }: { c: Contact }) => (
    <Card className={`border shadow-none ${(c as any)._isOffline ? 'border-amber-200 bg-amber-50/20' : 'border-gray-200'}`}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between mb-2 gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${c.type === 'customer' ? 'bg-emerald-100' : 'bg-amber-100'}`}>
              {c.personType === 'legal' ? <Building2 className={`w-4 h-4 ${c.type === 'customer' ? 'text-emerald-600' : 'text-amber-600'}`} /> : <User className={`w-4 h-4 ${c.type === 'customer' ? 'text-emerald-600' : 'text-amber-600'}`} />}
            </div>
            <div className="min-w-0">
              <div className="font-bold text-sm text-gray-900 truncate">{c.name}</div>
              <div className="text-[10px] text-gray-400 flex items-center gap-1" dir="ltr">
                {c.code}
                {(c as any)._isOffline && <span className="text-amber-600 font-bold">• آفلاین</span>}
              </div>
            </div>
          </div>
          <Badge variant="outline" className={`text-[9px] shrink-0 ${c.type === 'customer' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
            {c.type === 'customer' ? 'مشتری' : 'تامین‌کننده'}
          </Badge>
        </div>
        <div className="grid grid-cols-3 gap-1.5 mb-2.5">
          <div className="bg-gray-50 rounded p-1.5 text-center">
            <p className="text-[9px] text-gray-400 leading-tight">شخصیت</p>
            <p className="text-[10px] font-bold text-gray-700 leading-tight mt-0.5">{c.personType === 'legal' ? 'حقوقی' : 'حقیقی'}</p>
          </div>
          <div className="bg-blue-50 rounded p-1.5 text-center">
            <p className="text-[9px] text-gray-400 leading-tight">موبایل</p>
            <p className="text-[10px] font-bold text-blue-600 leading-tight mt-0.5 truncate" dir="ltr">{c.mobile || '—'}</p>
          </div>
          <div className={`rounded p-1.5 text-center ${c.currentBalance > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
            <p className="text-[9px] text-gray-400 leading-tight">مانده</p>
            <p className={`text-[10px] font-bold leading-tight mt-0.5 ${c.currentBalance > 0 ? 'text-red-600' : 'text-gray-400'}`} dir="ltr">{formatNumber(Math.abs(c.currentBalance))}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-1 pt-2 border-t border-gray-100">
          <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-blue-50 hover:text-blue-600" onClick={() => handleOpenEdit(c)}>
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-red-50 hover:text-red-600" onClick={() => { setDeletingContact(c); setDeleteDialogOpen(true) }}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )

   return (
    <div className="space-y-3 sm:space-y-4" dir="rtl">
      {/* ★ Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-gray-900">طرف حساب</h1>
            <p className="text-xs text-gray-500">{toFa(stats.total)} طرف حساب</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!isOnline && (
            <Badge variant="outline" className="gap-1 text-[10px] border-amber-300 text-amber-700 bg-amber-50 px-1.5">
              <WifiOff className="w-2.5 h-2.5" /> آفلاین
            </Badge>
          )}
          {syncQueue.length > 0 && (
            <Badge variant="outline" className="gap-1 text-[10px] border-blue-300 text-blue-700 bg-blue-50 cursor-pointer px-1.5" onClick={() => isOnline && syncOfflineData()}>
              {isSyncing ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Upload className="w-2.5 h-2.5" />}
              {toFa(syncQueue.length)} در انتظار
            </Badge>
          )}
          <Button onClick={handleOpenAdd} className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 w-full sm:w-auto h-9">
            <Plus className="w-4 h-4" />افزودن
          </Button>
        </div>
      </div>

      {/* ★ KPI (ریسپانسیو) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {/* ... (کد KPI شما بدون تغییر باقی بماند، فقط کلاس‌های آن خوب هستند) ... */}
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
        <CardContent className="p-3 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
          <div className="flex items-center gap-1 p-0.5 bg-gray-100 rounded-md shrink-0">
            {[
              { val: 'all' as const, label: 'همه', count: stats.total },
              { val: 'customer' as const, label: 'مشتریان', count: stats.customers },
              { val: 'supplier' as const, label: 'تامین‌کنندگان', count: stats.suppliers },
            ].map(t => (
              <button key={t.val} onClick={() => setActiveTab(t.val)}
                className={`px-3 py-1.5 text-[11px] rounded transition-colors flex items-center gap-1 ${
                  activeTab === t.val ? 'bg-white text-indigo-700 font-bold shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {t.label} <span className="text-[9px] opacity-60">({toFa(t.count)})</span>
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-0">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input placeholder="جستجو در نام، کد، موبایل..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9 h-9" />
          </div>
        </CardContent>
      </Card>

      {/* ★ List (ریسپانسیو: کارت در موبایل، جدول در دسکتاپ) */}
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
            <>
              {/* نمای موبایل */}
              <div className="md:hidden space-y-2 p-3">
                {filteredContacts.map((c) => <MobileContactCard key={`${c.type}-${c.id}`} c={c} />)}
              </div>
              
              {/* نمای دسکتاپ */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader><TableRow className="bg-gray-50">
                    <TableHead className="text-right text-xs">نام / شرکت</TableHead>
                    <TableHead className="text-center text-xs">نوع</TableHead>
                    <TableHead className="text-center text-xs">شخصیت</TableHead>
                    <TableHead className="text-center text-xs">موبایل</TableHead>
                    <TableHead className="text-left text-xs">مانده</TableHead>
                    <TableHead className="text-center text-xs">عملیات</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filteredContacts.map((c) => (
                      <TableRow key={`${c.type}-${c.id}`} className={`hover:bg-indigo-50/30 ${(c as any)._isOffline ? 'bg-amber-50/40' : ''}`}>
                        <TableCell className="text-xs py-2">
                          <div className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${c.type === 'customer' ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                              {c.personType === 'legal' ? <Building2 className={`w-3.5 h-3.5 ${c.type === 'customer' ? 'text-emerald-600' : 'text-amber-600'}`} /> : <User className={`w-3.5 h-3.5 ${c.type === 'customer' ? 'text-emerald-600' : 'text-amber-600'}`} />}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-gray-800 truncate">{c.name}</div>
                              <div className="text-[9px] text-gray-400 flex items-center gap-1" dir="ltr">
                                {c.code}
                                {(c as any)._isOffline && <span className="text-amber-600 font-bold">• آفلاین</span>}
                              </div>
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
                        <TableCell className="text-center text-xs" dir="ltr">{c.mobile || '—'}</TableCell>
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
              </div>
            </>
          )}
        </CardContent>
.      </Card>

      {/* ★ Add/Edit Dialog (ریسپانسیو) */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[calc(100%-1rem)] sm:max-w-[550px] max-h-[90vh] overflow-y-auto rounded-xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingContact ? 'ویرایش طرف حساب' : 'طرف حساب جدید'}</DialogTitle>
          </DialogHeader>
          {/* ... (محتوای فرم شما بدون تغییر باقی بماند) ... */}
          <div className="space-y-3">
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
            {form.personType === 'person' ? (
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">نام <span className="text-red-500">*</span></Label><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="mt-1 h-9" /></div>
                <div><Label className="text-xs">نام خانوادگی</Label><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="mt-1 h-9" /></div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">نام شرکت <span className="text-red-500">*</span></Label><Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} className="mt-1 h-9" /></div>
                <div><Label className="text-xs">نوع شخصیت حقوقی</Label><Input value={form.legalForm} onChange={(e) => setForm({ ...form, legalForm: e.target.value })} className="mt-1 h-9" placeholder="سهامی، مسئولیت محدود..." /></div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">موبایل</Label><Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} className="mt-1 h-9" dir="ltr" /></div>
              <div><Label className="text-xs">{form.personType === 'legal' ? 'شناسه ملی' : 'کد ملی'}</Label><Input value={form.nationalCode} onChange={(e) => setForm({ ...form, nationalCode: e.target.value })} className="mt-1 h-9" dir="ltr" /></div>
            </div>
            {form.personType === 'legal' && (
              <div><Label className="text-xs">کد اقتصادی</Label><Input value={form.economicCode} onChange={(e) => setForm({ ...form, economicCode: e.target.value })} className="mt-1 h-9" dir="ltr" /></div>
            )}
            <div><Label className="text-xs">آدرس</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="mt-1 h-9" /></div>
            <div><Label className="text-xs">سقف اعتبار (ریال)</Label><Input type="number" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} className="mt-1 h-9" dir="ltr" /></div>
            {editingContact && (
              <div className="flex items-center justify-between"><Label className="text-xs">فعال</Label><Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} /></div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="h-9">انصراف</Button>
            <Button onClick={handleSubmit} disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700 gap-1.5 h-9">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {editingContact ? 'ذخیره' : 'ایجاد'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ★ Delete Dialog (ریسپانسیو) */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="w-[calc(100%-1rem)] sm:max-w-[400px] rounded-xl" dir="rtl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-500" /> حذف طرف حساب</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600">آیا از حذف «{deletingContact?.name}» مطمئن هستید؟ {(deletingContact as any)?._isOffline && <span className="block text-amber-600 text-xs mt-1">این طرف حساب آفلاین است و فقط از حافظه محلی حذف می‌شود.</span>}</p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} className="h-9">انصراف</Button>
            <Button onClick={handleDelete} disabled={submitting} className="bg-red-600 hover:bg-red-700 gap-1.5 h-9">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )

}

export default ContactsPage
