'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
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
  CloudOff,
  Upload,
  RefreshCw,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

// ============ Helpers ============
function toFaNum(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return '۰'
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)])
}

function getAuthHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

// ★ Custom Switch با رنگ‌بندی دقیق: آبی برای فعال، خاکستری کدر برای غیرفعال
// ★ Custom Switch با رنگ‌بندی دقیق و موقعیت‌دهی صحیح در RTL
// رنگ آبی برای checked (فعال) و خاکستری کدر برای unchecked (غیرفعال)
// موقعیت دایره: راست برای فعال، چپ برای غیرفعال (در RTL و LTR یکسان)
function CustomSwitch({
  checked,
  onCheckedChange,
  disabled = false,
}: {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      } ${
        checked
          ? 'bg-blue-600'   // ★ آبی روشن برای حالت فعال
          : 'bg-gray-300'   // ★ خاکستری کدر برای حالت غیرفعال
      }`}
    >
      <span className="sr-only">وضعیت فعال</span>
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute top-0 h-5 w-5 rounded-full bg-white shadow ring-0 transition-all duration-200 ease-in-out ${
          checked ? 'right-0' : 'left-0'
        }`}
      />
    </button>
  )
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
  _offlineAction?: 'create' | 'update' | 'delete'
  _syncStatus?: 'pending' | 'syncing' | 'failed'
}

// ============ Main Component ============

