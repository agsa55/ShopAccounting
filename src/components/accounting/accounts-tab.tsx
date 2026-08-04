'use client'

// ============================================================================
// src/components/accounting/accounts-tab.tsx — Accounts Tab (Chart of Accounts)
// ShopAccounting v29 — با قابلیت آفلاین کامل + ریسپانسیو
// ============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { 
  cacheAccounts, 
  getCachedAccounts, 
  addAccountToSyncQueue,
  type CachedAccount,
} from '@/lib/offline-db'
import { syncEngine } from '@/lib/sync-engine'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Plus, Search, Loader2, WifiOff, FileText, Eye,
  CheckCircle2, AlertCircle, Save, Pencil, Trash2,
  Clock, RefreshCw, FolderTree, Ban,  // ← Ban اضافه شد
} from 'lucide-react'

import { useToast } from '@/hooks/use-toast'

// ─── Types ────────────────────────────────────────────────────

interface Account {
  id: string
  code: string
  name: string
  type: string
  parentId?: string | null
  isActive: boolean
  balance?: number
  // ★★★ فیلدهای آفلاین
  _offline?: boolean
  _syncStatus?: 'pending' | 'syncing' | 'synced' | 'failed'
  _createdAt?: number
  _lastError?: string
}

// ─── Helpers ──────────────────────────────────────────────────

function getTypeLabel(type: string): string {
  const typeMap: Record<string, string> = {
    'cash': 'صندوق',
    'bank': 'بانک',
    'receivable': 'دریافتنی',
    'payable': 'پرداختنی',
    'inventory': 'موجودی',
    'revenue': 'درآمد',
    'cogs': 'بهای تمام شده',
    'expense': 'هزینه',
    'equity': 'سرمایه',
    'liability': 'بدهی',
    'asset': 'دارایی',
    'دارایی_ثابت': 'دارایی ثابت',
    'کاهنده_دارایی': 'کاهنده دارایی',
    'صندوق': 'صندوق',
    'بانک': 'بانک',
    'دریافتنی': 'دریافتنی',
    'پرداختنی': 'پرداختنی',
    'موجودی': 'موجودی',
    'درآمد': 'درآمد',
    'بهای_تمام_شده': 'بهای تمام شده',
    'هزینه': 'هزینه',
    'سرمایه': 'سرمایه',
    'بدهی': 'بدهی',
  }
  return typeMap[type] || type
}

function getTypeBadgeColor(type: string): string {
  const colorMap: Record<string, string> = {
    'cash': 'bg-emerald-100 text-emerald-700',
    'bank': 'bg-blue-100 text-blue-700',
    'receivable': 'bg-cyan-100 text-cyan-700',
    'payable': 'bg-orange-100 text-orange-700',
    'inventory': 'bg-purple-100 text-purple-700',
    'revenue': 'bg-green-100 text-green-700',
    'cogs': 'bg-red-100 text-red-700',
    'expense': 'bg-rose-100 text-rose-700',
    'equity': 'bg-indigo-100 text-indigo-700',
    'liability': 'bg-amber-100 text-amber-700',
    'asset': 'bg-gray-100 text-gray-700',
    'دارایی_ثابت': 'bg-gray-100 text-gray-700',
    'کاهنده_دارایی': 'bg-gray-200 text-gray-600',
    'صندوق': 'bg-emerald-100 text-emerald-700',
    'بانک': 'bg-blue-100 text-blue-700',
    'دریافتنی': 'bg-cyan-100 text-cyan-700',
    'پرداختنی': 'bg-orange-100 text-orange-700',
    'موجودی': 'bg-purple-100 text-purple-700',
    'درآمد': 'bg-green-100 text-green-700',
    'بهای_تمام_شده': 'bg-red-100 text-red-700',
    'هزینه': 'bg-rose-100 text-rose-700',
    'سرمایه': 'bg-indigo-100 text-indigo-700',
    'بدهی': 'bg-amber-100 text-amber-700',
  }
  return colorMap[type] || 'bg-gray-100 text-gray-700'
}

// ═══════════════════════════════════════════════════════════════
// Main Component — AccountsTab
// ═══════════════════════════════════════════════════════════════

