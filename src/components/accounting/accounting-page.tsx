'use client'

// ============================================================================
// src/components/accounting/accounting-page.tsx
// ShopAccounting v18.0 — Accounting Page
// ============================================================================
// ★ اصلاح v18:
//   ★ استفاده از plan-features.ts متمرکز بجای PLAN_FEATURES محلی
//   ★ ۳ سطح پلن: پایه (basic) | حرفه‌ای (professional) | سازمانی (enterprise)
//   ★ ایمپورت getFeaturesByPlanName از @/lib/plan-features
//   ★ حذف getPlanTier و PLAN_FEATURES محلی
//   ★ اضافه شدن تب تراز آزمایشی (Trial Balance)
//   ★ تراز آزمایشی: دریافت اسناد، گروه‌بندی بر اساس حساب، نمایش بدهکار/بستانکار
//   ★ بررسی تعادل: مجموع بدهکار = مجموع بستانکار
//   ★ هماهنگ با API جدید journal-entries (بدون رلیشن account)
//   ★ JournalEntry interface شامل lines, sourceType, isManual
//   ★ handlePost از PUT بجای PATCH استفاده می‌کند
//   ★ بهبود نمایش اسناد با اطلاعات کامل‌تر
//   ★ اتصال به /api/journal-entries و /api/accounts
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useStore } from '@/lib/store'
import { getFeaturesByPlanName, resolvePlan } from '@/lib/plan-features'
import { PlanIndicator, TabLock } from '@/components/shared/plan-indicator'
import { PlanBanner } from '@/components/shared/plan-banner'
import { toast } from 'sonner'
import {
  Calculator, Plus, Search, Eye, CheckCircle2, Trash2,
  FileText, BookOpen, ChevronLeft, ChevronDown, X,
  Crown, Lock, Scale
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

// ═══════════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════════

interface Account {
  id: string
  code: string
  name: string
  type: string
  parentId?: string | null
  isActive?: boolean
  _count?: { journalLines: number }
}

interface JournalEntryLine {
  id: string
  accountId: string
  accountName?: string
  accountCode?: string
  debit: number
  credit: number
  description?: string
}

interface JournalEntry {
  id: string
  entryNumber: string
  date: string
  description: string
  sourceType?: string
  sourceId?: string
  isManual?: boolean
  isPosted: boolean
  createdAt: string
  lines: JournalEntryLine[]
}

// ═══════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════

const ACCOUNT_TYPE_MAP: Record<string, string> = {
  asset: 'دارایی',
  liability: 'بدهی',
  equity: 'حقوق صاحبان',
  revenue: 'درآمد',
  expense: 'هزینه',
  income: 'درآمد',
  cost: 'بهای تمام شده',
}

function faNum(n: number): string {
  return n.toLocaleString('fa-IR')
}

function formatDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString('fa-IR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    })
  } catch {
    return d
  }
}