export default function CategoriesPage() {
  const { toast } = useToast()

  const currentTenant = useAppStore((s) => s.currentTenant)
  const tenantId = useAppStore((s) => s.tenantId)
  const isOnline = useAppStore((s) => s.isOnline)

  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)

  const [formName, setFormName] = useState('')
  const [formParentId, setFormParentId] = useState<string>('none')
  const [formIsActive, setFormIsActive] = useState(true)

  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [editFormName, setEditFormName] = useState('')
  const [editFormParentId, setEditFormParentId] = useState<string>('none')
  const [editFormIsActive, setEditFormIsActive] = useState(true)

  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ============ Load Data ============
  const loadCategories = useCallback(async () => {
    setLoading(true)
    const trulyOnline = isOnline && navigator.onLine

    if (!trulyOnline) {
      console.log('[Categories] 📡 آفلاین — بارگذاری از cache...')
      try {
        const { getCachedCategories } = await import('@/lib/offline-db')
        const cached = await getCachedCategories()
        if (cached.length > 0) {
          setCategories(cached.map((c: any) => ({ ...c, _isOffline: true })))
          console.log(`[Categories] ✅ ${toFaNum(cached.length)} دسته از cache بارگذاری شد`)
          if (!isOnline) {
            toast({
              title: '📡 حالت آفلاین',
              description: 'دسته‌بندی‌ها از حافظه محلی بارگذاری شدند',
              duration: 3000,
            })
          }
        } else {
          setCategories([])
          if (!isOnline) {
            toast({
              title: '📡 حالت آفلاین',
              description: 'داده‌ای در حافظه محلی یافت نشد. لطفاً یک‌بار آنلاین وارد شوید.',
              duration: 3000,
            })
          }
        }
      } catch (err) {
        console.error('[Categories] خطا در بارگذاری cache:', err)
        setCategories([])
      }
      setLoading(false)
      return
    }

    try {
      const headers = getAuthHeaders()
      const res = await fetch(`/api/categories?tenantId=${tenantId}`, { headers })
      const json = await res.json()
      if (json.success && json.data) {
        const cats = json.data.categories || json.data
        if (Array.isArray(cats)) {
          setCategories(cats)
          try {
            const { cacheCategories } = await import('@/lib/offline-db')
            await cacheCategories(cats)
            console.log(`[Categories] ✅ ${toFaNum(cats.length)} دسته cache شد`)
          } catch {}
        } else {
          setCategories([])
        }
      } else {
        setCategories([])
      }
    } catch (error) {
      console.error('Error loading categories:', error)
      try {
        const { getCachedCategories } = await import('@/lib/offline-db')
        const cached = await getCachedCategories()
        if (cached.length > 0) {
          setCategories(cached.map((c: any) => ({ ...c, _isOffline: true })))
          toast({
            title: '⚠️ خطای شبکه',
            description: 'از داده‌های ذخیره‌شده استفاده شد',
            duration: 3000,
          })
        } else {
          setCategories([])
        }
      } catch {
        setCategories([])
      }
    }
    setLoading(false)
  }, [tenantId, isOnline, toast])

  useEffect(() => {
    if (tenantId) {
      loadCategories()
    }
  }, [tenantId, loadCategories])

  useEffect(() => {
    const handleOnline = () => {
      console.log('[Categories] 🟢 آنلاین شد — همگام‌سازی...')
      try { (useAppStore.getState() as any).setOnline?.(true) } catch {}
      import('@/lib/sync-engine').then(({ syncEngine }) => {
        syncEngine.init()
        syncEngine.sync().then(() => {
          loadCategories()
        }).catch((err) => {
          console.error('[Categories] Sync failed:', err)
        })
      }).catch(() => {})
    }
    const handleOffline = () => {
      console.log('[Categories] 🔴 آفلاین شد')
      try { (useAppStore.getState() as any).setOnline?.(false) } catch {}
      toast({
        title: '📡 اتصال قطع شد',
        description: 'حالت آفلاین فعال شد — تغییرات پس از اتصال همگام‌سازی می‌شوند',
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

  useEffect(() => {
    if (isOnline && navigator.onLine && categories.some(c => c._isOffline)) {
      const timer = setTimeout(() => {
        loadCategories()
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [isOnline, loadCategories, categories])

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

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return flatCategories
    const q = searchQuery.trim().toLowerCase()
    return flatCategories.filter(
      (cat) =>
        cat.name.toLowerCase().includes(q) ||
        (cat.parent?.name && cat.parent.name.toLowerCase().includes(q))
    )
  }, [flatCategories, searchQuery])

  const rootCategories = useMemo(() => {
    return categories.filter((c) => !c.parentId)
  }, [categories])

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
      toast({ title: 'خطا', description: 'نام دسته‌بندی الزامی است', variant: 'destructive' })
      return
    }
    const trulyOnline = isOnline && navigator.onLine

    if (!trulyOnline) {
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
        const tempCat: Category = {
          id: `offline-${Date.now()}`,
          name: formName.trim(),
          parentId: formParentId === 'none' ? null : formParentId,
          isActive: formIsActive,
          tenantId: tenantId || '',
          productCount: 0,
          _isOffline: true,
          _offlineAction: 'create',
          _syncStatus: 'pending',
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
        console.error('[Categories] Offline save error:', error)
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
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (json.success) {
        toast({ title: '✓ دسته‌بندی اضافه شد', description: json.message || 'عملیات موفق' })
        setAddDialogOpen(false)
        setFormName('')
        setFormParentId('none')
        setFormIsActive(true)
        await loadCategories()
      } else {
        toast({ title: 'خطا', description: json.error || 'خطا در ذخیره دسته‌بندی', variant: 'destructive' })
      }
    } catch (error) {
      console.error('[Categories] Online save error:', error)
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
        const tempCat: Category = {
          id: `offline-${Date.now()}`,
          name: formName.trim(),
          parentId: formParentId === 'none' ? null : formParentId,
          isActive: formIsActive,
          tenantId: tenantId || '',
          productCount: 0,
          _isOffline: true,
          _offlineAction: 'create',
          _syncStatus: 'pending',
        }
        setCategories((prev) => [...prev, tempCat])
        toast({
          title: '⚠️ ذخیره آفلاین',
          description: 'ارتباط با سرور برقرار نشد. دسته‌بندی آفلاین ذخیره شد.',
          duration: 4000,
        })
        setAddDialogOpen(false)
      } catch {
        toast({ title: 'خطا', description: 'خطا در ذخیره دسته‌بندی', variant: 'destructive' })
      }
    }
    setSaving(false)
  }, [formName, formParentId, formIsActive, tenantId, isOnline, loadCategories, toast])

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
      toast({ title: 'خطا', description: 'نام دسته‌بندی الزامی است', variant: 'destructive' })
      return
    }
    const trulyOnline = isOnline && navigator.onLine

    if (!trulyOnline) {
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
                  _offlineAction: 'update',
                  _syncStatus: 'pending',
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
        console.error('[Categories] Offline update error:', error)
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
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (json.success) {
        toast({ title: '✓ دسته‌بندی بروزرسانی شد', description: json.message || 'عملیات موفق' })
        setEditDialogOpen(false)
        setEditingCategory(null)
        await loadCategories()
      } else {
        toast({ title: 'خطا', description: json.error || 'خطا در بروزرسانی دسته‌بندی', variant: 'destructive' })
      }
    } catch (error) {
      console.error('[Categories] Online update error:', error)
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
                  _offlineAction: 'update',
                  _syncStatus: 'pending',
                }
              : c
          )
        )
        toast({
          title: '⚠️ ذخیره آفلاین',
          description: 'ارتباط با سرور برقرار نشد. تغییرات آفلاین ذخیره شد.',
          duration: 4000,
        })
        setEditDialogOpen(false)
        setEditingCategory(null)
      } catch {
        toast({ title: 'خطا', description: 'خطا در بروزرسانی دسته‌بندی', variant: 'destructive' })
      }
    }
    setSaving(false)
  }, [editingCategory, editFormName, editFormParentId, editFormIsActive, tenantId, isOnline, loadCategories, toast])

  // ============ Delete Category handlers ============
  const openDeleteDialog = useCallback((cat: Category) => {
    setDeletingCategory(cat)
    setDeleteDialogOpen(true)
  }, [])

  const handleDelete = useCallback(async () => {
    if (!deletingCategory) return
    const trulyOnline = isOnline && navigator.onLine

    if (deletingCategory._isOffline && deletingCategory._offlineAction === 'create') {
      setDeleting(true)
      try {
        setCategories((prev) => prev.filter((c) => c.id !== deletingCategory.id))
        toast({ title: '✓ حذف شد', description: 'دسته‌بندی آفلاین حذف شد' })
        setDeleteDialogOpen(false)
        setDeletingCategory(null)
      } catch (error) {
        toast({ title: 'خطا', description: 'خطا در حذف آفلاین', variant: 'destructive' })
      }
      setDeleting(false)
      return
    }

    if (!trulyOnline) {
      setDeleting(true)
      try {
        const { addToSyncQueue } = await import('@/lib/offline-db')
        await addToSyncQueue('category', {
          method: 'DELETE',
          url: `/api/categories/${deletingCategory.id}?tenantId=${tenantId}`,
          body: {},
        })
        setCategories((prev) =>
          prev.map((c) =>
            c.id === deletingCategory.id
              ? { ...c, _isOffline: true, _offlineAction: 'delete', _syncStatus: 'pending' }
              : c
          )
        )
        toast({
          title: '📡 در صف حذف قرار گرفت',
          description: 'دسته‌بندی پس از اتصال از سرور حذف می‌شود',
          duration: 4000,
        })
        setDeleteDialogOpen(false)
        setDeletingCategory(null)
      } catch (error) {
        console.error('[Categories] Offline delete error:', error)
        toast({ title: 'خطا', description: 'خطا در حذف آفلاین', variant: 'destructive' })
      }
      setDeleting(false)
      return
    }

    setDeleting(true)
    try {
      const res = await fetch(`/api/categories/${deletingCategory.id}?tenantId=${tenantId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      const json = await res.json()
      if (json.success) {
        toast({ title: '✓ دسته‌بندی حذف شد', description: json.message || 'عملیات موفق' })
        setCategories((prev) => prev.filter((c) => c.id !== deletingCategory.id))
        setDeleteDialogOpen(false)
        setDeletingCategory(null)
        await loadCategories()
      } else {
        toast({ title: 'خطا', description: json.error || 'خطا در حذف دسته‌بندی', variant: 'destructive' })
      }
    } catch (error) {
      console.error('[Categories] Online delete error:', error)
      try {
        const { addToSyncQueue } = await import('@/lib/offline-db')
        await addToSyncQueue('category', {
          method: 'DELETE',
          url: `/api/categories/${deletingCategory.id}?tenantId=${tenantId}`,
          body: {},
        })
        setCategories((prev) =>
          prev.map((c) =>
            c.id === deletingCategory.id
              ? { ...c, _isOffline: true, _offlineAction: 'delete', _syncStatus: 'pending' }
              : c
          )
        )
        toast({
          title: '⚠️ حذف آفلاین',
          description: 'ارتباط با سرور برقرار نشد. حذف پس از اتصال انجام می‌شود.',
          duration: 4000,
        })
        setDeleteDialogOpen(false)
        setDeletingCategory(null)
      } catch {
        toast({ title: 'خطا', description: 'خطا در حذف دسته‌بندی', variant: 'destructive' })
      }
    }
    setDeleting(false)
  }, [deletingCategory, tenantId, isOnline, loadCategories, toast])

    // ============ Category stats ============
  const totalCategories = categories.length
  const activeCategories = categories.filter((c) => c.isActive && c._offlineAction !== 'delete').length
  const rootCount = categories.filter((c) => !c.parentId && c._offlineAction !== 'delete').length
  const offlineCount = categories.filter((c) => c._isOffline && c._offlineAction !== 'delete').length
  const pendingDeleteCount = categories.filter((c) => c._offlineAction === 'delete').length

  const hasChildren = deletingCategory?.children && deletingCategory.children.length > 0

  const triggerSync = useCallback(async () => {
    if (isSyncing || !isOnline) return
    setIsSyncing(true)
    try {
      const { syncEngine } = await import('@/lib/sync-engine')
      syncEngine.init()
      await syncEngine.sync()
      await loadCategories()
    } catch (err) {
      console.error('[Categories] Manual sync failed:', err)
      toast({ title: 'خطا در همگام‌سازی', description: 'لطفاً دوباره تلاش کنید', variant: 'destructive' })
    }
    setIsSyncing(false)
  }, [isSyncing, isOnline, loadCategories, toast])

  // ============ Render ============
  return (
    <div className="flex flex-col h-full bg-gray-50/80" dir="rtl">
      <header className="bg-white border-b border-gray-200 px-3 sm:px-5 lg:px-6 py-3 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 lg:w-10 lg:h-10 rounded-lg bg-blue-600 text-white shrink-0">
              <Grid3x3 className="w-4 h-4 sm:w-4.5 sm:h-4.5 lg:w-5 lg:h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base lg:text-lg font-bold text-gray-900 leading-tight">
                دسته‌بندی‌ها
              </h1>
              <p className="text-[10px] sm:text-xs text-gray-500 hidden sm:block">
                مدیریت دسته‌بندی‌های کالاها
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap justify-end">
            {!isOnline && (
              <Badge variant="outline" className="gap-1 text-[10px] border-amber-300 text-amber-700 bg-amber-50 px-1.5 py-0.5">
                <WifiOff className="w-2.5 h-2.5" />
                <span className="hidden sm:inline">آفلاین</span>
              </Badge>
            )}

            {offlineCount > 0 && (
              <Badge
                variant="outline"
                className="gap-1 text-[10px] border-blue-300 text-blue-700 bg-blue-50 cursor-pointer px-1.5 py-0.5"
                onClick={() => isOnline && triggerSync()}
                title="کلیک کنید تا همگام‌سازی شود"
              >
                {isSyncing ? (
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                ) : (
                  <Upload className="w-2.5 h-2.5" />
                )}
                <span className="hidden sm:inline">{toFaNum(offlineCount)} در انتظار</span>
                <span className="sm:hidden">{toFaNum(offlineCount)}</span>
              </Badge>
            )}

            {isOnline && offlineCount > 0 && !isSyncing && (
              <Button
                variant="outline"
                size="sm"
                onClick={triggerSync}
                className="h-8 sm:h-9 text-xs border-blue-300 text-blue-600 hover:bg-blue-50 px-2 sm:px-3"
              >
                <RefreshCw className="w-3 h-3 sm:w-3.5 sm:h-3.5 sm:ml-1" />
                <span className="hidden sm:inline">همگام‌سازی</span>
              </Button>
            )}

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

      {!isOnline && offlineCount > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border-b border-amber-200 px-3 sm:px-5 py-2 shrink-0">
          <CloudOff className="w-4 h-4 text-amber-600 shrink-0" />
          <div className="flex-1 text-xs text-amber-700">
            <span className="font-bold">{toFaNum(offlineCount)} تغییر آفلاین </span>
            <span className="hidden sm:inline">در انتظار همگام‌سازی با سرور هستند.</span>
            <span className="sm:hidden">در انتظار sync</span>
          </div>
        </div>
      )}

      <div className="bg-white border-b border-gray-100 px-3 sm:px-5 lg:px-6 py-2 shrink-0">
        <div className="flex items-center gap-3 sm:gap-5 lg:gap-6 text-[10px] sm:text-xs text-gray-500 flex-wrap">
          <span>
            مجموع:{' '}
            <strong className="text-gray-900">{toFaNum(totalCategories - pendingDeleteCount)}</strong>{' '}
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

      <div className="bg-white border-b border-gray-100 px-3 sm:px-5 lg:px-6 py-2 sm:py-2.5 shrink-0 hidden sm:block">
        <div className="flex items-center gap-2 lg:gap-3">
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
                      کالاها
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
                              <Badge
                                variant="outline"
                                className={`text-[9px] h-4 px-1 shrink-0 ${
                                  cat._offlineAction === 'delete'
                                    ? 'border-red-300 text-red-600 bg-red-50'
                                    : cat._offlineAction === 'create'
                                    ? 'border-emerald-300 text-emerald-600 bg-emerald-50'
                                    : 'border-amber-300 text-amber-600 bg-amber-50'
                                }`}
                              >
                                {cat._offlineAction === 'delete' ? 'حذف آفلاین' :
                                 cat._offlineAction === 'create' ? 'جدید آفلاین' :
                                 'ویرایش آفلاین'}
                              </Badge>
                            )}
                            {nodeHasChildren && (
                              <Badge variant="secondary" className="text-[9px] bg-gray-100 text-gray-500 h-4 px-1 shrink-0">
                                {toFaNum(cat.children!.length)}
                              </Badge>
                            )}
                            {cat.parent?.name && (
                              <span className="text-[10px] text-gray-400 lg:hidden truncate">
                                ({cat.parent.name})
                              </span>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="py-2 text-xs text-gray-500 hidden lg:table-cell">
                          {cat.parent?.name || (
                            <span className="text-gray-300">دسته اصلی</span>
                          )}
                        </TableCell>

                        <TableCell className="py-2 text-center">
                          <Badge variant="outline" className="text-[10px] font-medium border-gray-200 whitespace-nowrap">
                            {toFaNum(cat.productCount)}
                            <span className="hidden lg:inline"> کالا</span>
                          </Badge>
                        </TableCell>

                        <TableCell className="py-2 text-center">
                          {cat.isActive ? (
                            <Badge className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-50 gap-0.5">
                              <CheckCircle2 className="w-3 h-3" />
                              <span className="hidden lg:inline">فعال</span>
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] border-gray-300 text-gray-500">
                              <span className="hidden lg:inline">غیرفعال</span>
                              <span className="lg-hidden">—</span>
                            </Badge>
                          )}
                        </TableCell>

                        <TableCell className="py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog(cat)}
                              disabled={cat._offlineAction === 'delete'}
                              className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50 disabled:text-gray-300 disabled:hover:bg-transparent"
                              title={cat._offlineAction === 'delete' ? 'این دسته در صف حذف است' : 'ویرایش'}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDeleteDialog(cat)}
                              disabled={cat._offlineAction === 'delete'}
                              className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 disabled:text-gray-300 disabled:hover:bg-transparent"
                              title={cat._offlineAction === 'delete' ? 'در صف حذف' : 'حذف'}
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
                      <div className="flex items-center gap-1.5">
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

                        <span className="font-semibold text-sm text-gray-900 flex-1 truncate">
                          {cat.name}
                        </span>

                        {cat.isActive ? (
                          <Badge className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-50 shrink-0 px-1.5">
                            فعال
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] border-gray-300 text-gray-500 shrink-0 px-1.5">
                            غیرفعال
                          </Badge>
                        )}

                        <div className="flex items-center gap-0.5 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(cat)}
                            disabled={cat._offlineAction === 'delete'}
                            className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50 disabled:text-gray-300 disabled:hover:bg-transparent"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteDialog(cat)}
                            disabled={cat._offlineAction === 'delete'}
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 disabled:text-gray-300 disabled:hover:bg-transparent"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 mt-1.5 pr-8 flex-wrap">
                        {cat.parent?.name && (
                          <span className="text-[10px] text-gray-400">
                            والد: <span className="text-gray-600">{cat.parent.name}</span>
                          </span>
                        )}
                        <span className="text-[10px] text-gray-400">
                          {toFaNum(cat.productCount)} کالا
                        </span>
                        {nodeHasChildren && (
                          <span className="text-[10px] text-blue-500">
                            {toFaNum(cat.children!.length)} زیردسته
                          </span>
                        )}
                        {cat._isOffline && (
                          <Badge
                            variant="outline"
                            className={`text-[9px] h-4 px-1 ${
                              cat._offlineAction === 'delete'
                                ? 'border-red-300 text-red-600 bg-red-50'
                                : cat._offlineAction === 'create'
                                ? 'border-emerald-300 text-emerald-600 bg-emerald-50'
                                : 'border-amber-300 text-amber-600 bg-amber-50'
                            }`}
                          >
                            {cat._offlineAction === 'delete' ? 'حذف آفلاین' :
                             cat._offlineAction === 'create' ? 'جدید آفلاین' :
                             'ویرایش آفلاین'}
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
              دسته‌بندی جدید برای کالاها ایجاد کنید
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
                <SelectContent className="z-[99999]">
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
              <div className="flex flex-col">
                <label className="text-xs font-medium text-gray-700">وضعیت فعال</label>
                <span className="text-[10px] text-gray-400 mt-0.5">
                  {formIsActive ? 'این دسته در فروشگاه نمایش داده می‌شود' : 'این دسته مخفی خواهد بود'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium transition-colors ${
                  formIsActive ? 'text-blue-600' : 'text-gray-400'
                }`}>
                  {formIsActive ? 'فعال' : 'غیرفعال'}
                </span>
                <CustomSwitch checked={formIsActive} onCheckedChange={setFormIsActive} />
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
                <SelectContent className="z-[99999]">
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
              <div className="flex flex-col">
                <label className="text-xs font-medium text-gray-700">وضعیت فعال</label>
                <span className="text-[10px] text-gray-400 mt-0.5">
                  {editFormIsActive ? 'این دسته در فروشگاه نمایش داده می‌شود' : 'این دسته مخفی خواهد بود'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium transition-colors ${
                  editFormIsActive ? 'text-blue-600' : 'text-gray-400'
                }`}>
                  {editFormIsActive ? 'فعال' : 'غیرفعال'}
                </span>
                <CustomSwitch checked={editFormIsActive} onCheckedChange={setEditFormIsActive} />
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
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Grid3x3 className="w-4 h-4 text-red-600 shrink-0" />
                  <span className="font-bold text-sm text-gray-900">{deletingCategory.name}</span>
                </div>
                {deletingCategory.parent?.name && (
                  <p className="text-xs text-gray-500 pr-6">والد: {deletingCategory.parent.name}</p>
                )}
                <p className="text-xs text-gray-500 pr-6">{toFaNum(deletingCategory.productCount)} کالا</p>
              </div>

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

              {deletingCategory.productCount > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-700">
                      <p className="font-medium">
                        {toFaNum(deletingCategory.productCount)} کالا در این دسته‌بندی وجود دارد.
                      </p>
                      <p className="mt-0.5">قبل از حذف، کالاها را به دسته‌بندی دیگری منتقل کنید.</p>
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