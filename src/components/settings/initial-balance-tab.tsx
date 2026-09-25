'use client'

// ============================================================================
// src/components/settings/initial-balance-tab.tsx
// ShopAccounting — تب راه‌اندازی اولیه (سند افتتاحیه)
// ★ v11.9.2: لایه ۱ — هشدار قبل از ثبت نهایی (جلوگیری از خطای کاربر)
// ★ v11.9.1: لاگ‌های سیستمی اضافه شد
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useToast } from '@/hooks/use-toast'
import { logger } from '@/lib/system-logger'
import { useStore } from '@/lib/store'
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Wallet, Plus, Pencil, Trash2, Loader2, CheckCircle2, AlertCircle,
  AlertTriangle, Save, TrendingUp, TrendingDown, Package,
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

  // ★ v11.9.2: State برای هشدار قبل از ثبت نهایی
  const [showWarningModal, setShowWarningModal] = useState(false)
  const [warningReasons, setWarningReasons] = useState<string[]>([])
  const [pendingPostAction, setPendingPostAction] = useState<(() => Promise<void>) | null>(null)

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

      const [balRes, prodRes, journalRes] = await Promise.all([
        fetch('/api/initial-balance', { ...(headers && { headers }) }),
        fetch('/api/products?limit=100', { ...(headers && { headers }) }),
        fetch('/api/journal-entries?sourceType=initial_balance&limit=10', { ...(headers && { headers }) }),
      ])
      
      const balData = await balRes.json()
      const prodData = await prodRes.json()
      const journalData = await journalRes.json()

      if (balData.success) {
        let apiItems = Array.isArray(balData.data) ? balData.data : []
        
        if (apiItems.length === 0 && journalData.success && journalData.data?.entries?.length > 0) {
          console.log('[InitialBalanceTab] ⚠️ InitialBalances empty but JournalEntries found — recovering...')
          
          const openingJE = journalData.data.entries.find((e: any) => 
            e.sourceType === 'initial_balance'
          )
          
          if (openingJE && openingJE.lines && openingJE.lines.length > 0) {
            apiItems = openingJE.lines.map((line: any, idx: number) => ({
              id: `recovered-${idx}`,
              type: line.debit > 0 ? 'cash' : 'liability',
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
        // ★ v11.9.1: لاگ ذخیره سند افتتاحیه
        const assets = allItems
          .filter((b) => ['cash', 'bank', 'inventory', 'fixed_asset'].includes(b.type))
          .reduce((s, b) => s + (Number(b.amount) || 0), 0)
        const liabs = allItems
          .filter((b) => b.type === 'liability')
          .reduce((s, b) => s + (Number(b.amount) || 0), 0)

        logger.info('سند افتتاحیه ذخیره شد', {
          postToJournal: postToJournal,
          itemsCount: allItems.length,
          totalAssets: assets,
          totalLiabilities: liabs,
          equity: assets - liabs,
          itemsBreakdown: {
            cash: allItems.filter(b => b.type === 'cash').length,
            bank: allItems.filter(b => b.type === 'bank').length,
            inventory: allItems.filter(b => b.type === 'inventory').length,
            fixedAsset: allItems.filter(b => b.type === 'fixed_asset').length,
            liability: allItems.filter(b => b.type === 'liability').length,
          },
          journalEntryId: data.data?.journalEntryId || null,
          isUpdate: savedItems.length > 0,
        })

        toast({
          title: postToJournal ? 'سند افتتاحیه صادر شد ✓' : 'ذخیره شد ✓',
          description: data.message,
        })
        await loadData()
      } else {
        // ★ v11.9.1: لاگ خطای ذخیره سند افتتاحیه
        logger.error('خطا در ذخیره سند افتتاحیه', undefined, {
          postToJournal: postToJournal,
          itemsCount: allItems.length,
          error: data.error,
        })

        toast({
          title: 'خطا',
          description: data.error || 'ثبت ناموفق بود',
          variant: 'destructive',
        })
      }
    } catch (err) {
      logger.error('خطای شبکه در ذخیره سند افتتاحیه', err as Error)
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

      const forceParam = summary?.isPosted ? '?force=true' : ''

      // ذخیره اطلاعات قبلی برای لاگ
      const deletedInfo = {
        itemsCount: savedItems.length,
        isPosted: summary?.isPosted || false,
        journalEntryId: summary?.journalEntryId || null,
        totalAssets: summary?.totalAssets || 0,
        totalLiabilities: summary?.totalLiabilities || 0,
        equity: summary?.equity || 0,
        forceUsed: !!forceParam,
      }

      const res = await fetch(`/api/initial-balance${forceParam}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      const data = await res.json()
      if (data.success) {
        // ★ v11.9.1: لاگ حذف سند افتتاحیه
        logger.info('سند افتتاحیه حذف شد', {
          itemsCount: deletedInfo.itemsCount,
          wasPosted: deletedInfo.isPosted,
          journalEntryId: deletedInfo.journalEntryId,
          totalAssets: deletedInfo.totalAssets,
          totalLiabilities: deletedInfo.totalLiabilities,
          equity: deletedInfo.equity,
          forceUsed: deletedInfo.forceUsed,
        })

        toast({
          title: 'حذف شد ✓',
          description: data.message,
        })
        setSavedItems([])
        setSummary(null)
        setPendingItems([])
        setDeleteDialogOpen(false)
        await loadData()
      } else {
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
            // ★ v11.9.1: لاگ حذف سند افتتاحیه با force (retry)
            logger.info('سند افتتاحیه با force حذف شد', {
              itemsCount: savedItems.length,
              wasPosted: summary?.isPosted || false,
              journalEntryId: summary?.journalEntryId || null,
              forceUsed: true,
              wasRetry: true,
            })

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
        
        logger.error('خطا در حذف سند افتتاحیه', undefined, {
          error: data.error,
        })

        toast({
          title: 'خطا',
          description: data.error || 'حذف ناموفق بود',
          variant: 'destructive',
        })
      }
    } catch (err) {
      logger.error('خطای شبکه در حذف سند افتتاحیه', err as Error)
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
        // ★ v11.9.1: لاگ ثبت نهایی سند افتتاحیه
        const assets = draftItems
          .filter((b) => ['cash', 'bank', 'inventory', 'fixed_asset'].includes(b.type))
          .reduce((s, b) => s + (Number(b.amount) || 0), 0)
        const liabs = draftItems
          .filter((b) => b.type === 'liability')
          .reduce((s, b) => s + (Number(b.amount) || 0), 0)

        logger.info('سند افتتاحیه پیش‌نویس به سند قطعی تبدیل شد', {
          itemsCount: draftItems.length,
          totalAssets: assets,
          totalLiabilities: liabs,
          equity: assets - liabs,
          journalEntryId: data.data?.journalEntryId || null,
          wasDraft: true,
        })

        toast({
          title: 'سند افتتاحیه صادر شد ✓',
          description: data.message || 'سند قطعی افتتاحیه با موفقیت ثبت شد',
        })
        await loadData()
      } else {
        // ★ v11.9.1: لاگ خطای ثبت نهایی
        logger.error('خطا در ثبت نهایی سند افتتاحیه', undefined, {
          itemsCount: draftItems.length,
          error: data.error,
        })

        toast({
          title: 'خطا',
          description: data.error || 'ثبت نهایی ناموفق بود',
          variant: 'destructive',
        })
      }
    } catch (err) {
      logger.error('خطای شبکه در ثبت نهایی سند افتتاحیه', err as Error)
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

    // ★ v11.9.1: لاگ ورود به حالت ویرایش پیش‌نویس
    logger.info('ورود به حالت ویرایش سند افتتاحیه', {
      itemsCount: savedItems.length,
      previousTotalAssets: summary?.totalAssets || 0,
      previousTotalLiabilities: summary?.totalLiabilities || 0,
      wasPosted: summary?.isPosted || false,
    })

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

  // ═══════════════════════════════════════════════════════════════
  // ★ v11.9.2: بررسی قبل از ثبت نهایی (لایه ۱ — هشدار)
  // ═══════════════════════════════════════════════════════════════
  const checkBeforePost = (): string[] => {
    const warnings: string[] = []

    const productCount = products.length

    // بررسی ۱: آیا کالایی ثبت شده است؟
    if (productCount === 0) {
      warnings.push('هیچ کالایی در سیستم ثبت نشده است')
    } else {
      // بررسی ۲: آیا موجودی کالا در سند هست؟
      const allItems = [...savedItems, ...pendingItems]
      const hasInventoryInBalance = allItems.some(
        (b) => b.type === 'inventory' && (Number(b.amount) || 0) > 0
      )

      if (!hasInventoryInBalance) {
        warnings.push(
          `شما ${productCount} کالا در سیستم دارید اما ارزش موجودی کالا در سند افتتاحیه وارد نشده است`
        )
      }
    }

    return warnings
  }

  // ★ v11.9.2: Wrapper برای ثبت نهایی پیش‌نویس
  const handleFinalizeDraftWithCheck = async () => {
    const warnings = checkBeforePost()
    if (warnings.length > 0) {
      logger.info('⚠️ هشدار قبل از ثبت نهایی', { warnings })
      setWarningReasons(warnings)
      setPendingPostAction(() => handleFinalizeDraft)
      setShowWarningModal(true)
      return
    }
    await handleFinalizeDraft()
  }

  // ★ v11.9.2: Wrapper برای ثبت + صدور سند
  const handleSaveWithCheck = async () => {
    const warnings = checkBeforePost()
    if (warnings.length > 0) {
      logger.info('⚠️ هشدار قبل از ثبت نهایی', { warnings })
      setWarningReasons(warnings)
      setPendingPostAction(() => () => handleSave(true))
      setShowWarningModal(true)
      return
    }
    await handleSave(true)
  }

  // ★ v11.9.2: تایید عملیات از مودال هشدار
  const confirmPendingAction = async () => {
    if (!pendingPostAction) return
    setShowWarningModal(false)
    const action = pendingPostAction
    setPendingPostAction(null)
    await action()
  }

  // ★ v11.9.2: هدایت کاربر به بخش کالاها
  const goToProducts = () => {
    setShowWarningModal(false)
    setPendingPostAction(null)
    useStore.getState().setCurrentView('products' as any)
    toast({
      title: '📦 بخش کالاها',
      description: 'ابتدا کالاهای فروشگاه را ثبت کنید، سپس به این صفحه برگردید.',
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
                    onClick={handleFinalizeDraftWithCheck}
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
              onClick={handleSaveWithCheck}
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

      {/* ══════════════════════════════════════════════════════════ */}
      {/* ★ v11.9.2: مودال هشدار قبل از ثبت نهایی                  */}
      {/* ══════════════════════════════════════════════════════════ */}
      <Dialog open={showWarningModal} onOpenChange={setShowWarningModal}>
        <DialogContent className="sm:max-w-md w-[calc(100%-2rem)]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <span className="text-gray-900">⚠️ هشدار قبل از ثبت نهایی</span>
                <DialogDescription className="text-[11px] text-gray-500 font-normal mt-0.5">
                  لطفاً موارد زیر را بررسی کنید
                </DialogDescription>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {/* لیست هشدارها */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
              <p className="text-xs font-bold text-amber-800 mb-2">
                مواردی که باید بررسی شوند:
              </p>
              {warningReasons.map((reason, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 text-xs text-amber-700"
                >
                  <span className="text-amber-500 mt-0.5 shrink-0">❌</span>
                  <span>{reason}</span>
                </div>
              ))}
            </div>

            {/* توصیه */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-800 leading-relaxed">
                <span className="font-bold">💡 توصیه:</span>
                {' '}برای داشتن گزارش‌های دقیق مالی، بهتر است ابتدا کالاهای موجود
                در فروشگاه خود را در بخش <strong>"کالاها"</strong> ثبت کنید، سپس
                موجودی اولیه کالاها را در این سند اضافه کنید و در نهایت سند را
                ثبت نهایی نمایید.
              </p>
            </div>

            {/* دکمه‌های عملیات */}
            <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
              <Button
                onClick={goToProducts}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2 h-10"
              >
                <Package className="w-4 h-4" />
                رفتن به بخش کالاها (توصیه می‌شود)
              </Button>

              <Button
                variant="outline"
                onClick={confirmPendingAction}
                disabled={submitting}
                className="w-full text-gray-700 gap-2 h-10"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                به هر حال، سند را ثبت نهایی کن
              </Button>

              <Button
                variant="ghost"
                onClick={() => {
                  setShowWarningModal(false)
                  setPendingPostAction(null)
                }}
                className="w-full text-gray-500 h-8"
              >
                انصراف
              </Button>
            </div>

            {/* یادآوری */}
            <p className="text-[10px] text-gray-400 text-center pt-1">
              ⚠️ توجه: اگر سند را بدون ثبت کالاها ثبت نهایی کنید، موجودی
              کالاها در سند افتتاحیه لحاظ نمی‌شود.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}