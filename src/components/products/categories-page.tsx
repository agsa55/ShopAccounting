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
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

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

  // Store fields
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
    try {
      const res = await fetch(`/api/categories?tenantId=${tenantId}`)
      const json = await res.json()
      if (json.success && json.data) {
        const cats = json.data.categories || json.data
        if (Array.isArray(cats)) {
          setCategories(cats)
        } else {
          setCategories([])
        }
      } else {
        setCategories([])
      }
    } catch (error) {
      console.error('Error loading categories:', error)
      setCategories([])
    }
    setLoading(false)
  }, [tenantId])

  useEffect(() => {
    if (tenantId) {
      loadCategories()
    }
  }, [tenantId, loadCategories])

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

  // ============ Flat list for table (with level) ============

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
  }, [categoryTree])

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

  // Check if deleting category has children
  const hasChildren = deletingCategory?.children && deletingCategory.children.length > 0

  // ============ Render ============

  return (
    <div className="flex flex-col h-full bg-gray-50/80" dir="rtl">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-3 sm:px-6 py-3 sm:py-4 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-blue-600 text-white">
              <Grid3x3 className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h1 className="text-sm sm:text-lg font-bold text-gray-900">دسته‌بندی‌ها</h1>
              <p className="text-[10px] sm:text-xs text-gray-500">مدیریت دسته‌بندی‌های محصولات</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {!isOnline && (
              <Badge variant="outline" className="gap-1 text-[10px] sm:text-xs border-amber-300 text-amber-700 bg-amber-50">
                <WifiOff className="w-3 h-3" />
                <span className="hidden sm:inline">آفلاین</span>
              </Badge>
            )}
            <Button
              onClick={openAddDialog}
              className="bg-blue-600 hover:bg-blue-700 text-white h-8 sm:h-9 px-2.5 sm:px-4 text-xs sm:text-sm"
            >
              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 ml-1 sm:ml-1.5" />
              <span className="hidden sm:inline">افزودن دسته‌بندی</span>
              <span className="sm:hidden">افزودن</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Stats Bar */}
      <div className="bg-white border-b border-gray-100 px-3 sm:px-6 py-2 sm:py-2.5 shrink-0">
        <div className="flex items-center gap-3 sm:gap-6 text-[10px] sm:text-xs text-gray-500">
          <span>
            مجموع: <strong className="text-gray-900">{totalCategories}</strong> دسته‌بندی
          </span>
          <span className="hidden sm:inline">
            فعال: <strong className="text-emerald-600">{activeCategories}</strong>
          </span>
          <span className="hidden sm:inline">
            دسته اصلی: <strong className="text-blue-600">{rootCount}</strong>
          </span>
        </div>
      </div>

      {/* Search + Controls */}
      <div className="bg-white border-b border-gray-100 px-3 sm:px-6 py-2 sm:py-3 shrink-0">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="جستجوی دسته‌بندی..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-9 h-8 sm:h-9 bg-gray-50 border-gray-200 focus:bg-white focus:border-blue-400 focus:ring-blue-400/20 text-xs sm:text-sm"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 sm:h-8 text-[10px] sm:text-xs border-gray-200 text-gray-600"
              onClick={expandAll}
            >
              <ChevronDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 ml-1" />
              <span className="hidden sm:inline">باز کردن همه</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 sm:h-8 text-[10px] sm:text-xs border-gray-200 text-gray-600"
              onClick={collapseAll}
            >
              <ChevronLeft className="w-3 h-3 sm:w-3.5 sm:h-3.5 ml-1" />
              <span className="hidden sm:inline">بستن همه</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          /* Loading State */
          <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-gray-400">
            <Loader2 className="w-8 h-8 sm:w-10 sm:h-10 animate-spin text-blue-600 mb-3" />
            <p className="text-xs sm:text-sm font-medium">در حال بارگذاری</p>
          </div>
        ) : filteredCategories.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-gray-400">
            <FolderTree className="w-10 h-10 sm:w-14 sm:h-14 mb-3 opacity-40" />
            <p className="text-xs sm:text-sm font-medium">دسته‌بندی یافت نشد</p>
            <p className="text-[10px] sm:text-xs mt-1 text-gray-300">
              {searchQuery ? 'عبارت دیگری را جستجو کنید' : 'اولین دسته‌بندی خود را ایجاد کنید'}
            </p>
            {!searchQuery && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4 border-blue-300 text-blue-600 text-xs"
                onClick={openAddDialog}
              >
                <Plus className="w-3.5 h-3.5 ml-1" />
                افزودن دسته‌بندی
              </Button>
            )}
          </div>
        ) : (
          /* Categories List */
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                    <TableHead className="text-xs font-semibold text-gray-600 h-9">نام دسته‌بندی</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-600 h-9">دسته والد</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-600 h-9 text-center">تعداد محصولات</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-600 h-9 text-center">وضعیت</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-600 h-9 text-center">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCategories.map((cat) => {
                    const hasChildren = cat.children && cat.children.length > 0
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
                            style={{ paddingRight: `${cat.level * 24}px` }}
                          >
                            {/* Expand/collapse toggle */}
                            {hasChildren ? (
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

                            {/* Category icon + name */}
                            <Grid3x3 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span className="font-medium text-sm text-gray-900">{cat.name}</span>
                            {cat._isOffline && (
                              <Badge variant="outline" className="text-[9px] border-amber-300 text-amber-600 h-4 px-1 mr-1">
                                آفلاین
                              </Badge>
                            )}
                            {hasChildren && (
                              <Badge variant="secondary" className="text-[9px] bg-gray-100 text-gray-500 h-4 px-1 mr-1">
                                {cat.children!.length}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-2 text-xs text-gray-500">
                          {cat.parent?.name || (
                            <span className="text-gray-300">بدون والد (دسته اصلی)</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2 text-center">
                          <Badge variant="outline" className="text-[10px] font-medium border-gray-200">
                            {cat.productCount} محصول
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2 text-center">
                          {cat.isActive ? (
                            <Badge className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-50">
                              <CheckCircle2 className="w-3 h-3 ml-0.5" />
                              فعال
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] border-gray-300 text-gray-500">
                              غیرفعال
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                              onClick={() => openEditDialog(cat)}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-gray-400 hover:text-red-600 hover:bg-red-50"
                              onClick={() => openDeleteDialog(cat)}
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

            {/* Mobile Card View */}
            <div className="md:hidden p-3 space-y-2">
              {filteredCategories.map((cat) => {
                const hasChildren = cat.children && cat.children.length > 0
                const isExpanded = expandedIds.has(cat.id)

                return (
                  <Card
                    key={cat.id}
                    className={`border transition-colors ${
                      cat._isOffline ? 'border-amber-200 bg-amber-50/30' : 'border-gray-200'
                    }`}
                    style={{ marginRight: `${cat.level * 16}px` }}
                  >
                    <CardContent className="p-3">
                      {/* Top row: name + status */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          {hasChildren ? (
                            <button
                              onClick={() => toggleExpand(cat.id)}
                              className="flex items-center justify-center w-6 h-6 rounded-md hover:bg-gray-100 transition-colors shrink-0"
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
                          <span className="font-bold text-sm text-gray-900 truncate">{cat.name}</span>
                        </div>
                        {cat.isActive ? (
                          <Badge className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-50 shrink-0">
                            فعال
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] border-gray-300 text-gray-500 shrink-0">
                            غیرفعال
                          </Badge>
                        )}
                      </div>

                      {/* Details row */}
                      <div className="flex items-center gap-3 text-[10px] text-gray-500 mr-7.5">
                        {cat.parent?.name && (
                          <span>
                            والد: {cat.parent.name}
                          </span>
                        )}
                        <span>
                          {cat.productCount} محصول
                        </span>
                        {hasChildren && (
                          <span className="text-blue-600">
                            {cat.children!.length} زیردسته
                          </span>
                        )}
                        {cat._isOffline && (
                          <Badge variant="outline" className="text-[9px] border-amber-300 text-amber-600 h-4 px-1">
                            آفلاین
                          </Badge>
                        )}
                      </div>

                      {/* Actions row */}
                      <div className="flex items-center justify-end gap-1 mt-2 mr-7.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[10px] text-gray-500 hover:text-blue-600 hover:bg-blue-50"
                          onClick={() => openEditDialog(cat)}
                        >
                          <Edit2 className="w-3 h-3 ml-1" />
                          ویرایش
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[10px] text-gray-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => openDeleteDialog(cat)}
                        >
                          <Trash2 className="w-3 h-3 ml-1" />
                          حذف
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          Add Category Dialog
      ════════════════════════════════════════════════════════════════════ */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-[480px] w-[calc(100%-2rem)]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-700 text-sm sm:text-base">
              <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
              افزودن دسته‌بندی جدید
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              دسته‌بندی جدید برای محصولات ایجاد کنید
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3 sm:py-4">
            {/* Category Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-700">
                نام دسته‌بندی <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                placeholder="مثلاً: لباس مردانه"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="h-9 sm:h-10 text-sm border-gray-200 focus:border-blue-400 focus:ring-blue-400/20"
              />
            </div>

            {/* Parent Category */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-700">
                دسته والد
              </label>
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

            {/* Active Toggle */}
            <div className="flex items-center justify-between py-1">
              <label className="text-xs font-medium text-gray-700">وضعیت فعال</label>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${formIsActive ? 'text-emerald-600' : 'text-gray-400'}`}>
                  {formIsActive ? 'فعال' : 'غیرفعال'}
                </span>
                <Switch
                  checked={formIsActive}
                  onCheckedChange={setFormIsActive}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setAddDialogOpen(false)}
              className="border-gray-300 text-xs sm:text-sm h-9 sm:h-10"
            >
              انصراف
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm h-9 sm:h-10"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 ml-1.5 animate-spin" />
                  در حال ذخیره
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 ml-1.5" />
                  ذخیره
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════════════════
          Edit Category Dialog
      ════════════════════════════════════════════════════════════════════ */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[480px] w-[calc(100%-2rem)]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-700 text-sm sm:text-base">
              <Edit2 className="w-4 h-4 sm:w-5 sm:h-5" />
              ویرایش دسته‌بندی
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              اطلاعات دسته‌بندی را ویرایش کنید
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3 sm:py-4">
            {/* Category Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-700">
                نام دسته‌بندی <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                placeholder="مثلاً: لباس مردانه"
                value={editFormName}
                onChange={(e) => setEditFormName(e.target.value)}
                className="h-9 sm:h-10 text-sm border-gray-200 focus:border-blue-400 focus:ring-blue-400/20"
              />
            </div>

            {/* Parent Category */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-700">
                دسته والد
              </label>
              <Select value={editFormParentId} onValueChange={setEditFormParentId}>
                <SelectTrigger className="h-9 sm:h-10 text-sm border-gray-200">
                  <SelectValue placeholder="انتخاب دسته والد" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <span className="text-gray-500">بدون والد (دسته اصلی)</span>
                  </SelectItem>
                  {rootCategories
                    .filter((cat) => cat.id !== editingCategory?.id) // جلوگیری از انتخاب خودش به عنوان والد
                    .map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Active Toggle */}
            <div className="flex items-center justify-between py-1">
              <label className="text-xs font-medium text-gray-700">وضعیت فعال</label>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${editFormIsActive ? 'text-emerald-600' : 'text-gray-400'}`}>
                  {editFormIsActive ? 'فعال' : 'غیرفعال'}
                </span>
                <Switch
                  checked={editFormIsActive}
                  onCheckedChange={setEditFormIsActive}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              className="border-gray-300 text-xs sm:text-sm h-9 sm:h-10"
            >
              انصراف
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm h-9 sm:h-10"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 ml-1.5 animate-spin" />
                  در حال بروزرسانی
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 ml-1.5" />
                  بروزرسانی
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════════════════
          Delete Category Confirmation Dialog
      ════════════════════════════════════════════════════════════════════ */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[420px] w-[calc(100%-2rem)]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700 text-sm sm:text-base">
              <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5" />
              حذف دسته‌بندی
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              آیا از حذف این دسته‌بندی اطمینان دارید؟
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 sm:py-4">
            {deletingCategory && (
              <div className="space-y-3">
                {/* Category info */}
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Grid3x3 className="w-4 h-4 text-red-600" />
                    <span className="font-bold text-sm text-gray-900">{deletingCategory.name}</span>
                  </div>
                  {deletingCategory.parent?.name && (
                    <p className="text-xs text-gray-500 mr-6">
                      والد: {deletingCategory.parent.name}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mr-6">
                    {deletingCategory.productCount} محصول
                  </p>
                </div>

                {/* Warning for children */}
                {hasChildren && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="text-xs text-amber-700">
                        <p className="font-medium">این دسته‌بندی {deletingCategory.children!.length} زیردسته دارد.</p>
                        <p className="mt-1">با حذف این دسته‌بندی، زیردسته‌ها نیز ممکن است受到影响 شوند.</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Warning for products */}
                {deletingCategory.productCount > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="text-xs text-amber-700">
                        <p className="font-medium">{deletingCategory.productCount} محصول در این دسته‌بندی وجود دارد.</p>
                        <p className="mt-1">قبل از حذف، محصولات را به دسته‌بندی دیگری منتقل کنید.</p>
                      </div>
                    </div>
                  </div>
                )}

                <p className="text-xs text-red-600 font-medium text-center">
                  این عملیات قابل بازگشت نیست!
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              className="border-gray-300 text-xs sm:text-sm h-9 sm:h-10"
            >
              انصراف
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deleting || (deletingCategory?.productCount ?? 0) > 0}
              className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs sm:text-sm h-9 sm:h-10"
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 ml-1.5 animate-spin" />
                  در حال حذف
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 ml-1.5" />
                  حذف
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