export function AccountsTab() {
  const { toast } = useToast()
  const isOnline = useAppStore((s) => s.isOnline)

  // ─── State: Accounts ──────────────────────────────────────
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  
  // ─── State: Filter ────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')

  // ─── State: Account Dialog (Add/Edit) ─────────────────────
  const [accountFormOpen, setAccountFormOpen] = useState(false)
  const [accountFormMode, setAccountFormMode] = useState<'add' | 'edit'>('add')
  const [accountFormId, setAccountFormId] = useState('')
  const [accountFormCode, setAccountFormCode] = useState('')
  const [accountFormName, setAccountFormName] = useState('')
  const [accountFormType, setAccountFormType] = useState('cash')
  const [accountFormParentId, setAccountFormParentId] = useState('')
  const [accountFormIsActive, setAccountFormIsActive] = useState(true)
  const [accountFormSaving, setAccountFormSaving] = useState(false)

  // ─── State: Delete Dialog ─────────────────────────────────
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null)
  const [deleteSaving, setDeleteSaving] = useState(false)

  // ═══════════════════════════════════════════════════════════
  // ★★★ Load Data (Bulletproof Offline + IndexedDB)
  // ═══════════════════════════════════════════════════════════

  const loadAccounts = useCallback(async () => {
    setLoading(true)
    try {
      // ۱. حالت آفلاین: خواندن از IndexedDB
      if (!isOnline) {
        const cachedAccounts = await getCachedAccounts()
        if (cachedAccounts.length > 0) {
          setAccounts(cachedAccounts as Account[])
          toast({ 
            title: "حالت آفلاین", 
            description: `${cachedAccounts.length} حساب از حافظه محلی بارگذاری شد`, 
            variant: "default" 
          })
        } else {
          setAccounts([])
        }
        setLoading(false)
        return
      }

      // ۲. حالت آنلاین: دریافت از سرور
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/accounts', {
        headers: { 
          'Content-Type': 'application/json', 
          ...(token ? { Authorization: `Bearer ${token}` } : {}) 
        },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success && data.data) {
          const accList = data.data.accounts || data.data || []
          if (Array.isArray(accList)) {
            const formatted = accList.map((a: any) => ({
              id: a.id, 
              code: a.code, 
              name: a.name, 
              type: (a.type || 'asset'),
              parentId: a.parentId || null, 
              isActive: a.isActive !== false, 
              balance: a.balance || 0,
            }))
            setAccounts(formatted)
            // ★★★ ذخیره در IndexedDB برای استفاده در حالت آفلاین
            await cacheAccounts(formatted)
          }
        }
      } else {
        // اگر سرور خطا داد، از کش استفاده کن
        const cachedAccounts = await getCachedAccounts()
        if (cachedAccounts.length > 0) {
          setAccounts(cachedAccounts as Account[])
        }
      }
    } catch (error: any) {
      console.warn("[AccountsTab] Fetch failed, using cached data:", error.message)
      const cachedAccounts = await getCachedAccounts()
      if (cachedAccounts.length > 0) {
        setAccounts(cachedAccounts as Account[])
        toast({ 
          title: "خطای شبکه", 
          description: "نمایش داده‌های ذخیره‌شده محلی", 
          variant: "default" 
        })
      } else {
        setAccounts([])
      }
    } finally {
      setLoading(false)
    }
  }, [isOnline, toast])

  useEffect(() => {
    loadAccounts()
  }, [loadAccounts])

  // ═══════════════════════════════════════════════════════════
  // ★★★ Create/Update Account (با Optimistic UI + SyncQueue)
  // ═══════════════════════════════════════════════════════════

  const handleAccountSave = useCallback(async () => {
    // Validation
    if (!accountFormCode.trim() || !accountFormName.trim()) {
      toast({ title: 'خطا', description: 'کد و نام حساب الزامی است', variant: 'destructive' })
      return
    }

    // بررسی تکراری نبودن کد
    const duplicateCheck = accounts.find(a => a.code === accountFormCode.trim() && a.id !== accountFormId)
    if (duplicateCheck) {
      toast({ title: 'خطا', description: 'کد حساب تکراری است', variant: 'destructive' })
      return
    }

    setAccountFormSaving(true)
    try {
      const newAccount: Account = {
        id: accountFormMode === 'edit' ? accountFormId : `offline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        code: accountFormCode.trim(),
        name: accountFormName.trim(),
        type: accountFormType,
        parentId: accountFormParentId || null,
        isActive: accountFormIsActive,
        // ★★★ فیلدهای آفلاین
        _offline: true,
        _syncStatus: 'pending',
        _createdAt: Date.now(),
      }

      if (accountFormMode === 'edit') {
        // ویرایش حساب موجود
        const updated = accounts.map(a => 
          a.id === accountFormId 
            ? { ...a, code: accountFormCode.trim(), name: accountFormName.trim(), type: accountFormType, parentId: accountFormParentId || null, isActive: accountFormIsActive }
            : a
        )
        setAccounts(updated)
        await cacheAccounts(updated)
        
        // افزودن عملیات update به SyncQueue
        await addAccountToSyncQueue('update', newAccount)
        
        toast({ title: '✓ حساب ویرایش شد', description: isOnline ? 'در حال ارسال به سرور' : 'در صف همگام‌سازی قرار گرفت' })
      } else {
        // ایجاد حساب جدید
        setAccounts(prev => [newAccount, ...prev])
        const updated = [newAccount, ...accounts]
        await cacheAccounts(updated)
        
        // افزودن عملیات create به SyncQueue
        await addAccountToSyncQueue('create', newAccount)
        
        toast({ title: '✓ حساب ایجاد شد', description: isOnline ? 'در حال ارسال به سرور' : 'در صف همگام‌سازی قرار گرفت' })
      }

      // Trigger sync اگر آنلاین هستیم
      if (isOnline) {
        setTimeout(() => syncEngine.sync(), 100)
      }

      // Reset form
      setAccountFormOpen(false)
      setAccountFormMode('add')
      setAccountFormId('')
      setAccountFormCode('')
      setAccountFormName('')
      setAccountFormType('cash')
      setAccountFormParentId('')
      setAccountFormIsActive(true)
    } catch (err: any) {
      console.error('[AccountsTab] Save error:', err)
      toast({ title: 'خطا', description: err.message || 'خطا در ذخیره حساب', variant: 'destructive' })
    } finally {
      setAccountFormSaving(false)
    }
  }, [accountFormMode, accountFormId, accountFormCode, accountFormName, accountFormType, accountFormParentId, accountFormIsActive, accounts, isOnline, toast])

  // ═══════════════════════════════════════════════════════════
  // ★★★ Delete Account
  // ═══════════════════════════════════════════════════════════

  const handleAccountDelete = useCallback(async () => {
    if (!deleteTarget) return

    setDeleteSaving(true)
    try {
      if (deleteTarget._offline) {
        // حساب آفلاین: فقط از لیست محلی حذف کن
        const updated = accounts.filter(a => a.id !== deleteTarget.id)
        setAccounts(updated)
        await cacheAccounts(updated)
        toast({ title: '✓ حذف شد', description: 'حساب آفلاین حذف شد' })
      } else {
        // حساب آنلاین: درخواست به سرور
        if (!isOnline) {
          toast({ title: 'خطا', description: 'حذف حساب آنلاین نیاز به اتصال دارد', variant: 'destructive' })
          setDeleteDialogOpen(false)
          return
        }

        const token = localStorage.getItem('token')
        const res = await fetch(`/api/accounts?id=${deleteTarget.id}`, {
          method: 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })

        if (res.ok) {
          toast({ title: '✓ حذف شد', description: 'حساب با موفقیت حذف شد' })
          await loadAccounts()
        } else {
          const data = await res.json()
          throw new Error(data.error || 'خطا در حذف حساب')
        }
      }

      setDeleteDialogOpen(false)
      setDeleteTarget(null)
    } catch (err: any) {
      toast({ title: 'خطا', description: err.message || 'خطا در حذف حساب', variant: 'destructive' })
    } finally {
      setDeleteSaving(false)
    }
  }, [deleteTarget, accounts, isOnline, toast, loadAccounts])

  // ═══════════════════════════════════════════════════════════
  // Filter & Stats
  // ═══════════════════════════════════════════════════════════

  const filteredAccounts = useMemo(() => {
    let result = accounts
    
    // فیلتر نوع
    if (filterType !== 'all') {
      result = result.filter(a => a.type === filterType)
    }
    
    // فیلتر وضعیت
    if (filterStatus === 'active') {
      result = result.filter(a => a.isActive !== false)
    } else if (filterStatus === 'inactive') {
      result = result.filter(a => a.isActive === false)
    }
    
    // فیلتر جستجو
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      result = result.filter(
        a =>
          a.code.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q)
      )
    }
    
    // مرتب‌سازی بر اساس کد
    return result.sort((a, b) => a.code.localeCompare(b.code))
  }, [accounts, filterType, filterStatus, searchQuery])

  const stats = useMemo(() => {
    const total = accounts.length
    const active = accounts.filter(a => a.isActive !== false).length
    const inactive = accounts.filter(a => a.isActive === false).length
    const offlineCount = accounts.filter(a => a._offline).length
    
    // شمارش بر اساس نوع
    const typeCounts: Record<string, number> = {}
    accounts.forEach(a => {
      typeCounts[a.type] = (typeCounts[a.type] || 0) + 1
    })
    
    return { total, active, inactive, offlineCount, typeCounts }
  }, [accounts])

  // ═══════════════════════════════════════════════════════════
  // Helper: Open Edit Dialog
  // ═══════════════════════════════════════════════════════════

  const openEditDialog = (account: Account) => {
    setAccountFormMode('edit')
    setAccountFormId(account.id)
    setAccountFormCode(account.code)
    setAccountFormName(account.name)
    setAccountFormType(account.type)
    setAccountFormParentId(account.parentId || '')
    setAccountFormIsActive(account.isActive !== false)
    setAccountFormOpen(true)
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  return (
    <div className="space-y-4" dir="rtl">
      {/* ★★★ بنر هشدار آفلاین */}
      {!isOnline && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
          <div className="text-xs text-amber-800">
            <strong>حالت آفلاین فعال است.</strong> حساب‌های جدید در حافظه محلی ذخیره شده و پس از اتصال به سرور ارسال می‌شوند.
          </div>
        </div>
      )}

  {/* ═══════════════════════════════════════════════════════
    Stats Cards — خیلی کوچک و رنگی
═══════════════════════════════════════════════════════ */}
<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1 sm:gap-1.5">
  {/* کل حساب‌ها */}
  <div className="relative overflow-hidden rounded-md border border-blue-200 bg-gradient-to-br from-blue-50 to-white px-2 py-1.5 sm:px-2.5 sm:py-2">
    <div className="flex items-center justify-between gap-1 mb-0.5">
      <span className="text-[8px] sm:text-[9px] font-medium text-blue-600 truncate">کل حساب‌ها</span>
      <FolderTree className="w-2.5 h-2.5 text-blue-400 shrink-0" />
    </div>
    <div className="text-xs sm:text-sm font-bold text-blue-700">{stats.total.toLocaleString('fa-IR')}</div>
  </div>

  {/* فعال */}
  <div className="relative overflow-hidden rounded-md border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white px-2 py-1.5 sm:px-2.5 sm:py-2">
    <div className="flex items-center justify-between gap-1 mb-0.5">
      <span className="text-[8px] sm:text-[9px] font-medium text-emerald-600 truncate">فعال</span>
      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
    </div>
    <div className="text-xs sm:text-sm font-bold text-emerald-700">{stats.active.toLocaleString('fa-IR')}</div>
  </div>

  {/* غیرفعال */}
  <div className="relative overflow-hidden rounded-md border border-red-200 bg-gradient-to-br from-red-50 to-white px-2 py-1.5 sm:px-2.5 sm:py-2">
    <div className="flex items-center justify-between gap-1 mb-0.5">
      <span className="text-[8px] sm:text-[9px] font-medium text-red-600 truncate">غیرفعال</span>
      <Ban className="w-2.5 h-2.5 text-red-400 shrink-0" />
    </div>
    <div className="text-xs sm:text-sm font-bold text-red-700">{stats.inactive.toLocaleString('fa-IR')}</div>
  </div>

  {/* در انتظار sync */}
  {stats.offlineCount > 0 && (
    <div className="relative overflow-hidden rounded-md border border-orange-300 bg-gradient-to-br from-orange-50 to-white px-2 py-1.5 sm:px-2.5 sm:py-2">
      <div className="flex items-center justify-between gap-1 mb-0.5">
        <span className="text-[8px] sm:text-[9px] font-medium text-orange-600 flex items-center gap-0.5 truncate">
          <Clock className="w-2 h-2 shrink-0" /> در انتظار sync
        </span>
      </div>
      <div className="text-xs sm:text-sm font-bold text-orange-700">{stats.offlineCount.toLocaleString('fa-IR')}</div>
    </div>
  )}
</div>

      {/* ═══════════════════════════════════════════════════════
          Toolbar — ریسپانسیو (ستونی در موبایل، ردیفی در دسکتاپ)
      ═══════════════════════════════════════════════════════ */}
      <Card className="border-gray-200">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col lg:flex-row gap-2 sm:gap-3">
            {/* جستجو */}
            <div className="relative flex-1">
              <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="جستجو در کد یا نام حساب..."
                className="pr-8 text-xs h-9"
              />
            </div>

            {/* فیلتر نوع */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full lg:w-44 text-xs h-9 border border-gray-200 rounded px-2 bg-white"
            >
              <option value="all">همه انواع</option>
              <option value="cash">صندوق</option>
              <option value="bank">بانک</option>
              <option value="receivable">دریافتنی</option>
              <option value="payable">پرداختنی</option>
              <option value="inventory">موجودی</option>
              <option value="revenue">درآمد</option>
              <option value="cogs">بهای تمام شده</option>
              <option value="expense">هزینه</option>
              <option value="equity">سرمایه</option>
              <option value="liability">بدهی</option>
              <option value="asset">دارایی</option>
            </select>

            {/* فیلتر وضعیت */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="w-full lg:w-40 text-xs h-9 border border-gray-200 rounded px-2 bg-white"
            >
              <option value="all">همه وضعیت‌ها</option>
              <option value="active">فعال</option>
              <option value="inactive">غیرفعال</option>
            </select>

            {/* دکمه افزودن حساب */}
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9 flex-1 lg:flex-none"
              onClick={() => {
                setAccountFormMode('add')
                setAccountFormId('')
                setAccountFormCode('')
                setAccountFormName('')
                setAccountFormType('cash')
                setAccountFormParentId('')
                setAccountFormIsActive(true)
                setAccountFormOpen(true)
              }}
            >
              <Plus className="w-3.5 h-3.5 ml-1" />
              افزودن حساب
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════
          Loading State
      ═══════════════════════════════════════════════════════ */}
      {loading ? (
        <Card className="border-gray-200">
          <CardContent className="p-12 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-sm text-gray-500">در حال بارگذاری حساب‌ها...</p>
          </CardContent>
        </Card>
      ) : filteredAccounts.length === 0 ? (
        /* ═══════════════════════════════════════════════════════
            Empty State
        ═══════════════════════════════════════════════════════ */
        <Card className="border-dashed border-gray-300">
          <CardContent className="p-12 flex flex-col items-center justify-center gap-3">
            <FolderTree className="w-12 h-12 text-gray-300" />
            <h3 className="text-base font-medium text-gray-600">حسابی یافت نشد</h3>
            <p className="text-sm text-gray-400 text-center max-w-md">
              {accounts.length === 0
                ? 'هنوز هیچ حسابی ثبت نشده است. برای افزودن حساب جدید، روی دکمه «افزودن حساب» کلیک کنید.'
                : 'با فیلترهای فعلی، حسابی یافت نشد. فیلترها را تغییر دهید.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ═══════════════════════════════════════════════════════
              نمای دسکتاپ (جدول) — فقط در lg و بالاتر
          ═══════════════════════════════════════════════════════ */}
          <div className="hidden lg:block">
            <Card className="border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="text-right text-xs w-24">کد</TableHead>
                      <TableHead className="text-right text-xs">نام حساب</TableHead>
                      <TableHead className="text-right text-xs w-32">نوع</TableHead>
                      <TableHead className="text-right text-xs w-24">وضعیت</TableHead>
                      <TableHead className="text-right text-xs w-32">عملیات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAccounts.map((acc) => (
                      <TableRow key={acc.id} className="hover:bg-gray-50/50">
                        <TableCell className="text-xs font-mono">
                          {acc.code}
                          {/* ★★★ نشانگر آفلاین */}
                          {acc._offline && (
                            <Badge className="bg-orange-100 text-orange-700 mr-1 text-[9px]">
                              <Clock className="w-2.5 h-2.5 ml-0.5" />
                              آفلاین
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-medium">{acc.name}</TableCell>
                        <TableCell>
                          <Badge className={getTypeBadgeColor(acc.type)}>
                            {getTypeLabel(acc.type)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {acc.isActive !== false
                            ? <Badge className="bg-emerald-100 text-emerald-700">فعال</Badge>
                            : <Badge className="bg-red-100 text-red-700">غیرفعال</Badge>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                              onClick={() => openEditDialog(acc)}
                              title="ویرایش"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500"
                              onClick={() => { setDeleteTarget(acc); setDeleteDialogOpen(true) }}
                              title="حذف"
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
            </Card>
          </div>

          {/* ═══════════════════════════════════════════════════════
              نمای موبایل (کارت‌ها) — فقط زیر lg
          ═══════════════════════════════════════════════════════ */}
          <div className="lg:hidden space-y-2">
            {filteredAccounts.map((acc) => (
              <Card key={acc.id} className="border-gray-200">
                <CardContent className="p-3">
                  {/* هدر کارت: نام + وضعیت */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">{acc.name}</span>
                      {acc._offline && (
                        <Badge className="bg-orange-100 text-orange-700 text-[9px]">
                          <Clock className="w-2.5 h-2.5 ml-0.5" />
                          آفلاین
                        </Badge>
                      )}
                    </div>
                    {acc.isActive !== false
                      ? <Badge className="bg-emerald-100 text-emerald-700 text-[9px]">فعال</Badge>
                      : <Badge className="bg-red-100 text-red-700 text-[9px]">غیرفعال</Badge>}
                  </div>

                  {/* کد و نوع */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] text-gray-500 font-mono">{acc.code}</span>
                    <Badge className={getTypeBadgeColor(acc.type) + ' text-[9px]'}>
                      {getTypeLabel(acc.type)}
                    </Badge>
                  </div>

                  {/* دکمه‌های عملیات */}
                  <div className="flex gap-2 pt-2 border-t border-gray-100">
                    <Button size="sm" variant="outline" className="text-xs h-7 flex-1"
                      onClick={() => openEditDialog(acc)}
                    >
                      <Pencil className="w-3 h-3 ml-1" /> ویرایش
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-7 text-red-600 border-red-200 hover:bg-red-50 flex-1"
                      onClick={() => { setDeleteTarget(acc); setDeleteDialogOpen(true) }}
                    >
                      <Trash2 className="w-3 h-3 ml-1" /> حذف
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
            {/* ═══════════════════════════════════════════════════════════
          ★★★ Dialog: Account Form (Add/Edit) — ریسپانسیو + fullscreen موبایل
      ═══════════════════════════════════════════════════════════ */}
      <Dialog open={accountFormOpen} onOpenChange={setAccountFormOpen}>
        <DialogContent className="max-w-md w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FolderTree className="w-4 h-4 text-blue-600" />
              {accountFormMode === 'add' ? 'افزودن حساب جدید' : 'ویرایش حساب'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {accountFormMode === 'add' 
                ? 'اطلاعات حساب جدید را وارد کنید' 
                : `ویرایش حساب ${accountFormName}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* کد و نام حساب */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">کد حساب *</Label>
                <Input
                  value={accountFormCode}
                  onChange={(e) => setAccountFormCode(e.target.value)}
                  placeholder="مثلاً: 1010"
                  className="text-xs mt-1 h-9"
                  dir="ltr"
                />
              </div>
              <div>
                <Label className="text-xs">نام حساب *</Label>
                <Input
                  value={accountFormName}
                  onChange={(e) => setAccountFormName(e.target.value)}
                  placeholder="مثلاً: صندوق فروشگاه"
                  className="text-xs mt-1 h-9"
                />
              </div>
            </div>

            {/* نوع حساب */}
            <div>
              <Label className="text-xs">نوع حساب *</Label>
              <select
                value={accountFormType}
                onChange={(e) => setAccountFormType(e.target.value)}
                className="w-full text-xs mt-1 h-9 border border-gray-200 rounded px-2 bg-white"
              >
                <option value="cash">صندوق</option>
                <option value="bank">بانک</option>
                <option value="receivable">دریافتنی</option>
                <option value="payable">پرداختنی</option>
                <option value="inventory">موجودی</option>
                <option value="revenue">درآمد</option>
                <option value="cogs">بهای تمام شده</option>
                <option value="expense">هزینه</option>
                <option value="equity">سرمایه</option>
                <option value="liability">بدهی</option>
                <option value="asset">دارایی</option>
                <option value="دارایی_ثابت">دارایی ثابت</option>
                <option value="کاهنده_دارایی">کاهنده دارایی</option>
              </select>
            </div>

            {/* حساب والد (اختیاری) */}
            <div>
              <Label className="text-xs">حساب والد (اختیاری)</Label>
              <select
                value={accountFormParentId}
                onChange={(e) => setAccountFormParentId(e.target.value)}
                className="w-full text-xs mt-1 h-9 border border-gray-200 rounded px-2 bg-white"
              >
                <option value="">— بدون والد —</option>
                {accounts
                  .filter(a => a.id !== accountFormId) // جلوگیری از انتخاب خود حساب به عنوان والد
                  .map((a) => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                  ))}
              </select>
            </div>

            {/* وضعیت فعال بودن */}
            <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <div>
                <Label className="text-xs font-medium">حساب فعال</Label>
                <p className="text-[10px] text-gray-500 mt-0.5">حساب‌های غیرفعال در تراکنش‌ها قابل انتخاب نیستند</p>
              </div>
              <Switch 
                checked={accountFormIsActive} 
                onCheckedChange={setAccountFormIsActive} 
              />
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setAccountFormOpen(false)} disabled={accountFormSaving} className="w-full sm:w-auto">
              انصراف
            </Button>
            <Button
              onClick={handleAccountSave}
              disabled={accountFormSaving || !accountFormCode.trim() || !accountFormName.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
            >
              {accountFormSaving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Save className="w-4 h-4 ml-1" />}
              {accountFormSaving ? 'در حال ذخیره...' : accountFormMode === 'add' ? 'افزودن حساب' : 'ذخیره تغییرات'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════
          ★★★ Dialog: Delete Confirmation
      ═══════════════════════════════════════════════════════════ */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle className="text-base text-red-600">حذف حساب</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              آیا از حذف حساب <strong>{deleteTarget?.name}</strong> (کد: {deleteTarget?.code}) مطمئن هستید؟ 
              <br />
              <span className="text-red-600 font-medium mt-2 block">⚠️ این عمل غیرقابل بازگشت است.</span>
            </DialogDescription>
          </DialogHeader>

          {/* هشدار اگر حساب در تراکنش‌ها استفاده شده باشد */}
          {deleteTarget && !deleteTarget._offline && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                اگر این حساب در اسناد حسابداری استفاده شده باشد، حذف آن ممکن است با خطا مواجه شود. 
                در این صورت، بهتر است حساب را به جای حذف، غیرفعال کنید.
              </p>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleteSaving} className="w-full sm:w-auto">
              انصراف
            </Button>
            <Button onClick={handleAccountDelete} disabled={deleteSaving} className="bg-red-600 hover:bg-red-700 text-white w-full sm:w-auto">
              {deleteSaving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Trash2 className="w-4 h-4 ml-1" />}
              حذف حساب
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default AccountsTab