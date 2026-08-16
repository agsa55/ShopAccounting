'use client'

// ============================================================================
// src/components/settings/initial-balance-tab.tsx
// ShopAccounting — تب راه‌اندازی اولیه (سند افتتاحیه)
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useToast } from '@/hooks/use-toast'
import { getTenantIdFromStore } from '@/lib/tenant-utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'
import {
  Wallet, Plus, Pencil, Trash2, Loader2, CheckCircle2, AlertCircle,
  AlertTriangle, Save, TrendingUp, TrendingDown,
} from 'lucide-react'

export function InitialBalanceTab() {
  const { toast } = useToast()

  const [savedItems, setSavedItems] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const [pendingItems, setPendingItems] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])

  const [form, setForm] = useState({
    type: 'cash',
    title: '',
    amount: '',
    productId: '',
    quantity: '',
    description: '',
  })

   const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const tid = getTenantIdFromStore()
      if (!tid) return

      const token = typeof window !== 'undefined'
        ? localStorage.getItem('token')
        : null
      const headers = token
        ? { Authorization: `Bearer ${token}` }
        : undefined

      // ★★★ اصلاح: حذف tenantId از URL محصولات
      const [balRes, prodRes, journalRes] = await Promise.all([
        fetch('/api/initial-balance', { ...(headers && { headers }) }),
        fetch('/api/products?limit=100', { ...(headers && { headers }) }),
        // ★ v10.9.2: Fallback — fetch JournalEntries برای بازیابی InitialBalance
        fetch('/api/journal-entries?sourceType=initial_balance&limit=10', { ...(headers && { headers }) }),
      ])
      
      const balData = await balRes.json()
      const prodData = await prodRes.json()
      const journalData = await journalRes.json()

      if (balData.success) {
        let apiItems = Array.isArray(balData.data) ? balData.data : []
        
        // ═══════════════════════════════════════════════════════════════
        // ★ v10.9.2: Fallback — اگر InitialBalances خالی است ولی JournalEntry هست
        // از JournalEntry، InitialBalance را بازیابی کن
        // ═══════════════════════════════════════════════════════════════
        if (apiItems.length === 0 && journalData.success && journalData.data?.entries?.length > 0) {
          console.log('[InitialBalanceTab] ⚠️ InitialBalances empty but JournalEntries found — recovering...')
          
          const openingJE = journalData.data.entries.find((e: any) => 
            e.sourceType === 'initial_balance'
          )
          
          if (openingJE && openingJE.lines && openingJE.lines.length > 0) {
            // از lines سند، InitialBalance بساز
            apiItems = openingJE.lines.map((line: any, idx: number) => ({
              id: `recovered-${idx}`,
              type: line.debit > 0 ? 'cash' : 'liability', // حدس نوع
              title: line.description || line.accountName || `آیتم ${idx + 1}`,
              amount: Math.abs(line.debit || line.credit || 0),
              debitAmount: line.debit || 0,
              creditAmount: line.credit || 0,
              description: line.description,
              journalEntryId: openingJE.id,
              isPosted: true,
              accountCode: line.accountCode,
              accountName: line.accountName,
              _recovered: true,
            }))
            
            console.log('[InitialBalanceTab] ✅ Recovered', apiItems.length, 'items from JournalEntry')
          }
        }
        
        setSavedItems(apiItems)

        if (balData.summary && apiItems.length > 0 && !balData.summary?.isPosted) {
          setSummary(balData.summary)
        } else if (apiItems.length > 0) {
          const assets = apiItems
            .filter((b: any) =>
              ['cash', 'bank', 'inventory', 'fixed_asset'].includes(b.type)
            )
            .reduce((s: number, b: any) => s + (b.amount || 0), 0)
          const liabs = apiItems
            .filter((b: any) => b.type === 'liability')
            .reduce((s: number, b: any) => s + (b.amount || 0), 0)
          setSummary({
            isPosted: apiItems.some((b: any) => b.isPosted),
            journalEntryId: apiItems.find((b: any) => b.journalEntryId)
              ?.journalEntryId,
            totalAssets: assets,
            totalLiabilities: liabs,
            equity: assets - liabs,
            count: apiItems.length,
          })
        } else {
          setSummary(null)
        }

        setPendingItems([])
      }

      if (prodData.success) {
        const prods = Array.isArray(prodData.data)
          ? prodData.data
          : prodData.data?.products || []
        setProducts(prods)
      }
    } catch (err) {
      console.error('[InitialBalanceTab] Load error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleAddItem = () => {
    if (!form.title.trim()) {
      toast({
        title: 'خطا',
        description: 'عنوان الزامی است',
        variant: 'destructive',
      })
      return
    }
    const amt = Number(form.amount)
    if (!form.amount || amt <= 0) {
      toast({
        title: 'خطا',
        description: 'مبلغ باید بزرگتر از صفر باشد',
        variant: 'destructive',
      })
      return
    }
    if (form.type === 'inventory' && !form.productId) {
      toast({
        title: 'خطا',
        description: 'برای موجودی کالا، انتخاب محصول الزامی است',
        variant: 'destructive',
      })
      return
    }

    const selectedProduct = form.productId
      ? products.find((p) => p.id === form.productId)
      : null

    setPendingItems((prev) => [
      ...prev,
      {
        type: form.type,
        title: form.title.trim(),
        amount: amt,
        productId: form.productId || null,
        quantity: form.quantity ? Number(form.quantity) : null,
        description: form.description.trim() || null,
        Product: selectedProduct,
      },
    ])

    setForm({
      type: 'cash',
      title: '',
      amount: '',
      productId: '',
      quantity: '',
      description: '',
    })
  }

  const handleSave = async (postToJournal: boolean = false) => {
    if (pendingItems.length === 0) {
      toast({
        title: 'خطا',
        description: 'حداقل یک آیتم اضافه کنید',
        variant: 'destructive',
      })
      return
    }

    setSubmitting(true)
    try {
      const token = typeof window !== 'undefined'
        ? localStorage.getItem('token')
        : null

        // ★ v10.9.6: ارسال accountId برای حفظ ارتباط با حساب
    const allItems = [
      ...savedItems
        .filter((b) => !summary?.isPosted)
        .map((b) => ({
          type: b.type,
          title: b.title,
          amount: b.amount,
          accountId: b.accountId || undefined,
          productId: b.productId || undefined,
          quantity: b.quantity || undefined,
          description: b.description || undefined,
        })),
      ...pendingItems.map((b) => ({
        type: b.type,
        title: b.title,
        amount: b.amount,
        accountId: b.accountId || undefined,
        productId: b.productId || undefined,
        quantity: b.quantity || undefined,
        description: b.description || undefined,
      })),
    ]

      const res = await fetch('/api/initial-balance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          items: allItems,
          postToJournal,
        }),
      })
      const data = await res.json()

      if (data.success) {
        toast({
          title: postToJournal ? 'سند افتتاحیه صادر شد ✓' : 'ذخیره شد ✓',
          description: data.message,
        })
        await loadData()
      } else {
        toast({
          title: 'خطا',
          description: data.error || 'ثبت ناموفق بود',
          variant: 'destructive',
        })
      }
    } catch (err) {
      toast({
        title: 'خطا',
        description: 'ارتباط با سرور برقرار نشد',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    setSubmitting(true)
    try {
      const token = typeof window !== 'undefined'
        ? localStorage.getItem('token')
        : null

      // ★ v10.9.7: اگر سند صادر شده، force=true ارسال کن
      const forceParam = summary?.isPosted ? '?force=true' : ''

      const res = await fetch(`/api/initial-balance${forceParam}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      const data = await res.json()
      if (data.success) {
        toast({
          title: 'حذف شد ✓',
          description: data.message,
        })
        setSavedItems([])
        setSummary(null)
        setPendingItems([])
        setDeleteDialogOpen(false)
        // ★ v10.9.7: reload برای تازه‌سازی داده‌ها
        await loadData()
      } else {
        // ★ v10.9.7: اگر needsForce بود، دوباره با force=true تلاش کن
        if (data.needsForce) {
          console.log('[InitialBalanceTab] Retrying with force=true')
          const retryRes = await fetch('/api/initial-balance?force=true', {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          })
          const retryData = await retryRes.json()
          if (retryData.success) {
            toast({
              title: 'حذف شد ✓',
              description: retryData.message,
            })
            setSavedItems([])
            setSummary(null)
            setPendingItems([])
            setDeleteDialogOpen(false)
            await loadData()
            return
          }
        }
        
        toast({
          title: 'خطا',
          description: data.error || 'حذف ناموفق بود',
          variant: 'destructive',
        })
      }
    } catch {
      toast({
        title: 'خطا',
        description: 'ارتباط با سرور برقرار نشد',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleFinalizeDraft = async () => {
    if (savedItems.length === 0) {
      toast({
        title: 'خطا',
        description: 'سندی برای ثبت نهایی وجود ندارد',
        variant: 'destructive',
      })
      return
    }

    setSubmitting(true)
    try {
      const token = typeof window !== 'undefined'
        ? localStorage.getItem('token')
        : null

    // ★ v10.9.6: ارسال accountId برای حفظ ارتباط با حساب
    const draftItems = savedItems.map((b: any) => ({
      type: b.type,
      title: b.title,
      amount: b.amount,
      accountId: b.accountId || undefined,
      productId: b.productId || undefined,
      quantity: b.quantity || undefined,
      description: b.description || undefined,
    }))

      const res = await fetch('/api/initial-balance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          items: draftItems,
          postToJournal: true,
        }),
      })
      const data = await res.json()

      if (data.success) {
        toast({
          title: 'سند افتتاحیه صادر شد ✓',
          description: data.message || 'سند قطعی افتتاحیه با موفقیت ثبت شد',
        })
        await loadData()
      } else {
        toast({
          title: 'خطا',
          description: data.error || 'ثبت نهایی ناموفق بود',
          variant: 'destructive',
        })
      }
    } catch {
      toast({
        title: 'خطا',
        description: 'ارتباط با سرور برقرار نشد',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleEditDraft = () => {
    if (savedItems.length === 0) return

    const editable = savedItems.map((b: any) => ({
      type: b.type,
      title: b.title,
      amount: Number(b.amount) || 0,
      productId: b.productId || null,
      quantity: b.quantity != null ? Number(b.quantity) : null,
      description: b.description || null,
      Product: b.Product || null,
    }))

    setPendingItems(editable)
    setSavedItems([])
    setSummary(null)

    toast({
      title: 'حالت ویرایش',
      description: 'آیتم‌های سند برای ویرایش بارگذاری شدند. تغییرات را اعمال و سپس ثبت کنید.',
    })
  }

  const formatNumber = (n: number) => (n || 0).toLocaleString('fa-IR')

  const TYPE_LABELS: Record<string, string> = {
    cash: '💵 نقدی (صندوق)',
    bank: '🏦 بانک',
    inventory: '📦 موجودی کالا',
    fixed_asset: '🏭 دارایی ثابت',
    liability: '📋 بدهی (وام)',
  }

  const TYPE_COLORS: Record<string, string> = {
    cash: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    bank: 'bg-blue-100 text-blue-700 border-blue-200',
    inventory: 'bg-amber-100 text-amber-700 border-amber-200',
    fixed_asset: 'bg-purple-100 text-purple-700 border-purple-200',
    liability: 'bg-red-100 text-red-700 border-red-200',
  }

  const pendingAssets = pendingItems
    .filter((b) => ['cash', 'bank', 'inventory', 'fixed_asset'].includes(b.type))
    .reduce((s, b) => s + b.amount, 0)
  const pendingLiabs = pendingItems
    .filter((b) => b.type === 'liability')
    .reduce((s, b) => s + b.amount, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
        <span className="mr-2 text-sm text-gray-600">در حال بارگذاری...</span>
      </div>
    )
  }

  return (
    <div className="space-y-3" dir="rtl">
      <Card className="border-violet-200 bg-violet-50/30">
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            <Wallet className="w-5 h-5 text-violet-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-violet-900">
                راه‌اندازی اولیه فروشگاه
              </p>
              <p className="text-xs text-violet-700 mt-1 leading-relaxed">
                موجودی‌های اولیه (نقد، بانک، کالا، تجهیزات، بدهی) را ثبت کنید.
                سیستم سند افتتاحیه را خودکار صادر می‌کند.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {savedItems.length > 0 && (
        <Card className={`border-2 ${
          summary?.isPosted
            ? 'border-emerald-300 bg-emerald-50/30'
            : 'border-amber-300 bg-amber-50/30'
        }`}>
          <CardHeader className="p-3 pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                {summary?.isPosted ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                )}
                <span>
                  سند افتتاحیه
                  {summary?.isPosted
                    ? ' — صادر شده ✓'
                    : ' — پیش‌نویس'}
                </span>
                <Badge className={`text-[10px] ${
                  summary?.isPosted
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {savedItems.length} آیتم
                </Badge>
              </CardTitle>
              <div className="flex items-center gap-1.5 shrink-0">
                {!summary?.isPosted && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs border-blue-200 text-blue-600 hover:bg-blue-50 gap-1"
                    onClick={handleEditDraft}
                    disabled={submitting}
                  >
                    <Pencil className="w-3 h-3" />
                    ویرایش
                  </Button>
                )}

                {!summary?.isPosted && (
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                    onClick={handleFinalizeDraft}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3 h-3" />
                    )}
                    ثبت نهایی
                  </Button>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs border-red-200 text-red-600 hover:bg-red-50 gap-1"
                  onClick={() => setDeleteDialogOpen(true)}
                  disabled={submitting}
                >
                  <Trash2 className="w-3 h-3" />
                  حذف
                </Button>
              </div>
            </div>
            {summary?.journalEntryId && (
              <p className="text-[10px] text-gray-500 font-mono mt-1">
                شناسه سند: {summary.journalEntryId.slice(0, 20)}...
              </p>
            )}
          </CardHeader>

          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {savedItems.map((item: any, idx: number) => (
                <div
                  key={item.id || idx}
                  className="flex items-center justify-between gap-2 px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-[10px] px-2 py-0.5 rounded border shrink-0 ${
                      TYPE_COLORS[item.type] || 'bg-gray-100 text-gray-700'
                    }`}>
                      {TYPE_LABELS[item.type]?.split(' ')[0] || item.type}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">
                        {item.title}
                      </p>
                      {item.description && (
                        <p className="text-[10px] text-gray-500 truncate">
                          {item.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-xs font-bold font-mono text-gray-700">
                    {formatNumber(item.amount)} ﷼
                  </div>
                </div>
              ))}
            </div>

            {summary && (
              <div className="border-t border-gray-200 bg-white/50 p-3 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-600 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-emerald-500" />
                    جمع دارایی‌ها:
                  </span>
                  <span className="font-bold text-emerald-700 font-mono">
                    {formatNumber(summary.totalAssets)} ﷼
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-600 flex items-center gap-1">
                    <TrendingDown className="w-3 h-3 text-red-500" />
                    جمع بدهی‌ها:
                  </span>
                  <span className="font-bold text-red-600 font-mono">
                    {formatNumber(summary.totalLiabilities)} ﷼
                  </span>
                </div>
                <div className="flex justify-between text-xs pt-1.5 border-t border-gray-200">
                  <span className="font-bold text-gray-900">سرمایه مالک:</span>
                  <span className={`font-bold text-base font-mono ${
                    summary.equity >= 0
                      ? 'text-violet-700'
                      : 'text-red-600'
                  }`}>
                    {formatNumber(summary.equity)} ﷼
                  </span>
                </div>
                <p className="text-[9px] text-center text-gray-400 pt-1 border-t border-gray-100">
                  دارایی‌ها ({formatNumber(summary.totalAssets)}) ={' '}
                  بدهی‌ها ({formatNumber(summary.totalLiabilities)}) +{' '}
                  سرمایه ({formatNumber(summary.equity)})
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="border-gray-200">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Plus className="w-4 h-4 text-violet-600" />
            {savedItems.length > 0
              ? 'افزودن آیتم جدید به سند'
              : 'ثبت موجودی‌های اولیه'}
          </CardTitle>
          {savedItems.length > 0 && (
            <p className="text-[10px] text-amber-600 mt-0.5">
              ⚠ با ثبت آیتم جدید، سند قبلی حذف و سند جدید با همه آیتم‌ها صادر می‌شود
            </p>
          )}
        </CardHeader>

        <CardContent className="space-y-3 p-3 pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px] text-gray-600">نوع موجودی</Label>
              <select
                value={form.type}
                onChange={(e) =>
                  setForm({ ...form, type: e.target.value, productId: '' })
                }
                className="w-full mt-0.5 text-xs border border-gray-200 rounded-md h-9 px-2 bg-white"
              >
                <option value="cash">💵 نقدی (صندوق)</option>
                <option value="bank">🏦 بانک</option>
                <option value="inventory">📦 موجودی کالا</option>
                <option value="fixed_asset">🏭 دارایی ثابت</option>
                <option value="liability">📋 بدهی (وام)</option>
              </select>
            </div>

            <div>
              <Label className="text-[11px] text-gray-600">عنوان</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={
                  form.type === 'cash'
                    ? 'صندوق فروشگاه'
                    : form.type === 'bank'
                      ? 'بانک ملت'
                      : form.type === 'liability'
                        ? 'وام بانک'
                        : 'عنوان'
                }
                className="mt-0.5 text-xs h-9"
                onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
              />
            </div>
          </div>

          {form.type === 'inventory' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
              <div>
                <Label className="text-[11px] text-gray-600">محصول</Label>
                <select
                  value={form.productId}
                  onChange={(e) =>
                    setForm({ ...form, productId: e.target.value })
                  }
                  className="w-full mt-0.5 text-xs border border-gray-200 rounded-md h-9 px-2 bg-white"
                >
                  <option value="">— انتخاب محصول —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-[11px] text-gray-600">مقدار</Label>
                <Input
                  type="number"
                  value={form.quantity}
                  onChange={(e) =>
                    setForm({ ...form, quantity: e.target.value })
                  }
                  placeholder="۱۰۰"
                  className="mt-0.5 text-xs h-9"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px] text-gray-600">مبلغ (ریال)</Label>
              <Input
                type="number"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="۵۰٬۰۰۰٬۰۰۰"
                className="mt-0.5 text-xs h-9"
                dir="ltr"
                onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
              />
            </div>
            <div>
              <Label className="text-[11px] text-gray-600">
                توضیحات (اختیاری)
              </Label>
              <Input
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="یادداشت"
                className="mt-0.5 text-xs h-9"
              />
            </div>
          </div>

          <Button
            onClick={handleAddItem}
            variant="outline"
            className="w-full border-violet-300 text-violet-700 hover:bg-violet-50 gap-1.5 h-9 text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            افزودن به لیست
          </Button>
        </CardContent>
      </Card>

      {pendingItems.length > 0 && (
        <Card className="border-violet-200 bg-violet-50/20">
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-xs flex items-center gap-2 text-violet-700">
              <AlertCircle className="w-3.5 h-3.5" />
              آیتم‌های در انتظار ثبت
              <Badge className="bg-violet-100 text-violet-700 text-[10px]">
                {pendingItems.length} آیتم
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-violet-100">
              {pendingItems.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-[10px] px-2 py-0.5 rounded border shrink-0 ${
                      TYPE_COLORS[item.type] || 'bg-gray-100 text-gray-700'
                    }`}>
                      {TYPE_LABELS[item.type]?.split(' ')[0] || item.type}
                    </span>
                    <p className="text-xs font-medium text-gray-800 truncate">
                      {item.title}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-bold font-mono text-gray-700">
                      {formatNumber(item.amount)} ﷼
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                      onClick={() =>
                        setPendingItems((prev) =>
                          prev.filter((_, i) => i !== idx)
                        )
                      }
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-violet-100 bg-white/50 p-3 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-600">دارایی‌های جدید:</span>
                <span className="font-bold text-emerald-700 font-mono">
                  {formatNumber(pendingAssets)} ﷼
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-600">بدهی‌های جدید:</span>
                <span className="font-bold text-red-600 font-mono">
                  {formatNumber(pendingLiabs)} ﷼
                </span>
              </div>
            </div>
          </CardContent>

          <div className="p-3 pt-0 grid grid-cols-2 gap-2">
            <Button
              onClick={() => handleSave(false)}
              disabled={submitting}
              variant="outline"
              className="text-xs h-9 gap-1"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              ذخیره موقت
            </Button>
            <Button
              onClick={() => handleSave(true)}
              disabled={submitting}
              className="bg-violet-600 hover:bg-violet-700 text-white text-xs h-9 gap-1"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              ثبت + صدور سند
            </Button>
          </div>
        </Card>
      )}

      {savedItems.length === 0 && pendingItems.length === 0 && (
        <Card className="border-dashed border-violet-200">
          <CardContent className="py-10 text-center">
            <div className="w-14 h-14 rounded-full bg-violet-100 flex items-center justify-center mx-auto mb-3">
              <Wallet className="w-7 h-7 text-violet-400" />
            </div>
            <p className="text-sm font-medium text-gray-700">
              سند افتتاحیه ثبت نشده
            </p>
            <p className="text-[11px] text-gray-500 mt-1 max-w-xs mx-auto leading-relaxed">
              موجودی‌های اولیه فروشگاه را از فرم بالا اضافه کنید
            </p>
          </CardContent>
        </Card>
      )}

         <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700 text-sm">
              <AlertTriangle className="w-5 h-5" />
              حذف سند افتتاحیه
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-right text-xs leading-relaxed">
                <p className="text-gray-500">این عملیات:</p>
                <ul className="mt-2 space-y-1 list-disc list-inside text-gray-600">
                  <li>
                    تمام {savedItems.length} آیتم موجودی اولیه را حذف می‌کند
                  </li>
                  {/* ★ v10.9.7: اگر سند صادر شده، هشدار اضافی */}
                  {summary?.isPosted && (
                    <li className="text-red-600 font-bold">
                      ⚠️ سند حسابداری صادر شده نیز حذف می‌شود
                    </li>
                  )}
                </ul>
                {summary?.isPosted && (
                  <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-red-700 text-[11px] font-bold">
                      ⚠️ هشدار: این عملیات غیرقابل بازگشت است!
                    </p>
                    <p className="text-red-600 text-[10px] mt-1">
                      سند افتتاحیه به‌طور کامل از سیستم حذف می‌شود.
                    </p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel disabled={submitting}>
              انصراف
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDelete}
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin ml-1" />
              ) : (
                <Trash2 className="w-4 h-4 ml-1" />
              )}
              {summary?.isPosted ? 'حذف کامل سند' : 'بله، حذف شود'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}