function buildAccountTree(accounts: Account[]): (Account & { children: Account[] })[] {
  const map = new Map<string, Account & { children: Account[] }>()
  const roots: (Account & { children: Account[] })[] = []

  for (const a of accounts) {
    map.set(a.id, { ...a, children: [] })
  }

  for (const a of accounts) {
    const node = map.get(a.id)!
    if (a.parentId && map.has(a.parentId)) {
      map.get(a.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
}

// ═══════════════════════════════════════════════════════════════
//  New Journal Line Type
// ═══════════════════════════════════════════════════════════════

interface NewLine {
  accountId: string
  debit: number
  credit: number
  description: string
}

// ═══════════════════════════════════════════════════════════════
//  Trial Balance Row
// ═══════════════════════════════════════════════════════════════

interface TrialBalanceRow {
  accountId: string
  accountCode: string
  accountName: string
  accountType: string
  totalDebit: number
  totalCredit: number
}

// ═══════════════════════════════════════════════════════════════
//  AccountingPage Component
// ═══════════════════════════════════════════════════════════════

export default function AccountingPage() {
  // ★ plan features از منبع متمرکز
  const planName = useStore((s) => s.planName)
  const planFeatures = useMemo(() => getFeaturesByPlanName(planName), [planName])
  const plan = useMemo(() => resolvePlan(planName), [planName])

  const token = useStore((s) => s.token)
  const tenantId = useStore((s) => s.tenantId)
  const setCurrentView = useStore((s) => s.setCurrentView)
  const handleUpgrade = useCallback(() => setCurrentView('upgrade-plan'), [setCurrentView])

  // ─── State ──────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('journals')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [journals, setJournals] = useState<JournalEntry[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)

  // ─── Journal detail dialog ──────────────────────────────────
  const [detailEntry, setDetailEntry] = useState<JournalEntry | null>(null)

  // ─── Create journal dialog ──────────────────────────────────
  const [showCreate, setShowCreate] = useState(false)
  const [newDesc, setNewDesc] = useState('')
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [newLines, setNewLines] = useState<NewLine[]>([
    { accountId: '', debit: 0, credit: 0, description: '' },
    { accountId: '', debit: 0, credit: 0, description: '' },
  ])
  const [creating, setCreating] = useState(false)

  // ─── Delete journal dialog ──────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<JournalEntry | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ─── Trial Balance State ────────────────────────────────────
  const [trialBalanceData, setTrialBalanceData] = useState<TrialBalanceRow[]>([])
  const [trialLoading, setTrialLoading] = useState(false)

  // ═══════════════════════════════════════════════════════════════
  //  Data Fetching
  // ═══════════════════════════════════════════════════════════════

  const fetchAccounts = useCallback(async () => {
    if (!token || !tenantId) return
    try {
      const res = await fetch('/api/accounts', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setAccounts(Array.isArray(data) ? data : data.accounts ?? [])
      }
    } catch {
      toast.error('خطا در دریافت حساب‌ها')
    }
  }, [token, tenantId])

  const fetchJournals = useCallback(async () => {
    if (!token || !tenantId) return
    setLoading(true)
    try {
      const res = await fetch('/api/journal-entries', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setJournals(Array.isArray(data) ? data : data.entries ?? [])
      }
    } catch {
      toast.error('خطا در دریافت اسناد حسابداری')
    } finally {
      setLoading(false)
    }
  }, [token, tenantId])

  const fetchTrialBalance = useCallback(async () => {
    if (!token || !tenantId) return
    setTrialLoading(true)
    try {
      const res = await fetch('/api/journal-entries?type=all', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        const allEntries: JournalEntry[] = Array.isArray(data) ? data : data.entries ?? []

        // ★ گروه‌بندی خطوط بر اساس حساب
        const accountMap = new Map<string, TrialBalanceRow>()

        for (const entry of allEntries) {
          for (const line of entry.lines ?? []) {
            const key = line.accountId
            if (!accountMap.has(key)) {
              // پیدا کردن نام و کد حساب از لیست accounts
              const acct = accounts.find(a => a.id === line.accountId)
              accountMap.set(key, {
                accountId: key,
                accountCode: line.accountCode ?? acct?.code ?? '—',
                accountName: line.accountName ?? acct?.name ?? 'نامشخص',
                accountType: acct?.type ?? '—',
                totalDebit: 0,
                totalCredit: 0,
              })
            }
            const row = accountMap.get(key)!
            row.totalDebit += line.debit ?? 0
            row.totalCredit += line.credit ?? 0
          }
        }

        setTrialBalanceData(Array.from(accountMap.values()))
      } else {
        toast.error('خطا در دریافت اطلاعات تراز آزمایشی')
      }
    } catch {
      toast.error('خطا در دریافت اطلاعات تراز آزمایشی')
    } finally {
      setTrialLoading(false)
    }
  }, [token, tenantId, accounts])

  useEffect(() => {
    fetchJournals()
    fetchAccounts()
  }, [fetchJournals, fetchAccounts])

  // ★ بارگذاری تراز آزمایشی وقتی تب فعال بشه
  useEffect(() => {
    if (activeTab === 'trial-balance' && planFeatures.canTrialBalance) {
      fetchTrialBalance()
    }
  }, [activeTab, planFeatures.canTrialBalance, fetchTrialBalance])

  // ═══════════════════════════════════════════════════════════════
  //  Actions
  // ═══════════════════════════════════════════════════════════════

  const handlePost = async (entry: JournalEntry) => {
    if (!token) return
    try {
      const res = await fetch(`/api/journal-entries/${entry.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isPosted: true }),
      })
      if (res.ok) {
        toast.success('سند با موفقیت ثبت شد')
        fetchJournals()
      } else {
        toast.error('خطا در ثبت سند')
      }
    } catch {
      toast.error('خطا در ثبت سند')
    }
  }

  const handleCreate = async () => {
    if (!token) return

    // اعتبارسنجی
    const validLines = newLines.filter(l => l.accountId && (l.debit > 0 || l.credit > 0))
    if (validLines.length < 2) {
      toast.error('حداقل ۲ خط سند با حساب و مبلغ وارد کنید')
      return
    }

    const totalDebit = validLines.reduce((s, l) => s + l.debit, 0)
    const totalCredit = validLines.reduce((s, l) => s + l.credit, 0)
    if (totalDebit !== totalCredit) {
      toast.error('مجموع بدهکار و بستانکار باید برابر باشد')
      return
    }

    setCreating(true)
    try {
      const res = await fetch('/api/journal-entries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          date: newDate,
          description: newDesc,
          isManual: true,
          lines: validLines.map(l => ({
            accountId: l.accountId,
            debit: l.debit,
            credit: l.credit,
            description: l.description,
          })),
        }),
      })
      if (res.ok) {
        toast.success('سند دستی با موفقیت ایجاد شد')
        setShowCreate(false)
        resetCreateForm()
        fetchJournals()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'خطا در ایجاد سند')
      }
    } catch {
      toast.error('خطا در ایجاد سند')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget || !token) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/journal-entries/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        toast.success('سند حذف شد')
        setDeleteTarget(null)
        fetchJournals()
      } else {
        toast.error('خطا در حذف سند')
      }
    } catch {
      toast.error('خطا در حذف سند')
    } finally {
      setDeleting(false)
    }
  }

  const resetCreateForm = () => {
    setNewDesc('')
    setNewDate(new Date().toISOString().slice(0, 10))
    setNewLines([
      { accountId: '', debit: 0, credit: 0, description: '' },
      { accountId: '', debit: 0, credit: 0, description: '' },
    ])
  }

  // ═══════════════════════════════════════════════════════════════
  //  Computed
  // ═══════════════════════════════════════════════════════════════

  const filteredJournals = journals.filter(j => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      j.entryNumber?.toLowerCase().includes(q) ||
      j.description?.toLowerCase().includes(q) ||
      j.sourceType?.toLowerCase().includes(q) ||
      j.lines?.some(l =>
        l.accountName?.toLowerCase().includes(q) ||
        l.accountCode?.toLowerCase().includes(q)
      )
    )
  })

  const accountTree = useMemo(() => buildAccountTree(accounts), [accounts])

  // ★ تراز آزمایشی — محاسبه جمع کل
  const trialGrandDebit = useMemo(
    () => trialBalanceData.reduce((s, r) => s + r.totalDebit, 0),
    [trialBalanceData]
  )
  const trialGrandCredit = useMemo(
    () => trialBalanceData.reduce((s, r) => s + r.totalCredit, 0),
    [trialBalanceData]
  )
  const isBalanced = Math.abs(trialGrandDebit - trialGrandCredit) < 1

  // ═══════════════════════════════════════════════════════════════
  //  Render Helpers
  // ═══════════════════════════════════════════════════════════════

  const renderAccountRows = (
    items: (Account & { children: Account[] })[],
    depth = 0
  ): React.ReactNode[] => {
    const rows: React.ReactNode[] = []
    for (const item of items) {
      const typeLabel = ACCOUNT_TYPE_MAP[item.type] ?? item.type
      rows.push(
        <TableRow key={item.id}>
          <TableCell className="font-mono text-sm" style={{ paddingRight: `${depth * 24 + 16}px` }}>
            {item.code}
          </TableCell>
          <TableCell style={{ paddingRight: `${depth * 8}px` }}>
            {depth > 0 && <span className="text-muted-foreground ml-1">└</span>}
            {item.name}
          </TableCell>
          <TableCell>
            <Badge variant="outline" className="text-xs">
              {typeLabel}
            </Badge>
          </TableCell>
          <TableCell className="text-center">
            {item._count?.journalLines ?? 0}
          </TableCell>
          <TableCell className="text-center">
            {item.isActive !== false ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
            ) : (
              <X className="h-4 w-4 text-red-400 mx-auto" />
            )}
          </TableCell>
        </TableRow>
      )
      if (item.children?.length) {
        rows.push(...renderAccountRows(
          item.children.map(c => ({ ...c, children: (accounts.filter(a => a.parentId === c.id)) as Account[] })),
          depth + 1
        ))
      }
    }
    return rows
  }

  const getSourceTypeLabel = (sourceType?: string): string => {
    if (!sourceType) return 'دستی'
    switch (sourceType) {
      case 'invoice': return 'فاکتور'
      case 'payment': return 'پرداخت'
      case 'receipt': return 'دریافت'
      case 'expense': return 'هزینه'
      case 'manual': return 'دستی'
      default: return sourceType
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  Upgrade Prompt Component
  // ═══════════════════════════════════════════════════════════════

  const UpgradePrompt = ({ feature }: { feature: string }) => (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-4">
        <Lock className="h-8 w-8 text-amber-500" />
      </div>
      <h3 className="text-lg font-semibold mb-2">{feature}</h3>
      <p className="text-muted-foreground mb-4 max-w-sm">
        {planFeatures.upgradeMessage}
      </p>
      <Button
        variant="default"
        className="gap-2"
        onClick={() => setCurrentView('upgrade-plan')}
      >
        <Crown className="h-4 w-4" />
        ارتقا پلن
      </Button>
    </div>
  )

  // ═══════════════════════════════════════════════════════════════
  //  Render
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="h-full flex flex-col" dir="rtl">
      {/* ─── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentView('dashboard')}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Calculator className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold">حسابداری</h1>
        </div>

        {planFeatures.canCreateJournal && (
          <Button
            size="sm"
            className="gap-1"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="h-4 w-4" />
            سند دستی
          </Button>
        )}
      </div>

      {/* ─── ★ v26: PlanBanner — بنر برجسته پلن ★ ─── */}
      <div className="px-4 pt-3">
        <PlanBanner onUpgrade={handleUpgrade} />
      </div>

      {/* ─── ★ v19: PlanIndicator — نشانگر واضح پلن ★ ─── */}
      <div className="px-4 pt-3">
        <PlanIndicator
          showLockedFeatures={true}
          onUpgrade={handleUpgrade}
        />
      </div>

      {/* ─── Tabs ────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="border-b px-4">
          <TabsList className="h-10">
            {/* ★ تب اسناد — همیشه قابل مشاهده */}
            <TabsTrigger value="journals" className="gap-1 text-xs">
              <FileText className="h-3.5 w-3.5" />
              اسناد
            </TabsTrigger>

            {/* ★ تب چارت حساب‌ها — اگه قفل باشه با آیکون قفل */}
            <TabsTrigger value="accounts" className={`gap-1 text-xs ${!planFeatures.canViewAccounts ? 'opacity-50' : ''}`}>
              {planFeatures.canViewAccounts ? (
                <BookOpen className="h-3.5 w-3.5" />
              ) : (
                <Lock className="h-3.5 w-3.5 text-amber-500" />
              )}
              چارت حساب‌ها
            </TabsTrigger>

            {/* ★ تب تراز آزمایشی — اگه قفل باشه با آیکون قفل */}
            <TabsTrigger value="trial-balance" className={`gap-1 text-xs ${!planFeatures.canTrialBalance ? 'opacity-50' : ''}`}>
              {planFeatures.canTrialBalance ? (
                <Scale className="h-3.5 w-3.5" />
              ) : (
                <Lock className="h-3.5 w-3.5 text-amber-500" />
              )}
              تراز آزمایشی
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ─── Journals Tab ──────────────────────────────────── */}
        {planFeatures.canViewJournals && (
          <TabsContent value="journals" className="flex-1 overflow-auto m-0">
            <div className="p-4 space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="جستجو در اسناد (شماره، شرح، حساب)..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pr-9"
                />
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full ml-2" />
                  در حال بارگذاری...
                </div>
              ) : filteredJournals.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>سند حسابداری یافت نشد</p>
                  {planFeatures.canCreateJournal && (
                    <p className="text-sm mt-1">
                      با ایجاد فاکتور یا سند دستی، اسناد حسابداری خودکار ثبت می‌شوند
                    </p>
                  )}
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[100px]">شماره</TableHead>
                        <TableHead className="w-[100px]">تاریخ</TableHead>
                        <TableHead>شرح</TableHead>
                        <TableHead className="w-[100px]">منبع</TableHead>
                        <TableHead className="w-[80px] text-center">بدهکار</TableHead>
                        <TableHead className="w-[80px] text-center">بستانکار</TableHead>
                        <TableHead className="w-[80px] text-center">وضعیت</TableHead>
                        <TableHead className="w-[80px] text-center">عملیات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredJournals.map(entry => {
                        const totalDebit = entry.lines?.reduce((s, l) => s + (l.debit ?? 0), 0) ?? 0
                        const totalCredit = entry.lines?.reduce((s, l) => s + (l.credit ?? 0), 0) ?? 0

                        return (
                          <TableRow key={entry.id}>
                            <TableCell className="font-mono text-xs">
                              {entry.entryNumber}
                            </TableCell>
                            <TableCell className="text-xs">
                              {formatDate(entry.date)}
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate text-sm">
                              {entry.description}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {getSourceTypeLabel(entry.sourceType)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center font-mono text-xs">
                              {faNum(totalDebit)}
                            </TableCell>
                            <TableCell className="text-center font-mono text-xs">
                              {faNum(totalCredit)}
                            </TableCell>
                            <TableCell className="text-center">
                              {entry.isPosted ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                              ) : (
                                <Badge variant="secondary" className="text-xs">
                                  پیش‌نویس
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => setDetailEntry(entry)}
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                {!entry.isPosted && planFeatures.canCreateJournal && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-emerald-600"
                                    onClick={() => handlePost(entry)}
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {entry.isManual && planFeatures.canCreateJournal && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-red-500"
                                    onClick={() => setDeleteTarget(entry)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </TabsContent>
        )}

        {/* ─── Accounts Tab ──────────────────────────────────── */}
        <TabsContent value="accounts" className="flex-1 overflow-auto m-0">
          {planFeatures.canViewAccounts ? (
            <div className="p-4">
              {accounts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>حسابی یافت نشد</p>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[100px]">کد</TableHead>
                        <TableHead>نام حساب</TableHead>
                        <TableHead className="w-[120px]">نوع</TableHead>
                        <TableHead className="w-[80px] text-center">تعداد سند</TableHead>
                        <TableHead className="w-[80px] text-center">فعال</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {renderAccountRows(accountTree)}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          ) : (
            <TabLock featureLabel="چارت حساب‌ها" onUpgrade={handleUpgrade} />
          )}
        </TabsContent>

        {/* ─── Trial Balance Tab ─────────────────────────────── */}
        <TabsContent value="trial-balance" className="flex-1 overflow-auto m-0">
          {planFeatures.canTrialBalance ? (
            <div className="p-4 space-y-4">
              {trialLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full ml-2" />
                  در حال بارگذاری تراز آزمایشی...
                </div>
              ) : trialBalanceData.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Scale className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>داده‌ای برای تراز آزمایشی یافت نشد</p>
                  <p className="text-sm mt-1">پس از ثبت اسناد حسابداری، تراز آزمایشی نمایش داده می‌شود</p>
                </div>
              ) : (
                <>
                  {/* خلاصه تراز */}
                  <Card className={
                    isBalanced
                      ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30'
                      : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30'
                  }>
                    <CardContent className="flex items-center justify-between py-4">
                      <div className="flex items-center gap-3">
                        {isBalanced ? (
                          <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                        ) : (
                          <X className="h-6 w-6 text-red-500" />
                        )}
                        <div>
                          <p className="font-semibold text-sm">
                            {isBalanced ? 'تراز متعادل است' : 'تراز نامتعادل!'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {isBalanced
                              ? 'مجموع بدهکار با مجموع بستانکار برابر است'
                              : `اختلاف: ${faNum(Math.abs(trialGrandDebit - trialGrandCredit))} ریال`
                            }
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-6 text-sm">
                        <div className="text-center">
                          <p className="text-muted-foreground text-xs">جمع بدهکار</p>
                          <p className="font-mono font-semibold">{faNum(trialGrandDebit)}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-muted-foreground text-xs">جمع بستانکار</p>
                          <p className="font-mono font-semibold">{faNum(trialGrandCredit)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* جدول تراز آزمایشی */}
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[100px]">کد حساب</TableHead>
                          <TableHead>نام حساب</TableHead>
                          <TableHead className="w-[120px]">نوع</TableHead>
                          <TableHead className="w-[120px] text-center">جمع بدهکار</TableHead>
                          <TableHead className="w-[120px] text-center">جمع بستانکار</TableHead>
                          <TableHead className="w-[120px] text-center">مانده</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {trialBalanceData.map(row => {
                          const balance = row.totalDebit - row.totalCredit
                          const balanceLabel = balance > 0
                            ? `${faNum(balance)} بد`
                            : balance < 0
                              ? `${faNum(Math.abs(balance))} بس`
                              : '—'
                          return (
                            <TableRow key={row.accountId}>
                              <TableCell className="font-mono text-xs">
                                {row.accountCode}
                              </TableCell>
                              <TableCell className="text-sm">
                                {row.accountName}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">
                                  {ACCOUNT_TYPE_MAP[row.accountType] ?? row.accountType}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center font-mono text-xs">
                                {faNum(row.totalDebit)}
                              </TableCell>
                              <TableCell className="text-center font-mono text-xs">
                                {faNum(row.totalCredit)}
                              </TableCell>
                              <TableCell className="text-center font-mono text-xs">
                                {balanceLabel}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                        {/* ردیف جمع کل */}
                        <TableRow className="bg-muted/50 font-semibold">
                          <TableCell colSpan={3} className="text-sm">
                            جمع کل
                          </TableCell>
                          <TableCell className="text-center font-mono text-xs">
                            {faNum(trialGrandDebit)}
                          </TableCell>
                          <TableCell className="text-center font-mono text-xs">
                            {faNum(trialGrandCredit)}
                          </TableCell>
                          <TableCell className="text-center font-mono text-xs">
                            {isBalanced ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                            ) : (
                              <span className="text-red-500">
                                {faNum(Math.abs(trialGrandDebit - trialGrandCredit))}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </div>
          ) : (
            <TabLock featureLabel="تراز آزمایشی" onUpgrade={handleUpgrade} />
          )}
        </TabsContent>

        {/* ─── Default Tab when no feature available ─────────── */}
        {!planFeatures.canViewJournals && !planFeatures.canViewAccounts && !planFeatures.canTrialBalance && (
          <div className="flex-1 flex items-center justify-center">
            <TabLock featureLabel="حسابداری" onUpgrade={handleUpgrade} />
          </div>
        )}
      </Tabs>

      {/* ═══════════════════════════════════════════════════════════════
          Journal Detail Dialog
          ═══════════════════════════════════════════════════════════════ */}
      <Dialog open={!!detailEntry} onOpenChange={() => setDetailEntry(null)}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              جزئیات سند {detailEntry?.entryNumber}
            </DialogTitle>
          </DialogHeader>

          {detailEntry && (
            <div className="space-y-4">
              {/* اطلاعات سند */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">شماره:</span>{' '}
                  <span className="font-mono">{detailEntry.entryNumber}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">تاریخ:</span>{' '}
                  {formatDate(detailEntry.date)}
                </div>
                <div>
                  <span className="text-muted-foreground">منبع:</span>{' '}
                  <Badge variant="outline" className="text-xs">
                    {getSourceTypeLabel(detailEntry.sourceType)}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">وضعیت:</span>{' '}
                  {detailEntry.isPosted ? (
                    <Badge className="bg-emerald-100 text-emerald-700 text-xs">ثبت شده</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">پیش‌نویس</Badge>
                  )}
                </div>
              </div>

              {detailEntry.description && (
                <div className="text-sm">
                  <span className="text-muted-foreground">شرح:</span>{' '}
                  {detailEntry.description}
                </div>
              )}

              {/* خطوط سند */}
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">حساب</TableHead>
                      <TableHead className="w-[100px] text-center text-xs">بدهکار</TableHead>
                      <TableHead className="w-[100px] text-center text-xs">بستانکار</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailEntry.lines?.map(line => (
                      <TableRow key={line.id}>
                        <TableCell className="text-xs">
                          <span className="font-mono text-muted-foreground ml-1">
                            {line.accountCode}
                          </span>
                          {line.accountName}
                        </TableCell>
                        <TableCell className="text-center font-mono text-xs">
                          {line.debit > 0 ? faNum(line.debit) : '—'}
                        </TableCell>
                        <TableCell className="text-center font-mono text-xs">
                          {line.credit > 0 ? faNum(line.credit) : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50 font-semibold">
                      <TableCell className="text-xs">جمع</TableCell>
                      <TableCell className="text-center font-mono text-xs">
                        {faNum(detailEntry.lines?.reduce((s, l) => s + (l.debit ?? 0), 0) ?? 0)}
                      </TableCell>
                      <TableCell className="text-center font-mono text-xs">
                        {faNum(detailEntry.lines?.reduce((s, l) => s + (l.credit ?? 0), 0) ?? 0)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════
          Create Journal Dialog
          ═══════════════════════════════════════════════════════════════ */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              ایجاد سند دستی
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* شرح و تاریخ */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>تاریخ</Label>
                <Input
                  type="date"
                  value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>شرح سند</Label>
                <Input
                  placeholder="شرح سند..."
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                />
              </div>
            </div>

            {/* خطوط سند */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>خطوط سند</Label>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-xs"
                  onClick={() =>
                    setNewLines(prev => [
                      ...prev,
                      { accountId: '', debit: 0, credit: 0, description: '' },
                    ])
                  }
                >
                  <Plus className="h-3 w-3" />
                  خط جدید
                </Button>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {newLines.map((line, idx) => {
                  const lineDebit = newLines.reduce((s, l) => s + l.debit, 0)
                  const lineCredit = newLines.reduce((s, l) => s + l.credit, 0)

                  return (
                    <div key={idx} className="flex items-end gap-2 p-2 border rounded-lg">
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs text-muted-foreground">حساب</Label>
                        <Select
                          value={line.accountId}
                          onValueChange={val =>
                            setNewLines(prev =>
                              prev.map((l, i) => (i === idx ? { ...l, accountId: val } : l))
                            )
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="انتخاب حساب" />
                          </SelectTrigger>
                          <SelectContent>
                            {accounts.map(a => (
                              <SelectItem key={a.id} value={a.id}>
                                <span className="font-mono ml-1">{a.code}</span>
                                {a.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="w-24 space-y-1">
                        <Label className="text-xs text-muted-foreground">بدهکار</Label>
                        <Input
                          type="number"
                          min={0}
                          className="h-8 text-xs"
                          value={line.debit || ''}
                          onChange={e =>
                            setNewLines(prev =>
                              prev.map((l, i) =>
                                i === idx ? { ...l, debit: Number(e.target.value) || 0 } : l
                              )
                            )
                          }
                        />
                      </div>

                      <div className="w-24 space-y-1">
                        <Label className="text-xs text-muted-foreground">بستانکار</Label>
                        <Input
                          type="number"
                          min={0}
                          className="h-8 text-xs"
                          value={line.credit || ''}
                          onChange={e =>
                            setNewLines(prev =>
                              prev.map((l, i) =>
                                i === idx ? { ...l, credit: Number(e.target.value) || 0 } : l
                              )
                            )
                          }
                        />
                      </div>

                      <div className="flex-1 space-y-1">
                        <Label className="text-xs text-muted-foreground">شرح</Label>
                        <Input
                          className="h-8 text-xs"
                          placeholder="شرح خط"
                          value={line.description}
                          onChange={e =>
                            setNewLines(prev =>
                              prev.map((l, i) =>
                                i === idx ? { ...l, description: e.target.value } : l
                              )
                            )
                          }
                        />
                      </div>

                      {newLines.length > 2 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-red-500"
                          onClick={() =>
                            setNewLines(prev => prev.filter((_, i) => i !== idx))
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* جمع خطوط */}
              <div className="flex items-center justify-between text-sm px-2 py-1 bg-muted/50 rounded">
                <span>جمع بدهکار: <span className="font-mono">{faNum(newLines.reduce((s, l) => s + l.debit, 0))}</span></span>
                <span>جمع بستانکار: <span className="font-mono">{faNum(newLines.reduce((s, l) => s + l.credit, 0))}</span></span>
                {newLines.reduce((s, l) => s + l.debit, 0) === newLines.reduce((s, l) => s + l.credit, 0) ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <X className="h-4 w-4 text-red-500" />
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowCreate(false)
                resetCreateForm()
              }}
            >
              انصراف
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full ml-1" />
                  در حال ایجاد...
                </>
              ) : (
                'ایجاد سند'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════
          Delete Confirmation Dialog
          ═══════════════════════════════════════════════════════════════ */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف سند دستی</AlertDialogTitle>
            <AlertDialogDescription>
              آیا از حذف سند <span className="font-mono font-semibold">{deleteTarget?.entryNumber}</span> اطمینان دارید؟
              این عمل قابل بازگشت نیست.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? 'در حال حذف...' : 'حذف سند'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
