'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Grid3x3,
  Plus,
  Search,
  Edit2,
  Trash2,
  FolderTree,
  WifiOff,
  Loader2,
  CheckCircle2,
  ChevronLeft,
  ChevronDown,
  AlertTriangle,
  X,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

// ============ Helpers ============
function toFaNum(n: number | string): string {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)])
}

// ============ Types ============

interface Category {
  id: string
  name: string
  parentId: string | null
  isActive: boolean
  tenantId: string
  productCount: number
  parent?: { id: string; name: string } | null
  children?: Category[]
  _isOffline?: boolean
}

// ============ Main Component ============

export default function CategoriesPage() {
  const { toast } = useToast()

  const currentTenant = useAppStore((s) => s.currentTenant)
  const tenantId = useAppStore((s) => s.tenantId)
  const isOnline = useAppStore((s) => s.isOnline)

  // Data state
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // UI state
  const [searchQuery, setSearchQuery] = useState('')
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)

  // Add form state
  const [formName, setFormName] = useState('')
  const [formParentId, setFormParentId] = useState<string>('none')
  const [formIsActive, setFormIsActive] = useState(true)

  // Edit form state
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [editFormName, setEditFormName] = useState('')
  const [editFormParentId, setEditFormParentId] = useState<string>('none')
  const [editFormIsActive, setEditFormIsActive] = useState(true)

  // Delete state
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ============ Load Data ============

    const loadCategories = useCallback(async () => {
    setLoading(true)

    // ★ OFFLINE: خواندن از cache
    if (!navigator.onLine) {
      console.log('[Categories] 📡 آفلاین — بارگذاری از cache...')
      try {
        const { getCachedCategories } = await import('@/lib/offline-db')
        const cached = await getCachedCategories()
        if (cached.length > 0) {
          setCategories(cached.map((c: any) => ({ ...c, _isOffline: true })))
          console.log(`[Categories] ✅ ${cached.length} دسته از cache بارگذاری شد`)
          toast({
            title: '📡 حالت آفلاین',
            description: 'دسته‌بندی‌ها از حافظه محلی بارگذاری شدند',
            duration: 3000,
          })
        } else {
          setCategories([])
        }
      } catch (err) {
        console.error('[Categories] خطا در بارگذاری cache:', err)
        setCategories([])
      }
      setLoading(false)
      return
    }

    // ★ ONLINE: واکشی از سرور
    try {
      const res = await fetch(`/api/categories?tenantId=${tenantId}`)
      const json = await res.json()
      if (json.success && json.data) {
        const cats = json.data.categories || json.data
        if (Array.isArray(cats)) {
          setCategories(cats)
          // ★ ذخیره در cache برای آفلاین
          try {
            const { cacheCategories } = await import('@/lib/offline-db')
            await cacheCategories(cats)
            console.log(`[Categories] ✅ ${cats.length} دسته cache شد`)
          } catch {}
        } else {
          setCategories([])
        }
      } else {
        setCategories([])
      }
    } catch (error) {
      console.error('Error loading categories:', error)
      // ★ خطای شبکه — تلاش برای خواندن از cache
      try {
        const { getCachedCategories } = await import('@/lib/offline-db')
        const cached = await getCachedCategories()
        if (cached.length > 0) {
          setCategories(cached.map((c: any) => ({ ...c, _isOffline: true })))
        } else {
          setCategories([])
        }
      } catch {
        setCategories([])
      }
    }
    setLoading(false)
  }, [tenantId, toast])

  useEffect(() => {
    if (tenantId) {
      loadCategories()
    }
  }, [tenantId, loadCategories])

    // ★ OFFLINE: گوش دادن به تغییرات اتصال
  useEffect(() => {
    const handleOnline = () => {
      console.log('[Categories] 🟢 آنلاین شد — بارگذاری مجدد...')
      try { (useAppStore.getState() as any).setOnline?.(true) } catch {}
      loadCategories()
      // sync صف آفلاین
      import('@/lib/sync-engine').then(({ syncEngine }) => {
        syncEngine.init()
        syncEngine.sync().catch(() => {})
      }).catch(() => {})
    }
    const handleOffline = () => {
      console.log('[Categories] 🔴 آفلاین شد')
      try { (useAppStore.getState() as any).setOnline?.(false) } catch {}
      toast({
        title: '📡 اتصال قطع شد',
        description: 'حالت آفلاین فعال شد — داده‌ها از حافظه محلی خوانده می‌شوند',
        duration: 3000,
      })
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [loadCategories, toast])

  // ============ Build Tree ============

  const categoryTree = useMemo(() => {
    const map = new Map<string, Category>()
    const roots: Category[] = []

    categories.forEach((cat) => {
      map.set(cat.id, { ...cat, children: [] })
    })

    map.forEach((cat) => {
      if (cat.parentId && map.has(cat.parentId)) {
        const parent = map.get(cat.parentId)!
        parent.children = parent.children || []
        parent.children.push(cat)
      } else {
        roots.push(cat)
      }
    })

    return roots
  }, [categories])

  // ============ Flat list for table ============

  const flatCategories = useMemo(() => {
    const result: (Category & { level: number })[] = []

    const walk = (nodes: Category[], level: number) => {
      nodes.forEach((node) => {
        result.push({ ...node, level })
        if (node.children && node.children.length > 0 && expandedIds.has(node.id)) {
          walk(node.children, level + 1)
        }
      })
    }

    walk(categoryTree, 0)
    return result
  }, [categoryTree, expandedIds])

  // ============ Search filter ============

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return flatCategories

    const q = searchQuery.trim().toLowerCase()
    return flatCategories.filter(
      (cat) =>
        cat.name.toLowerCase().includes(q) ||
        (cat.parent?.name && cat.parent.name.toLowerCase().includes(q))
    )
  }, [flatCategories, searchQuery])

  // ============ Root categories for parent selector ============

  const rootCategories = useMemo(() => {
    return categories.filter((c) => !c.parentId)
  }, [categories])

  // ============ Toggle expand/collapse ============

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const expandAll = useCallback(() => {
    const allIds = new Set<string>()
    const walk = (nodes: Category[]) => {
      nodes.forEach((n) => {
        if (n.children && n.children.length > 0) {
          allIds.add(n.id)
          walk(n.children)
        }
      })
    }
    walk(categoryTree)
    setExpandedIds(allIds)
  }, [categoryTree])

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set())
  }, [])

  // ============ Auto-expand all on first load ============

  useEffect(() => {
    if (categoryTree.length > 0 && expandedIds.size === 0) {
      expandAll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryTree.length > 0])

  // ============ Add Category handlers ============

  const openAddDialog = useCallback(() => {
    setFormName('')
    setFormParentId('none')
    setFormIsActive(true)
    setAddDialogOpen(true)
  }, [])

  const handleSave = useCallback(async () => {
    if (!formName.trim()) {
      toast({ title: 'خطا', description: 'نام دسته‌بندی الزامی است' })
      return
    }
    // ★ OFFLINE: افزودن به صف + ثبت محلی خوش‌بینانه
    if (!navigator.onLine) {
      setSaving(true)
      try {
        const { addToSyncQueue } = await import('@/lib/offline-db')
        await addToSyncQueue('category', {
          method: 'POST',
          url: '/api/categories',
          body: {
            name: formName.trim(),
            parentId: formParentId === 'none' ? null : formParentId,
            isActive: formIsActive,
            tenantId,
          },
        })
        // ثبت محلی خوش‌بینانه
        const tempCat: Category = {
          id: `offline-${Date.now()}`,
          name: formName.trim(),
          parentId: formParentId === 'none' ? null : formParentId,
          isActive: formIsActive,
          tenantId: tenantId || '',
          productCount: 0,
          _isOffline: true,
        }
        setCategories((prev) => [...prev, tempCat])
        toast({
          title: '📡 در صف ذخیره شد',
          description: 'دسته‌بندی پس از اتصال به سرور ثبت می‌شود',
          duration: 4000,
        })
        setAddDialogOpen(false)
        setFormName('')
        setFormParentId('none')
        setFormIsActive(true)
      } catch (error) {
        toast({ title: 'خطا', description: 'خطا در ذخیره آفلاین', variant: 'destructive' })
      }
      setSaving(false)
      return
    }

    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        name: formName.trim(),
        parentId: formParentId === 'none' ? null : formParentId,
        isActive: formIsActive,
        tenantId,
      }

      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const json = await res.json()

      if (json.success) {
        toast({ title: 'دسته‌بندی اضافه شد' })
        setAddDialogOpen(false)
        setFormName('')
        setFormParentId('none')
        setFormIsActive(true)
        loadCategories()
      } else {
        toast({ title: 'خطا', description: json.error || 'خطا در ذخیره دسته‌بندی' })
      }
    } catch (error) {
      toast({ title: 'خطا', description: 'خطا در ذخیره دسته‌بندی' })
    }
    setSaving(false)
  }, [formName, formParentId, formIsActive, tenantId, loadCategories, toast])

  // ============ Edit Category handlers ============

  const openEditDialog = useCallback((cat: Category) => {
    setEditingCategory(cat)
    setEditFormName(cat.name)
    setEditFormParentId(cat.parentId || 'none')
    setEditFormIsActive(cat.isActive)
    setEditDialogOpen(true)
  }, [])

  const handleUpdate = useCallback(async () => {
    if (!editingCategory) return
    if (!editFormName.trim()) {
      toast({ title: 'خطا', description: 'نام دسته‌بندی الزامی است' })
      return
    }
    // ★ OFFLINE: ویرایش در صف + بروزرسانی محلی خوش‌بینانه
    if (!navigator.onLine) {
      setSaving(true)
      try {
        const { addToSyncQueue } = await import('@/lib/offline-db')
        await addToSyncQueue('category', {
          method: 'PUT',
          url: `/api/categories/${editingCategory.id}`,
          body: {
            name: editFormName.trim(),
            parentId: editFormParentId === 'none' ? null : editFormParentId,
            isActive: editFormIsActive,
            tenantId,
          },
        })
        setCategories((prev) =>
          prev.map((c) =>
            c.id === editingCategory.id
              ? {
                  ...c,
                  name: editFormName.trim(),
                  parentId: editFormParentId === 'none' ? null : editFormParentId,
                  isActive: editFormIsActive,
                  _isOffline: true,
                }
              : c
          )
        )
        toast({
          title: '📡 در صف بروزرسانی قرار گرفت',
          description: 'تغییرات پس از اتصال اعمال می‌شود',
          duration: 4000,
        })
        setEditDialogOpen(false)
        setEditingCategory(null)
      } catch (error) {
        toast({ title: 'خطا', description: 'خطا در بروزرسانی آفلاین', variant: 'destructive' })
      }
      setSaving(false)
      return
    }


    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        name: editFormName.trim(),
        parentId: editFormParentId === 'none' ? null : editFormParentId,
        isActive: editFormIsActive,
        tenantId,
      }

      const res = await fetch(`/api/categories/${editingCategory.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const json = await res.json()

      if (json.success) {
        toast({ title: 'دسته‌بندی بروزرسانی شد' })
        setEditDialogOpen(false)
        setEditingCategory(null)
        loadCategories()
      } else {
        toast({ title: 'خطا', description: json.error || 'خطا در بروزرسانی دسته‌بندی' })
      }
    } catch (error) {
      toast({ title: 'خطا', description: 'خطا در بروزرسانی دسته‌بندی' })
    }
    setSaving(false)
  }, [editingCategory, editFormName, editFormParentId, editFormIsActive, tenantId, loadCategories, toast])

  // ============ Delete Category handlers ============

  const openDeleteDialog = useCallback((cat: Category) => {
    setDeletingCategory(cat)
    setDeleteDialogOpen(true)
  }, [])

  const handleDelete = useCallback(async () => {
    if (!deletingCategory) return

        // ★ OFFLINE: حذف در صف + حذف محلی خوش‌بینانه
    if (!navigator.onLine) {
      setDeleting(true)
      try {
        const { addToSyncQueue } = await import('@/lib/offline-db')
        await addToSyncQueue('category', {
          method: 'DELETE',
          url: `/api/categories/${deletingCategory.id}?tenantId=${tenantId}`,
          body: {},
        })
        setCategories((prev) => prev.filter((c) => c.id !== deletingCategory.id))
        toast({
          title: '📡 در صف حذف قرار گرفت',
          description: 'دسته‌بندی پس از اتصال از سرور حذف می‌شود',
          duration: 4000,
        })
        setDeleteDialogOpen(false)
        setDeletingCategory(null)
      } catch (error) {
        toast({ title: 'خطا', description: 'خطا در حذف آفلاین', variant: 'destructive' })
      }
      setDeleting(false)
      return
    }

    setDeleting(true)
    try {
      const res = await fetch(`/api/categories/${deletingCategory.id}?tenantId=${tenantId}`, {
        method: 'DELETE',
      })

      const json = await res.json()

      if (json.success) {
        toast({ title: 'دسته‌بندی حذف شد' })
        setDeleteDialogOpen(false)
        setDeletingCategory(null)
        loadCategories()
      } else {
        toast({ title: 'خطا', description: json.error || 'خطا در حذف دسته‌بندی' })
      }
    } catch (error) {
      toast({ title: 'خطا', description: 'خطا در حذف دسته‌بندی' })
    }
    setDeleting(false)
  }, [deletingCategory, tenantId, loadCategories, toast])

  // ============ Category stats ============

  const totalCategories = categories.length
  const activeCategories = categories.filter((c) => c.isActive).length
  const rootCount = categories.filter((c) => !c.parentId).length

  const hasChildren = deletingCategory?.children && deletingCategory.children.length > 0

  // ============ Render ============

  return (
    <div className="flex flex-col h-full bg-gray-50/80" dir="rtl">

      {/* ─── Header ─── */}
      <header className="bg-white border-b border-gray-200 px-3 sm:px-5 lg:px-6 py-3 shrink-0">
        <div className="flex items-center justify-between gap-2">

          {/* Title */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 lg:w-10 lg:h-10 rounded-lg bg-blue-600 text-white shrink-0">
              <Grid3x3 className="w-4 h-4 sm:w-4.5 sm:h-4.5 lg:w-5 lg:h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base lg:text-lg font-bold text-gray-900 leading-tight">
                دسته‌بندی‌ها
              </h1>
              <p className="text-[10px] sm:text-xs text-gray-500 hidden sm:block">
                مدیریت دسته‌بندی‌های محصولات
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {!isOnline && (
              <Badge
                variant="outline"
                className="gap-1 text-[10px] border-amber-300 text-amber-700 bg-amber-50 px-1.5 py-0.5"
              >
                <WifiOff className="w-2.5 h-2.5" />
                <span className="hidden sm:inline">آفلاین</span>
              </Badge>
            )}

            {/* Mobile search toggle */}
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 sm:hidden border-gray-200"
              onClick={() => setMobileSearchOpen((v) => !v)}
            >
              <Search className="w-3.5 h-3.5" />
            </Button>

            <Button
              onClick={openAddDialog}
              className="bg-blue-600 hover:bg-blue-700 text-white h-8 sm:h-9 px-2.5 sm:px-3 lg:px-4 text-xs sm:text-sm gap-1 sm:gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden xs:inline sm:inline">افزودن</span>
              <span className="hidden lg:inline"> دسته‌بندی</span>
            </Button>
          </div>
        </div>

        {/* Mobile Search (expandable) */}
        {mobileSearchOpen && (
          <div className="mt-2 sm:hidden">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <Input
                autoFocus
                type="text"
                placeholder="جستجوی دسته‌بندی..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-9 pl-9 h-8 bg-gray-50 border-gray-200 text-xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute left-3 top-1/2 -translate-y-1/2"
                >
                  <X className="w-3.5 h-3.5 text-gray-400" />
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ─── Stats Bar ─── */}
      <div className="bg-white border-b border-gray-100 px-3 sm:px-5 lg:px-6 py-2 shrink-0">
        <div className="flex items-center gap-3 sm:gap-5 lg:gap-6 text-[10px] sm:text-xs text-gray-500 flex-wrap">
          <span>
            مجموع:{' '}
            <strong className="text-gray-900">{toFaNum(totalCategories)}</strong>{' '}
            <span className="hidden sm:inline">دسته‌بندی</span>
          </span>
          <span className="hidden sm:inline">
            فعال: <strong className="text-emerald-600">{toFaNum(activeCategories)}</strong>
          </span>
          <span className="hidden md:inline">
            دسته اصلی: <strong className="text-blue-600">{toFaNum(rootCount)}</strong>
          </span>
          <span className="hidden lg:inline text-gray-300">|</span>
          <span className="hidden lg:inline text-gray-400">
            {toFaNum(filteredCategories.length)} آیتم نمایش داده می‌شود
          </span>
        </div>
      </div>

      {/* ─── Search + Controls (Desktop / Tablet) ─── */}
      <div className="bg-white border-b border-gray-100 px-3 sm:px-5 lg:px-6 py-2 sm:py-2.5 shrink-0 hidden sm:block">
        <div className="flex items-center gap-2 lg:gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-xs lg:max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <Input
              type="text"
              placeholder="جستجوی دسته‌بندی..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-9 h-8 lg:h-9 bg-gray-50 border-gray-200 focus:bg-white focus:border-blue-400 text-xs sm:text-sm"
            />
          </div>

          {/* Expand/Collapse */}
          <div className="flex items-center gap-1.5 mr-auto">
            <Button
              variant="outline"
              size="sm"
              className="h-7 lg:h-8 text-[10px] sm:text-xs border-gray-200 text-gray-600 px-2 lg:px-3 gap-1"
              onClick={expandAll}
            >
              <ChevronDown className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
              <span className="hidden md:inline">باز کردن همه</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 lg:h-8 text-[10px] sm:text-xs border-gray-200 text-gray-600 px-2 lg:px-3 gap-1"
              onClick={collapseAll}
            >
              <ChevronLeft className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
              <span className="hidden md:inline">بستن همه</span>
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Mobile Controls Bar ─── */}
      <div className="bg-white border-b border-gray-100 px-3 py-1.5 shrink-0 sm:hidden">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-gray-400">
            {toFaNum(filteredCategories.length)} دسته‌بندی
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-[10px] text-gray-500 gap-0.5"
              onClick={expandAll}
            >
              <ChevronDown className="w-3 h-3" />
              باز
            </Button>
            <span className="text-gray-200">|</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-[10px] text-gray-500 gap-0.5"
              onClick={collapseAll}
            >
              <ChevronLeft className="w-3 h-3" />
              بسته
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Main Content ─── */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 sm:py-24 lg:py-32 text-gray-400">
            <Loader2 className="w-8 h-8 sm:w-10 sm:h-10 animate-spin text-blue-600 mb-3" />
            <p className="text-xs sm:text-sm font-medium">در حال بارگذاری</p>
          </div>

        ) : filteredCategories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 sm:py-24 lg:py-32 text-gray-400 px-4">
            <FolderTree className="w-12 h-12 sm:w-14 sm:h-14 mb-3 opacity-40" />
            <p className="text-xs sm:text-sm font-medium">دسته‌بندی یافت نشد</p>
            <p className="text-[10px] sm:text-xs mt-1 text-gray-300 text-center">
              {searchQuery ? 'عبارت دیگری را جستجو کنید' : 'اولین دسته‌بندی خود را ایجاد کنید'}
            </p>
            {!searchQuery && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4 border-blue-300 text-blue-600 text-xs gap-1"
                onClick={openAddDialog}
              >
                <Plus className="w-3.5 h-3.5" />
                افزودن دسته‌بندی
              </Button>
            )}
          </div>

        ) : (
          <>
            {/* ══ Desktop/Tablet Table (md+) ══ */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                    <TableHead className="text-xs font-semibold text-gray-600 h-9 w-[40%]">
                      نام دسته‌بندی
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-gray-600 h-9 w-[25%] hidden lg:table-cell">
                      دسته والد
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-gray-600 h-9 text-center w-[15%]">
                      محصولات
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-gray-600 h-9 text-center w-[10%]">
                      وضعیت
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-gray-600 h-9 text-center w-[10%]">
                      عملیات
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCategories.map((cat) => {
                    const nodeHasChildren = cat.children && cat.children.length > 0
                    const isExpanded = expandedIds.has(cat.id)

                    return (
                      <TableRow
                        key={cat.id}
                        className={`hover:bg-blue-50/40 transition-colors ${
                          cat._isOffline ? 'bg-amber-50/50' : ''
                        }`}
                      >
                        {/* Name */}
                        <TableCell className="py-2">
                          <div
                            className="flex items-center gap-1.5"
                            style={{ paddingRight: `${cat.level * 20}px` }}
                          >
                            {nodeHasChildren ? (
                              <button
                                onClick={() => toggleExpand(cat.id)}
                                className="flex items-center justify-center w-5 h-5 rounded hover:bg-gray-200 transition-colors shrink-0"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                                ) : (
                                  <ChevronLeft className="w-3.5 h-3.5 text-gray-500" />
                                )}
                              </button>
                            ) : (
                              <span className="w-5 h-5 flex items-center justify-center shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                              </span>
                            )}
                            <Grid3x3 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span className="font-medium text-sm text-gray-900 truncate max-w-[180px] lg:max-w-none">
                              {cat.name}
                            </span>
                            {cat._isOffline && (
                              <Badge variant="outline" className="text-[9px] border-amber-300 text-amber-600 h-4 px-1 shrink-0">
                                آفلاین
                              </Badge>
                            )}
                            {nodeHasChildren && (
                              <Badge variant="secondary" className="text-[9px] bg-gray-100 text-gray-500 h-4 px-1 shrink-0">
                                {toFaNum(cat.children!.length)}
                              </Badge>
                            )}
                            {/* Show parent inline on tablet when column hidden */}
                            {cat.parent?.name && (
                              <span className="text-[10px] text-gray-400 lg:hidden truncate">
                                ({cat.parent.name})
                              </span>
                            )}
                          </div>
                        </TableCell>

                        {/* Parent – desktop only */}
                        <TableCell className="py-2 text-xs text-gray-500 hidden lg:table-cell">
                          {cat.parent?.name || (
                            <span className="text-gray-300">دسته اصلی</span>
                          )}
                        </TableCell>

                        {/* Product count */}
                        <TableCell className="py-2 text-center">
                          <Badge variant="outline" className="text-[10px] font-medium border-gray-200 whitespace-nowrap">
                            {toFaNum(cat.productCount)}
                            <span className="hidden lg:inline"> محصول</span>
                          </Badge>
                        </TableCell>

                        {/* Status */}
                        <TableCell className="py-2 text-center">
                          {cat.isActive ? (
                            <Badge className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-50 gap-0.5">
                              <CheckCircle2 className="w-3 h-3" />
                              <span className="hidden lg:inline">فعال</span>
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] border-gray-300 text-gray-500">
                              <span className="hidden lg:inline">غیرفعال</span>
                              <span className="lg:hidden">—</span>
                            </Badge>
                          )}
                        </TableCell>

                        {/* Actions - مشابه صفحه محصولات */}
                        <TableCell className="py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog(cat)}
                              className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              title="ویرایش"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDeleteDialog(cat)}
                              className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                              title="حذف"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {/* ══ Mobile Card View (< md) ══ */}
            <div className="md:hidden p-2.5 space-y-2">
              {filteredCategories.map((cat) => {
                const nodeHasChildren = cat.children && cat.children.length > 0
                const isExpanded = expandedIds.has(cat.id)

                return (
                  <Card
                    key={cat.id}
                    className={`border transition-colors shadow-none ${
                      cat._isOffline
                        ? 'border-amber-200 bg-amber-50/30'
                        : 'border-gray-200 bg-white'
                    }`}
                    style={{ marginRight: `${Math.min(cat.level * 12, 36)}px` }}
                  >
                    <CardContent className="p-3">
                      {/* Row 1: expand + icon + name + status */}
                      <div className="flex items-center gap-1.5">
                        {/* Expand button */}
                        {nodeHasChildren ? (
                          <button
                            onClick={() => toggleExpand(cat.id)}
                            className="flex items-center justify-center w-6 h-6 rounded hover:bg-gray-100 transition-colors shrink-0"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-gray-500" />
                            ) : (
                              <ChevronLeft className="w-4 h-4 text-gray-500" />
                            )}
                          </button>
                        ) : (
                          <span className="w-6 h-6 flex items-center justify-center shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                          </span>
                        )}

                        <Grid3x3 className="w-3.5 h-3.5 text-blue-500 shrink-0" />

                        {/* Name */}
                        <span className="font-semibold text-sm text-gray-900 flex-1 truncate">
                          {cat.name}
                        </span>

                        {/* Status badge */}
                        {cat.isActive ? (
                          <Badge className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-50 shrink-0 px-1.5">
                            فعال
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] border-gray-300 text-gray-500 shrink-0 px-1.5">
                            غیرفعال
                          </Badge>
                        )}

                        {/* Action buttons - مشابه صفحه محصولات */}
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(cat)}
                            className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteDialog(cat)}
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Row 2: meta info */}
                      <div className="flex items-center gap-2.5 mt-1.5 pr-8 flex-wrap">
                        {cat.parent?.name && (
                          <span className="text-[10px] text-gray-400">
                            والد: <span className="text-gray-600">{cat.parent.name}</span>
                          </span>
                        )}
                        <span className="text-[10px] text-gray-400">
                          {toFaNum(cat.productCount)} محصول
                        </span>
                        {nodeHasChildren && (
                          <span className="text-[10px] text-blue-500">
                            {toFaNum(cat.children!.length)} زیردسته
                          </span>
                        )}
                        {cat._isOffline && (
                          <Badge variant="outline" className="text-[9px] border-amber-300 text-amber-600 h-4 px-1">
                            آفلاین
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* ════════════════════════════════
          Add Dialog
      ════════════════════════════════ */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent
          className="w-[calc(100%-1.5rem)] sm:w-full sm:max-w-md lg:max-w-lg mx-auto rounded-xl"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-700 text-sm sm:text-base">
              <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
              افزودن دسته‌بندی جدید
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              دسته‌بندی جدید برای محصولات ایجاد کنید
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-700">
                نام دسته‌بندی <span className="text-red-500">*</span>
              </label>
              <Input
                autoFocus
                type="text"
                placeholder="مثلاً: لباس مردانه"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                className="h-9 sm:h-10 text-sm border-gray-200 focus:border-blue-400"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-700">دسته والد</label>
              <Select value={formParentId} onValueChange={setFormParentId}>
                <SelectTrigger className="h-9 sm:h-10 text-sm border-gray-200">
                  <SelectValue placeholder="انتخاب دسته والد" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <span className="text-gray-500">بدون والد (دسته اصلی)</span>
                  </SelectItem>
                  {rootCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
              <label className="text-xs font-medium text-gray-700">وضعیت فعال</label>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${formIsActive ? 'text-emerald-600' : 'text-gray-400'}`}>
                  {formIsActive ? 'فعال' : 'غیرفعال'}
                </span>
                <Switch checked={formIsActive} onCheckedChange={setFormIsActive} />
              </div>
            </div>
          </div>

          <DialogFooter className="flex-row-reverse sm:flex-row gap-2">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm h-9 sm:h-10 gap-1.5"
            >
              {saving ? (
                <><Loader2 className="w-4 h-4 animate-spin" />در حال ذخیره</>
              ) : (
                <><CheckCircle2 className="w-4 h-4" />ذخیره</>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => setAddDialogOpen(false)}
              className="flex-1 sm:flex-none border-gray-300 text-xs sm:text-sm h-9 sm:h-10"
            >
              انصراف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════
          Edit Dialog
      ════════════════════════════════ */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent
          className="w-[calc(100%-1.5rem)] sm:w-full sm:max-w-md lg:max-w-lg mx-auto rounded-xl"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-700 text-sm sm:text-base">
              <Edit2 className="w-4 h-4 sm:w-5 sm:h-5" />
              ویرایش دسته‌بندی
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              اطلاعات دسته‌بندی را ویرایش کنید
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-700">
                نام دسته‌بندی <span className="text-red-500">*</span>
              </label>
              <Input
                autoFocus
                type="text"
                placeholder="مثلاً: لباس مردانه"
                value={editFormName}
                onChange={(e) => setEditFormName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUpdate()}
                className="h-9 sm:h-10 text-sm border-gray-200 focus:border-blue-400"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-700">دسته والد</label>
              <Select value={editFormParentId} onValueChange={setEditFormParentId}>
                <SelectTrigger className="h-9 sm:h-10 text-sm border-gray-200">
                  <SelectValue placeholder="انتخاب دسته والد" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <span className="text-gray-500">بدون والد (دسته اصلی)</span>
                  </SelectItem>
                  {rootCategories
                    .filter((cat) => cat.id !== editingCategory?.id)
                    .map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
              <label className="text-xs font-medium text-gray-700">وضعیت فعال</label>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${editFormIsActive ? 'text-emerald-600' : 'text-gray-400'}`}>
                  {editFormIsActive ? 'فعال' : 'غیرفعال'}
                </span>
                <Switch checked={editFormIsActive} onCheckedChange={setEditFormIsActive} />
              </div>
            </div>
          </div>

          <DialogFooter className="flex-row-reverse sm:flex-row gap-2">
            <Button
              onClick={handleUpdate}
              disabled={saving}
              className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm h-9 sm:h-10 gap-1.5"
            >
              {saving ? (
                <><Loader2 className="w-4 h-4 animate-spin" />بروزرسانی...</>
              ) : (
                <><CheckCircle2 className="w-4 h-4" />بروزرسانی</>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              className="flex-1 sm:flex-none border-gray-300 text-xs sm:text-sm h-9 sm:h-10"
            >
              انصراف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════
          Delete Dialog
      ════════════════════════════════ */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent
          className="w-[calc(100%-1.5rem)] sm:w-full sm:max-w-sm lg:max-w-md mx-auto rounded-xl"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700 text-sm sm:text-base">
              <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5" />
              حذف دسته‌بندی
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              آیا از حذف این دسته‌بندی اطمینان دارید؟
            </DialogDescription>
          </DialogHeader>

          {deletingCategory && (
            <div className="space-y-3 py-3">
              {/* Category info */}
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Grid3x3 className="w-4 h-4 text-red-600 shrink-0" />
                  <span className="font-bold text-sm text-gray-900">{deletingCategory.name}</span>
                </div>
                {deletingCategory.parent?.name && (
                  <p className="text-xs text-gray-500 pr-6">والد: {deletingCategory.parent.name}</p>
                )}
                <p className="text-xs text-gray-500 pr-6">{toFaNum(deletingCategory.productCount)} محصول</p>
              </div>

              {/* Children warning */}
              {hasChildren && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-700">
                      <p className="font-medium">
                        این دسته‌بندی {toFaNum(deletingCategory.children!.length)} زیردسته دارد.
                      </p>
                      <p className="mt-0.5">با حذف این دسته‌بندی، زیردسته‌ها تحت تأثیر قرار می‌گیرند.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Products warning */}
              {deletingCategory.productCount > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-700">
                      <p className="font-medium">
                        {toFaNum(deletingCategory.productCount)} محصول در این دسته‌بندی وجود دارد.
                      </p>
                      <p className="mt-0.5">قبل از حذف، محصولات را به دسته‌بندی دیگری منتقل کنید.</p>
                    </div>
                  </div>
                </div>
              )}

              <p className="text-xs text-red-600 font-semibold text-center">
                این عملیات قابل بازگشت نیست!
              </p>
            </div>
          )}

          <DialogFooter className="flex-row-reverse sm:flex-row gap-2">
            <Button
              onClick={handleDelete}
              disabled={deleting || (deletingCategory?.productCount ?? 0) > 0}
              className="flex-1 sm:flex-none bg-red-600 hover:bg-red-700 text-white font-bold text-xs sm:text-sm h-9 sm:h-10 gap-1.5"
            >
              {deleting ? (
                <><Loader2 className="w-4 h-4 animate-spin" />در حال حذف</>
              ) : (
                <><Trash2 className="w-4 h-4" />حذف</>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              className="flex-1 sm:flex-none border-gray-300 text-xs sm:text-sm h-9 sm:h-10"
            >
              انصراف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}