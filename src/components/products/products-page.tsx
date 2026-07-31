'use client'

// ============================================================================
// src/components/products/products-page.tsx (v8.9.0)
// ★ ریسپانسیو کامل موبایل / تبلت / دسکتاپ
// ★ نمای کارتی برای موبایل و تبلت (جدول فقط در lg به بالا)
// ★ هدر و دیالوگ‌ها اصلاح شد برای صفحات کوچک
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
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
  Package,
  Plus,
  Search,
  Edit2,
  Trash2,
  AlertTriangle,
  Loader2,
  Filter,
  RefreshCw,
  Printer,
  Barcode,
  Wand2,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { BarcodePrintModal } from './barcode-print-modal'

// ══════════════════════════
// Helpers
// ══════════════════════════
function toFaNum(n: number | string): string {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)])
}

// ★ تبدیل اعداد به فرمت فارسی با جداکننده هزارگان (برای ورودی زنده)
function formatToPersianWithCommas(value: string): string {
  if (!value) return ''
  // فقط اعداد (انگلیسی، فارسی و عربی) را نگه دار
  const raw = value.replace(/[^\d\u06F0-\u06F9\u0660-\u0669]/g, '')
  if (!raw) return ''
  
  // تبدیل به اعداد انگلیسی برای محاسبه
  const eng = raw
    .replace(/[\u06F0-\u06F9]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x06F0 + 0x0030))
    .replace(/[\u0660-\u0669]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x0660 + 0x0030))
    
  const num = parseInt(eng, 10)
  if (isNaN(num)) return ''
  
  // فرمت با کامای انگلیسی و سپس تبدیل به فارسی
  return toFaNum(num.toLocaleString('en-US'))
}

// ★ تبدیل مقدار فرمت‌شده فارسی به عدد استاندارد برای ذخیره در دیتابیس
function parsePersianNumber(value: string): number {
  if (!value) return 0
  const raw = value.replace(/[^\d\u06F0-\u06F9\u0660-\u0669]/g, '')
  if (!raw) return 0
  const eng = raw
    .replace(/[\u06F0-\u06F9]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x06F0 + 0x0030))
    .replace(/[\u0660-\u0669]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x0660 + 0x0030))
  return parseFloat(eng) || 0
}

// ★ نمایش قیمت با اعداد فارسی، جداکننده و واحد ریال
function formatPrice(price: number | string): string {
  const num = typeof price === 'string' ? parseFloat(price) : price
  if (isNaN(num)) return '۰ ریال'
  return `${toFaNum(num.toLocaleString('en-US'))} ریال`
}

// ★ helper: نمایش نام واحد — فقط nameFa یا name، بدون هیچ عبارت اضافه
function getUnitLabel(u: Unit): string {
  return u.nameFa || u.name
}

// ★ ترتیب دقیق واحدها طبق درخواست
const PREFERRED_UNITS = [
  'عدد', 'کیلوگرم', 'گرم', 'بسته', 'کارتن', 'بطری', 'جعبه',
  'متر', 'سانتی متر', 'میلی متر', 'لیتر', 'میلی لیتر',
  'حلقه', 'جفت', 'تن', 'جین', 'دسته', 'کیسه'
]

// ★ تابع مرتب‌سازی واحدها بر اساس ترتیب فوق
function sortUnits(unitsList: Unit[]): Unit[] {
  return [...unitsList].sort((a, b) => {
    const nameA = a.nameFa || a.name
    const nameB = b.nameFa || b.name
    const indexA = PREFERRED_UNITS.indexOf(nameA)
    const indexB = PREFERRED_UNITS.indexOf(nameB)
    
    if (indexA === -1 && indexB === -1) return 0
    if (indexA === -1) return 1 // موارد ناآشنا به انتها بروند
    if (indexB === -1) return -1
    return indexA - indexB
  })
}

// ══════════════════════════
// Types
// ══════════════════════════
interface Product {
  id: string
  code: string
  barcode?: string | null
  name: string
  categoryId?: string | null
  unitId?: string | null
  unitLabel?: string  // ★ واحد محصول
  purchasePrice: number
  salePrice: number
  taxRate: number
  currentStock: number
  minStock: number
  isActive: boolean
  tenantId?: string | null
  createdAt: string
  category?: { id: string; name: string } | null
  unit?: {
    id: string
    name: string
    nameFa: string
    symbol: string | null
  } | null
   _isOffline?: boolean 
}

interface Category {
  id: string
  name: string
  isActive: boolean
  productCount?: number
}

interface Unit {
  id: string
  name: string
  nameFa: string
  symbol: string | null
  isDefault?: boolean
}

interface PlanLimits {
  maxProducts: number
  currentCount: number
  remaining: number
  canAdd: boolean
  planTierName: string
}

// ★ فرم افزودن محصول
interface AddForm {
  name: string
  code: string
  barcode: string
  generateBarcode: boolean
  categoryId: string
  unitId: string
  purchasePrice: string
  salePrice: string
  taxRate: string
  minStock: string
  isActive: boolean
}

// ★ مقادیر پیش‌فرض اصلاح‌شده: مالیات ۰ و حداقل موجودی ۵
const INITIAL_ADD_FORM: AddForm = {
  name: '',
  code: '',
  barcode: '',
  generateBarcode: false,
  categoryId: 'none',
  unitId: 'none',
  purchasePrice: '0',
  salePrice: '0',
  taxRate: '0',
  minStock: '5',
  isActive: true,
}

// ══════════════════════════════════════════════════════════════════
// کامپوننت اصلی
// ══════════════════════════════════════════════════════════════════
export default function ProductsPage() {
  const tenantId = useAppStore((s) => s.tenantId)
  const [products, setProducts] = useState<Product[]>([])
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [planLimits, setPlanLimits] = useState<PlanLimits | null>(null)
  const [loading, setLoading] = useState(true)

  // ★ Pagination + Search
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  // ★ Dialog states
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [printModalOpen, setPrintModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [generatingCode, setGeneratingCode] = useState(false)

  const [addForm, setAddForm] = useState<AddForm>(INITIAL_ADD_FORM)
  // ★ مقادیر پیش‌فرض ادیت هم اصلاح شد
  const [editForm, setEditForm] = useState({
    id: '',
    name: '',
    code: '',
    barcode: '',
    categoryId: 'none',
    unitId: 'none',
    unitLabel: '',  // ★ واحد محصول
    purchasePrice: '0',
    salePrice: '0',
    taxRate: '0',
    minStock: '5',
    isActive: true,
  })
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null)
  const [deleting, setDeleting] = useState(false)
  const { toast } = useToast()

  // ══════════════════════════════════════════
  // ★ Load Products
  // ══════════════════════════════════════════
    const loadProducts = useCallback(
    async (pageNum: number = 1, searchTerm: string = '') => {
      setLoading(true)

      // ★ OFFLINE: خواندن از cache با فیلتر و صفحه‌بندی محلی
      if (!navigator.onLine) {
        console.log('[Products] 📡 آفلاین — بارگذاری از cache...')
        try {
          const { getCachedProducts } = await import('@/lib/offline-db')
          let cached: any[] = await getCachedProducts()
          // فیلتر جستجو
          if (searchTerm) {
            const q = searchTerm.toLowerCase()
            cached = cached.filter(
              (p: any) =>
                p.name?.toLowerCase().includes(q) ||
                p.code?.toLowerCase().includes(q) ||
                p.barcode?.includes(searchTerm)
            )
          }
          // فیلتر دسته
          if (selectedCategory && selectedCategory !== 'all') {
            cached = cached.filter((p: any) => p.categoryId === selectedCategory)
          }
          // صفحه‌بندی محلی (۱۲ در هر صفحه)
          const pageSize = 12
          const totalItems = cached.length
          const totalPagesCalc = Math.max(1, Math.ceil(totalItems / pageSize))
          const start = (pageNum - 1) * pageSize
          const pageItems = cached.slice(start, start + pageSize)
          setProducts(pageItems.map((p: any) => ({ ...p, _isOffline: true })))
          setTotal(totalItems)
          setTotalPages(totalPagesCalc)
          setPage(pageNum)
          console.log(`[Products] ✅ ${pageItems.length} محصول از cache بارگذاری شد`)
          toast({
            title: '📡 حالت آفلاین',
            description: 'محصولات از حافظه محلی بارگذاری شدند',
            duration: 3000,
          })
        } catch (err) {
          console.error('[Products] خطا در بارگذاری cache:', err)
          setProducts([])
        }
        setLoading(false)
        return
      }

      // ★ ONLINE: واکشی از سرور
      try {
        const params = new URLSearchParams({
          page: String(pageNum),
          limit: '12',
          sort: 'recent',
        })
        if (searchTerm) params.set('search', searchTerm)
        if (selectedCategory && selectedCategory !== 'all')
          params.set('categoryId', selectedCategory)

        const res = await fetch(`/api/products?${params.toString()}`)
        const json = await res.json()
        if (json.success) {
          setProducts(json.data || [])
          if (json.pagination) {
            setTotalPages(json.pagination.totalPages)
            setTotal(json.pagination.total)
            setPage(json.pagination.page)
          }
        } else {
          setProducts([])
        }
      } catch (error) {
        console.error('Error loading products:', error)
        // ★ خطای شبکه — تلاش برای خواندن از cache
        try {
          const { getCachedProducts } = await import('@/lib/offline-db')
          const cached = await getCachedProducts()
          if (cached.length > 0) {
            setProducts(cached.slice(0, 12).map((p: any) => ({ ...p, _isOffline: true })))
            setTotal(cached.length)
          } else {
            setProducts([])
          }
        } catch {
          setProducts([])
        }
      }
      setLoading(false)
    },
    [selectedCategory, toast]
  )

  // ★ بارگذاری همه محصولات برای چاپ بارکد
    const loadAllProducts = useCallback(async () => {
    // ★ OFFLINE: از cache بخوان
    if (!navigator.onLine) {
      try {
        const { getCachedProducts } = await import('@/lib/offline-db')
        const cached = await getCachedProducts()
        setAllProducts(cached)
      } catch {}
      return
    }
    // ★ ONLINE
    try {
      const res = await fetch(`/api/products?page=1&limit=1000&sort=recent`)
      const json = await res.json()
      if (json.success) {
        const all = json.data || []
        setAllProducts(all)
        // ★ ذخیره کامل در cache برای آفلاین
        try {
          const { cacheProducts } = await import('@/lib/offline-db')
          await cacheProducts(all)
          console.log(`[Products] ✅ ${all.length} محصول cache شد`)
        } catch {}
      }
    } catch (error) {
      console.error('Error loading all products:', error)
    }
  }, [])

  // ★ Debounced Search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== search) {
        setSearch(searchInput)
        loadProducts(1, searchInput)
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [searchInput, search, loadProducts])

  // ★ Load Categories
   const loadCategories = useCallback(async () => {
    // ★ OFFLINE
    if (!navigator.onLine) {
      try {
        const { getCachedCategories } = await import('@/lib/offline-db')
        const cached = await getCachedCategories()
        setCategories(cached.filter((c: any) => c.isActive !== false))
      } catch {
        setCategories([])
      }
      return
    }
    // ★ ONLINE
    try {
      const res = await fetch(`/api/categories?tenantId=${tenantId}`)
      const json = await res.json()
      if (json.success) {
        const cats = json.data.categories || json.data
        const activeCats = Array.isArray(cats) ? cats.filter((c: Category) => c.isActive) : []
        setCategories(activeCats)
        // ★ cache
        try {
          const { cacheCategories } = await import('@/lib/offline-db')
          await cacheCategories(Array.isArray(cats) ? cats : [])
        } catch {}
      }
    } catch (error) {
      console.error('Error loading categories:', error)
      try {
        const { getCachedCategories } = await import('@/lib/offline-db')
        const cached = await getCachedCategories()
        setCategories(cached.filter((c: any) => c.isActive !== false))
      } catch {
        setCategories([])
      }
    }
  }, [tenantId])

  // ★ Load Units
    const loadUnits = useCallback(async () => {
    // ★ OFFLINE: واحدها از localStorage (چون store جدا در IndexedDB ندارند)
    if (!navigator.onLine) {
      try {
        const cached = localStorage.getItem('cached_units')
        if (cached) {
          const data = JSON.parse(cached)
          setUnits(data.units || [])
        } else {
          setUnits([])
        }
      } catch {
        setUnits([])
      }
      return
    }
    // ★ ONLINE
    try {
      const res = await fetch(`/api/units?tenantId=${tenantId}`)
      const json = await res.json()
      if (json.success) {
        const uList = json.data.units || json.data
        const unitsArr = Array.isArray(uList) ? uList : []
        setUnits(unitsArr)
        // ★ cache در localStorage
        try {
          localStorage.setItem('cached_units', JSON.stringify({
            units: unitsArr,
            cachedAt: new Date().toISOString(),
          }))
        } catch {}
      }
    } catch (error) {
      console.error('Error loading units:', error)
      try {
        const cached = localStorage.getItem('cached_units')
        if (cached) {
          const data = JSON.parse(cached)
          setUnits(data.units || [])
        } else {
          setUnits([])
        }
      } catch {
        setUnits([])
      }
    }
  }, [tenantId])

  // ★ Load Plan Limits
  const loadPlanLimits = useCallback(async () => {
    if (!navigator.onLine) {
      setPlanLimits(null)
      return
    }
    try {
      const res = await fetch(
        `/api/plan-limits?tenantId=${tenantId}&feature=products`
      )
      const json = await res.json()
      setPlanLimits(json.success ? json.data : null)
    } catch (error) {

      console.error('Error loading plan limits:', error)
      setPlanLimits(null)
    }
  }, [tenantId])

  // ★ Initial Load
  useEffect(() => {
    loadProducts(1, '')
    loadCategories()
    loadUnits()
    loadPlanLimits()
    loadAllProducts()
  }, [loadProducts, loadCategories, loadUnits, loadPlanLimits, loadAllProducts])

    // ★ OFFLINE: گوش دادن به تغییرات اتصال
  useEffect(() => {
    const handleOnline = () => {
      console.log('[Products] 🟢 آنلاین شد — بارگذاری مجدد...')
      loadProducts(1, search)
      loadCategories()
      loadUnits()
      loadPlanLimits()
      loadAllProducts()
      // sync صف آفلاین
      import('@/lib/sync-engine').then(({ syncEngine }) => {
        syncEngine.init()
        syncEngine.sync().catch(() => {})
      }).catch(() => {})
    }
    const handleOffline = () => {
      console.log('[Products] 🔴 آفلاین شد')
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadProducts, loadCategories, loadUnits, loadPlanLimits, loadAllProducts, search])

  // ★ Reload on category change
  useEffect(() => {
    setPage(1)
    loadProducts(1, search)
  }, [selectedCategory, loadProducts, search])

  // ══════════════════════════════════════════
  // ★ دریافت کد اتوماتیک از سرور
  // ══════════════════════════════════════════
  const fetchNextCode = useCallback(async () => {
    setGeneratingCode(true)
    try {
      const res = await fetch('/api/products?action=nextCode')
      const json = await res.json()
      if (json.success && json.data?.code) {
        setAddForm((prev) => ({ ...prev, code: json.data.code }))
      }
    } catch (error) {
      console.error('Error fetching next code:', error)
      const count = products.length
      const fallbackCode = `PRD-${(count + 1).toString().padStart(6, '0')}`
      setAddForm((prev) => ({ ...prev, code: fallbackCode }))
    }
    setGeneratingCode(false)
  }, [products.length])

  // ★ هنگام باز شدن مودال افزودن، کد اتوماتیک بگیر
  const handleOpenAddDialog = useCallback(async () => {
    setAddForm(INITIAL_ADD_FORM)
    setAddDialogOpen(true)
    await fetchNextCode()
  }, [fetchNextCode])

  // ★ هنگام کلیک روی چک‌باکس تولید بارکد
  const handleGenerateBarcodeToggle = (checked: boolean) => {
    if (checked) {
      const timestamp = Date.now().toString().slice(-4)
      const random = Math.floor(Math.random() * 100)
        .toString()
        .padStart(2, '0')
      const barcode12 = '629123' + timestamp + random

      let sum = 0
      for (let i = 0; i < 12; i++) {
        const digit = parseInt(barcode12[i])
        const multiplier = i % 2 === 0 ? 1 : 3
        sum += digit * multiplier
      }
      const checkDigit = (10 - (sum % 10)) % 10
      const barcodeValue = barcode12 + checkDigit.toString()

      setAddForm((prev) => ({
        ...prev,
        generateBarcode: true,
        barcode: barcodeValue,
      }))
    } else {
      setAddForm((prev) => ({
        ...prev,
        generateBarcode: false,
        barcode: '',
      }))
    }
  }

  // ══════════════════════════════════════════
  // ★ Handlers
  // ══════════════════════════════════════════
  const handleAddProduct = async () => {
    if (!addForm.name.trim()) {
      toast({
        title: 'خطا',
        description: 'نام محصول الزامی است',
        variant: 'destructive',
      })
      return
    }
    if (!addForm.code.trim()) {
      toast({
        title: 'خطا',
        description: 'کد محصول الزامی است',
        variant: 'destructive',
      })
      return
    }

      // ★ OFFLINE: افزودن به صف + ثبت محلی خوش‌بینانه
  if (!navigator.onLine) {
    setSubmitting(true)
    try {
      const { addToSyncQueue } = await import('@/lib/offline-db')
      const body = {
        ...addForm,
        tenantId,
        purchasePrice: parsePersianNumber(addForm.purchasePrice),
        salePrice: parsePersianNumber(addForm.salePrice),
        taxRate: parsePersianNumber(addForm.taxRate),
        currentStock: 0,
        minStock: parsePersianNumber(addForm.minStock),
        categoryId: addForm.categoryId === 'none' ? null : addForm.categoryId,
        unitId: addForm.unitId === 'none' ? null : addForm.unitId,
        generateBarcode: addForm.generateBarcode && !addForm.barcode,
        barcode: addForm.barcode || null,
      }
      await addToSyncQueue('product', { method: 'POST', url: '/api/products', body })
      // ثبت محلی خوش‌بینانه
      const tempProduct: Product = {
        id: `offline-${Date.now()}`,
        code: addForm.code,
        barcode: addForm.barcode || null,
        name: addForm.name,
        categoryId: addForm.categoryId === 'none' ? null : addForm.categoryId,
        unitId: addForm.unitId === 'none' ? null : addForm.unitId,
        purchasePrice: parsePersianNumber(addForm.purchasePrice),
        salePrice: parsePersianNumber(addForm.salePrice),
        taxRate: parsePersianNumber(addForm.taxRate),
        currentStock: 0,
        minStock: parsePersianNumber(addForm.minStock),
        isActive: addForm.isActive,
        createdAt: new Date().toISOString(),
        _isOffline: true,
      }
      setProducts((prev) => [tempProduct, ...prev])
      setAllProducts((prev) => [tempProduct, ...prev])
      toast({
        title: '📡 در صف ذخیره شد',
        description: 'محصول پس از اتصال به سرور ثبت می‌شود',
        duration: 4000,
      })
      setAddDialogOpen(false)
      setAddForm(INITIAL_ADD_FORM)
    } catch (error: any) {
      toast({ title: 'خطا', description: error?.message, variant: 'destructive' })
    }
    setSubmitting(false)
    return
  }

    setSubmitting(true)
    try {
      const body = {
        ...addForm,
        tenantId,
        purchasePrice: parsePersianNumber(addForm.purchasePrice),
        salePrice: parsePersianNumber(addForm.salePrice),
        taxRate: parsePersianNumber(addForm.taxRate),
        currentStock: 0,
        minStock: parsePersianNumber(addForm.minStock),
        categoryId: addForm.categoryId === 'none' ? null : addForm.categoryId,
        unitId: addForm.unitId === 'none' ? null : addForm.unitId,
        generateBarcode: addForm.generateBarcode && !addForm.barcode,
        barcode: addForm.barcode || null,
      }

      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (json.success) {
        toast({
          title: 'موفق',
          description: json.data.barcode
            ? `محصول ایجاد شد. بارکد: ${json.data.barcode}`
            : 'محصول با موفقیت ایجاد شد',
        })
        setAddDialogOpen(false)
        setAddForm(INITIAL_ADD_FORM)
        loadProducts(page, search)
        loadAllProducts()
        loadPlanLimits()
      } else {
        toast({ title: 'خطا', description: json.error, variant: 'destructive' })
      }
    } catch (error: any) {
      toast({
        title: 'خطا',
        description: error?.message,
        variant: 'destructive',
      })
    }
    setSubmitting(false)
  }

  const handleEditProduct = async () => {
    if (!editForm.name.trim() || !editForm.code.trim()) {
      toast({
        title: 'خطا',
        description: 'نام و کد محصول الزامی است',
        variant: 'destructive',
      })
      return
    }

      // ★ OFFLINE: ویرایش در صف + بروزرسانی محلی خوش‌بینانه
  if (!navigator.onLine) {
    setSubmitting(true)
    try {
      const { addToSyncQueue } = await import('@/lib/offline-db')
      const body = {
        id: editForm.id,
        tenantId,
        name: editForm.name,
        code: editForm.code,
        barcode: editForm.barcode || null,
        categoryId: editForm.categoryId === 'none' ? null : editForm.categoryId,
        unitId: editForm.unitId === 'none' ? null : editForm.unitId,
        unitLabel: editForm.unitLabel,
        purchasePrice: parsePersianNumber(editForm.purchasePrice),
        salePrice: parsePersianNumber(editForm.salePrice),
        taxRate: parsePersianNumber(editForm.taxRate),
        minStock: parsePersianNumber(editForm.minStock),
        isActive: editForm.isActive,
      }
      await addToSyncQueue('product', { method: 'PUT', url: '/api/products', body })
      setProducts((prev) =>
        prev.map((p) =>
          p.id === editForm.id
            ? {
                ...p,
                name: editForm.name,
                code: editForm.code,
                barcode: editForm.barcode || null,
                categoryId: editForm.categoryId === 'none' ? null : editForm.categoryId,
                unitId: editForm.unitId === 'none' ? null : editForm.unitId,
                purchasePrice: parsePersianNumber(editForm.purchasePrice),
                salePrice: parsePersianNumber(editForm.salePrice),
                taxRate: parsePersianNumber(editForm.taxRate),
                minStock: parsePersianNumber(editForm.minStock),
                isActive: editForm.isActive,
                _isOffline: true,
              }
            : p
        )
      )
      toast({
        title: '📡 در صف بروزرسانی قرار گرفت',
        description: 'تغییرات پس از اتصال اعمال می‌شود',
        duration: 4000,
      })
      setEditDialogOpen(false)
    } catch (error: any) {
      toast({ title: 'خطا', description: error?.message, variant: 'destructive' })
    }
    setSubmitting(false)
    return
  }

    setSubmitting(true)
    try {
      const body = {
        id: editForm.id,
        tenantId,
        name: editForm.name,
        code: editForm.code,
        barcode: editForm.barcode || null,
        categoryId:
          editForm.categoryId === 'none' ? null : editForm.categoryId,
        unitId: editForm.unitId === 'none' ? null : editForm.unitId,
        unitLabel: editForm.unitLabel,  // ★ ارسال واحد
        purchasePrice: parsePersianNumber(editForm.purchasePrice),
        salePrice: parsePersianNumber(editForm.salePrice),
        taxRate: parsePersianNumber(editForm.taxRate),
        minStock: parsePersianNumber(editForm.minStock),
        isActive: editForm.isActive,
      }
      const res = await fetch('/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (json.success) {
        toast({ title: 'موفق', description: 'محصول به‌روزرسانی شد' })
        setEditDialogOpen(false)
        loadProducts(page, search)
        loadAllProducts()
      } else {
        toast({ title: 'خطا', description: json.error, variant: 'destructive' })
      }
    } catch (error: any) {
      toast({
        title: 'خطا',
        description: error?.message,
        variant: 'destructive',
      })
    }
    setSubmitting(false)
  }

  const handleDeleteProduct = async () => {
    if (!deletingProduct) return
    setDeleting(true)
    try {
      const res = await fetch(
        `/api/products?id=${deletingProduct.id}&tenantId=${tenantId}`,
        { method: 'DELETE' }
      )
      const json = await res.json()
      if (json.success) {
        toast({ title: 'موفق', description: json.message })
        setDeletingProduct(null)
        loadProducts(page, search)
        loadAllProducts()
        loadPlanLimits()
      } else {
        toast({ title: 'خطا', description: json.error, variant: 'destructive' })
      }
    } catch (error: any) {
      toast({
        title: 'خطا',
        description: error?.message,
        variant: 'destructive',
      })
    }

      // ★ OFFLINE: حذف در صف + حذف محلی خوش‌بینانه
  if (!navigator.onLine) {
    setDeleting(true)
    try {
      const { addToSyncQueue } = await import('@/lib/offline-db')
      await addToSyncQueue('product', {
        method: 'DELETE',
        url: `/api/products?id=${deletingProduct.id}&tenantId=${tenantId}`,
        body: {},
      })
      setProducts((prev) => prev.filter((p) => p.id !== deletingProduct.id))
      setAllProducts((prev) => prev.filter((p) => p.id !== deletingProduct.id))
      toast({
        title: '📡 در صف حذف قرار گرفت',
        description: 'محصول پس از اتصال از سرور حذف می‌شود',
        duration: 4000,
      })
      setDeletingProduct(null)
    } catch (error: any) {
      toast({ title: 'خطا', description: error?.message, variant: 'destructive' })
    }
    setDeleting(false)
    return
  }
    setDeleting(false)
  }

  const openEditDialog = (product: Product) => {
    // ★ دریافت واحد از product.unit یا unitLabel
    const unitLabel = product.unit ? getUnitLabel(product.unit) : product.unitLabel || ''

    setEditForm({
      id: product.id,
      name: product.name,
      code: product.code,
      barcode: product.barcode || '',
      categoryId: product.categoryId || 'none',
      unitId: product.unitId || 'none',
      unitLabel,  // ★ نمایش واحد
      purchasePrice: String(product.purchasePrice),
      salePrice: String(product.salePrice),
      taxRate: String(product.taxRate),
      minStock: String(product.minStock),
      isActive: product.isActive,
    })
    setEditDialogOpen(true)
  }

  // ★ تعداد محصولات با بارکد
  const productsWithBarcodeCount = allProducts.filter(
    (p) => p.barcode && p.barcode.trim()
  ).length

  // ══════════════════════════════════════════════════════════════
  // ★ Render
  // ══════════════════════════════════════════════════════════════
  return (
    <div className="space-y-3 sm:space-y-4" dir="rtl">
      {/* ★ Header — ریسپانسیو: موبایل ستونی، دسکتاپ ردیفی */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
            <Package className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-gray-900">محصولات</h1>
            <p className="text-xs text-gray-500">{toFaNum(total)} محصول</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* ★ دکمه چاپ بارکد */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              loadAllProducts()
              setPrintModalOpen(true)
            }}
            className="flex-1 sm:flex-none gap-1.5 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 h-8 sm:h-9"
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden xs:inline sm:inline">چاپ بارکد</span>
            {productsWithBarcodeCount > 0 && (
              <span className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0.5 rounded-full">
                {toFaNum(productsWithBarcodeCount)}
              </span>
            )}
          </Button>

          {/* ★ دکمه افزودن محصول */}
          <Button
            onClick={handleOpenAddDialog}
            className="flex-1 sm:flex-none gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-xs h-8 sm:h-9"
            disabled={planLimits ? !planLimits.canAdd : false}
          >
            <Plus className="w-4 h-4" />
            <span>محصول جدید</span>
          </Button>
        </div>
      </div>

      {/* ★ Plan limit warning */}
      {planLimits && !planLimits.canAdd && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <p className="text-xs text-amber-700">
              سقف پلن ({toFaNum(planLimits.maxProducts)}) تکمیل شده است.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ★ Search & Filter — ریسپانسیو */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="جستجوی محصول (نام، کد، بارکد)..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pr-9 h-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="flex-1 sm:flex-none sm:w-[150px] h-9">
              <Filter className="w-3.5 h-3.5 ml-1 text-gray-400 shrink-0" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همه دسته‌ها</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSearchInput('')
              setSearch('')
              loadProducts(1, '')
            }}
            className="gap-1 h-9 shrink-0 px-2.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">پاک کردن</span>
          </Button>
        </div>
      </div>

      {/* ★ محتوای اصلی */}
      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
          </CardContent>
        </Card>
      ) : products.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Package className="w-12 h-12 mb-2 text-gray-300" />
            <p className="text-sm">
              {search
                ? `نتیجه‌ای برای "${search}" یافت نشد`
                : 'محصولی ثبت نشده است'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ═══ Desktop Table View (lg و بالاتر) ═══ */}
          <Card className="hidden lg:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="text-right text-xs">کد</TableHead>
                    <TableHead className="text-right text-xs">نام محصول</TableHead>
                    <TableHead className="text-right text-xs">بارکد</TableHead>
                    <TableHead className="text-right text-xs">دسته</TableHead>
                    <TableHead className="text-center text-xs">موجودی</TableHead>
                    <TableHead className="text-center text-xs">قیمت فروش</TableHead>
                    <TableHead className="text-center text-xs">واحد</TableHead>
                    <TableHead className="text-center text-xs">وضعیت</TableHead>
                    <TableHead className="text-center text-xs">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => (
                    <TableRow key={product.id} className="hover:bg-emerald-50/50">
                      {/* ★ کد به صورت فارسی */}
                      <TableCell className="text-xs font-mono" dir="ltr">
                        {toFaNum(product.code)}
                      </TableCell>
                    <TableCell className="text-xs font-medium">
  <div className="flex items-center gap-1.5">
    <span>{product.name}</span>
    {product._isOffline && (
      <Badge variant="outline" className="text-[9px] border-amber-300 text-amber-600 h-4 px-1 shrink-0">
        آفلاین
      </Badge>
    )}
  </div>
</TableCell>
                      {/* ★ بارکد به صورت فارسی */}
                      <TableCell className="text-xs" dir="ltr">
                        {product.barcode ? (
                          <span className="font-mono text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded text-[11px]">
                            {toFaNum(product.barcode)}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-[11px]">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {product.category?.name || '—'}
                      </TableCell>
                      <TableCell className="text-center">
                        <span
                          className={`text-xs font-bold ${
                            product.currentStock <= product.minStock
                              ? 'text-red-500'
                              : 'text-emerald-600'
                          }`}
                        >
                          {toFaNum(product.currentStock)}
                        </span>
                      </TableCell>
                      {/* ★ قیمت فروش با فرمت ریال و جداکننده */}
                      <TableCell className="text-center text-xs font-medium text-gray-700" dir="rtl">
                        {formatPrice(product.salePrice)}
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        {product.unit
                          ? getUnitLabel(product.unit)
                          : product.unitLabel || '—'}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          className={
                            product.isActive
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-gray-100 text-gray-500'
                          }
                        >
                          {product.isActive ? 'فعال' : 'غیرفعال'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(product)}
                            className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            title="ویرایش"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingProduct(product)}
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
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
            </CardContent>
          </Card>

          {/* ═══ Mobile / Tablet Card View (زیر lg) ═══ */}
          <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {products.map((product) => (
              <Card key={product.id} className="border-gray-200">
                <CardContent className="p-3">
                  {/* ردیف بالا: نام + وضعیت */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm text-gray-900 truncate">
                        {product.name}
                      </p>
                      {/* ★ کد به صورت فارسی */}
                      <p className="text-[10px] text-gray-400 font-mono mt-0.5" dir="ltr">
                        {toFaNum(product.code)}
                      </p>
                    </div>
                    <Badge
                      className={`shrink-0 text-[9px] ${
                        product.isActive
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {product.isActive ? 'فعال' : 'غیرفعال'}
                    </Badge>
                    {product._isOffline && (
  <Badge variant="outline" className="shrink-0 text-[9px] border-amber-300 text-amber-600 h-4 px-1">
    آفلاین
  </Badge>
)}
                  </div>

                  {/* ★ بارکد به صورت فارسی */}
                  {product.barcode && (
                    <div className="mb-2">
                      <span
                        className="font-mono text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded text-[10px]"
                        dir="ltr"
                      >
                        {toFaNum(product.barcode)}
                      </span>
                    </div>
                  )}

                  {/* جزئیات */}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] text-gray-500 border-t border-gray-100 pt-2">
                    <div className="flex items-center justify-between">
                      <span>دسته:</span>
                      <span className="text-gray-700 truncate">
                        {product.category?.name || '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>واحد:</span>
                      <span className="text-gray-700">
                        {product.unit
                          ? getUnitLabel(product.unit)
                          : product.unitLabel || '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>موجودی:</span>
                      <span
                        className={`font-bold ${
                          product.currentStock <= product.minStock
                            ? 'text-red-500'
                            : 'text-emerald-600'
                        }`}
                      >
                        {toFaNum(product.currentStock)}
                      </span>
                    </div>
                    {/* ★ قیمت فروش در کارت موبایل با فرمت ریال */}
                    <div className="flex items-center justify-between">
                      <span>قیمت فروش:</span>
                      <span className="text-gray-700 font-medium" dir="ltr">
                        {formatPrice(product.salePrice)}
                      </span>
                    </div>
                  </div>

                  {/* عملیات */}
                  <div className="flex items-center justify-end gap-1 mt-2.5 pt-2 border-t border-gray-100">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditDialog(product)}
                      className="h-7 px-2 text-[10px] text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                    >
                      <Edit2 className="w-3 h-3 ml-1" />
                      ویرایش
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeletingProduct(product)}
                      className="h-7 px-2 text-[10px] text-red-500 hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-3 h-3 ml-1" />
                      حذف
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* ★ Pagination — ریسپانسیو */}
      {!loading && products.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-1 sm:px-4 py-3 border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center sm:text-right">
            نمایش {toFaNum((page - 1) * 12 + 1)} تا{' '}
            {toFaNum(Math.min(page * 12, total))} از {toFaNum(total)} محصول
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={page <= 1}
              onClick={() => loadProducts(page - 1, search)}
            >
              قبلی
            </Button>
            <span className="text-xs text-gray-600 px-2">
              صفحه {toFaNum(page)} از {toFaNum(totalPages)}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={page >= totalPages}
              onClick={() => loadProducts(page + 1, search)}
            >
              بعدی
            </Button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* ★ Add Dialog                                              */}
      {/* ══════════════════════════════════════════════════════════ */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-[520px] w-[calc(100%-2rem)] max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-sm sm:text-base">محصول جدید</DialogTitle>
            <DialogDescription className="text-[11px]">
              موجودی محصول از طریق فاکتور خرید افزایش می‌یابد. فقط اطلاعات
              پایه را وارد کنید.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* نام */}
            <div className="col-span-1 sm:col-span-2">
              <Label className="text-xs">
                نام محصول <span className="text-red-500">*</span>
              </Label>
              <Input
                value={addForm.name}
                onChange={(e) =>
                  setAddForm({ ...addForm, name: e.target.value })
                }
                className="mt-1"
                placeholder="نام محصول را وارد کنید"
              />
            </div>

            {/* کد اتوماتیک */}
            <div>
              <Label className="text-xs flex items-center gap-1">
                کد محصول <span className="text-red-500">*</span>
                {generatingCode && (
                  <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
                )}
              </Label>
              <div className="flex gap-1 mt-1">
                <Input
                  value={addForm.code}
                  onChange={(e) =>
                    setAddForm({ ...addForm, code: e.target.value })
                  }
                  dir="ltr"
                  className="flex-1"
                  placeholder="PRD-000001"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="px-2 h-9 text-[11px] whitespace-nowrap shrink-0"
                  onClick={fetchNextCode}
                  disabled={generatingCode}
                  title="تولید کد جدید"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                </Button>
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">
                کد به صورت خودکار تولید شده — قابل ویرایش
              </p>
            </div>

            {/* بارکد */}
            <div>
              <Label className="text-xs">بارکد</Label>
              <Input
                value={addForm.barcode}
                onChange={(e) =>
                  setAddForm({
                    ...addForm,
                    barcode: e.target.value,
                    generateBarcode: false,
                  })
                }
                className="mt-1"
                dir="ltr"
                placeholder="اسکن یا وارد کنید"
                disabled={addForm.generateBarcode}
              />
              {/* ★ چک‌باکس تولید بارکد خودکار */}
              <div className="flex items-center gap-2 mt-2 p-2 bg-emerald-50 rounded-lg border border-emerald-200">
                <Checkbox
                  id="generate-barcode"
                  checked={addForm.generateBarcode}
                  onCheckedChange={(checked) =>
                    handleGenerateBarcodeToggle(Boolean(checked))
                  }
                />
                <Label
                  htmlFor="generate-barcode"
                  className="text-[11px] text-emerald-700 cursor-pointer flex items-center gap-1"
                >
                  <Barcode className="w-3 h-3" />
                  تولید بارکد EAN-13 خودکار
                </Label>
              </div>
              {addForm.generateBarcode && addForm.barcode && (
                <div
                  className="mt-1 text-[10px] font-mono text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-200"
                  dir="ltr"
                >
                  {addForm.barcode}
                </div>
              )}
            </div>

            {/* دسته‌بندی */}
            <div>
              <Label className="text-xs">دسته‌بندی</Label>
              <Select
                value={addForm.categoryId}
                onValueChange={(v) =>
                  setAddForm({ ...addForm, categoryId: v })
                }
              >
                <SelectTrigger className="mt-1 h-9 text-xs">
                  <SelectValue placeholder="انتخاب دسته" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون دسته</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ★★★ واحد — مرتب‌شده طبق ترتیب درخواستی ★★★ */}
            <div>
              <Label className="text-xs">واحد</Label>
              <Select
                value={addForm.unitId}
                onValueChange={(v) => setAddForm({ ...addForm, unitId: v })}
              >
                <SelectTrigger className="mt-1 h-9 text-xs">
                  <SelectValue placeholder="انتخاب واحد" />
                </SelectTrigger>
                <SelectContent className="max-h-[200px] overflow-y-auto">
                  <SelectItem value="none">—</SelectItem>
                  {sortUnits(units).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {getUnitLabel(u)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ★ قیمت خرید با فرمت زنده فارسی و جداکننده */}
            <div>
              <Label className="text-xs">قیمت خرید (ریال)</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={formatToPersianWithCommas(addForm.purchasePrice)}
                onChange={(e) =>
                  setAddForm({ ...addForm, purchasePrice: formatToPersianWithCommas(e.target.value) })
                }
                className="mt-1"
                dir="ltr"
              />
            </div>

            {/* ★ قیمت فروش با فرمت زنده فارسی و جداکننده */}
            <div>
              <Label className="text-xs">قیمت فروش (ریال)</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={formatToPersianWithCommas(addForm.salePrice)}
                onChange={(e) =>
                  setAddForm({ ...addForm, salePrice: formatToPersianWithCommas(e.target.value) })
                }
                className="mt-1"
                dir="ltr"
              />
            </div>

            {/* ★ مالیات با فرمت زنده فارسی */}
            <div>
              <Label className="text-xs">درصد مالیات (اختیاری)</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={formatToPersianWithCommas(addForm.taxRate)}
                onChange={(e) =>
                  setAddForm({ ...addForm, taxRate: formatToPersianWithCommas(e.target.value) })
                }
                className="mt-1"
                dir="ltr"
              />
            </div>

            {/* ★ حداقل موجودی با فرمت زنده فارسی */}
            <div>
              <Label className="text-xs">حداقل موجودی هشدار</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={formatToPersianWithCommas(addForm.minStock)}
                onChange={(e) =>
                  setAddForm({ ...addForm, minStock: formatToPersianWithCommas(e.target.value) })
                }
                className="mt-1"
                dir="ltr"
                placeholder="۵"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} className="h-9">
              انصراف
            </Button>
            <Button
              onClick={handleAddProduct}
              disabled={submitting}
              className="bg-emerald-600 hover:bg-emerald-700 h-9"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin ml-1" />
              ) : null}
              ایجاد محصول
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* ★ Edit Dialog                                             */}
      {/* ══════════════════════════════════════════════════════════ */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[520px] w-[calc(100%-2rem)] max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-sm sm:text-base">ویرایش محصول</DialogTitle>
            <DialogDescription className="text-[11px]">
              موجودی محصول فقط از طریق فاکتور خرید/فروش تغییر می‌کند.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* نام */}
            <div>
              <Label className="text-xs">
                نام محصول <span className="text-red-500">*</span>
              </Label>
              <Input
                value={editForm.name}
                onChange={(e) =>
                  setEditForm({ ...editForm, name: e.target.value })
                }
                className="mt-1"
              />
            </div>

            {/* کد */}
            <div>
              <Label className="text-xs">
                کد <span className="text-red-500">*</span>
              </Label>
              <Input
                value={editForm.code}
                onChange={(e) =>
                  setEditForm({ ...editForm, code: e.target.value })
                }
                className="mt-1"
                dir="ltr"
              />
            </div>

            {/* بارکد */}
            <div className="col-span-1 sm:col-span-2">
              <Label className="text-xs">بارکد</Label>
              <Input
                value={editForm.barcode}
                onChange={(e) =>
                  setEditForm({ ...editForm, barcode: e.target.value })
                }
                className="mt-1"
                dir="ltr"
                placeholder="اسکن یا دستی وارد کنید"
              />
            </div>

            {/* دسته‌بندی */}
            <div>
              <Label className="text-xs">دسته‌بندی</Label>
              <Select
                value={editForm.categoryId}
                onValueChange={(v) =>
                  setEditForm({ ...editForm, categoryId: v })
                }
              >
                <SelectTrigger className="mt-1 h-9 text-xs">
                  <SelectValue placeholder="انتخاب دسته" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون دسته</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ★★★ واحد — مرتب‌شده طبق ترتیب درخواستی ★★★ */}
            <div>
              <Label className="text-xs">واحد</Label>
              <Select
                value={editForm.unitId}
                onValueChange={(v) => setEditForm({ ...editForm, unitId: v })}
              >
                <SelectTrigger className="mt-1 h-9 text-xs">
                  <SelectValue placeholder="انتخاب واحد" />
                </SelectTrigger>
                <SelectContent className="max-h-[200px] overflow-y-auto">
                  <SelectItem value="none">—</SelectItem>
                  {sortUnits(units).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {getUnitLabel(u)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ★ قیمت خرید با فرمت زنده فارسی و جداکننده */}
            <div>
              <Label className="text-xs">قیمت خرید (ریال)</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={formatToPersianWithCommas(editForm.purchasePrice)}
                onChange={(e) =>
                  setEditForm({ ...editForm, purchasePrice: formatToPersianWithCommas(e.target.value) })
                }
                className="mt-1"
                dir="ltr"
              />
            </div>

            {/* ★ قیمت فروش با فرمت زنده فارسی و جداکننده */}
            <div>
              <Label className="text-xs">قیمت فروش (ریال)</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={formatToPersianWithCommas(editForm.salePrice)}
                onChange={(e) =>
                  setEditForm({ ...editForm, salePrice: formatToPersianWithCommas(e.target.value) })
                }
                className="mt-1"
                dir="ltr"
              />
            </div>

            {/* ★ درصد مالیات با فرمت زنده فارسی */}
            <div>
              <Label className="text-xs">درصد مالیات</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={formatToPersianWithCommas(editForm.taxRate)}
                onChange={(e) =>
                  setEditForm({ ...editForm, taxRate: formatToPersianWithCommas(e.target.value) })
                }
                className="mt-1"
                dir="ltr"
              />
            </div>

            {/* ★ حداقل موجودی با فرمت زنده فارسی */}
            <div>
              <Label className="text-xs">حداقل موجودی هشدار</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={formatToPersianWithCommas(editForm.minStock)}
                onChange={(e) =>
                  setEditForm({ ...editForm, minStock: formatToPersianWithCommas(e.target.value) })
                }
                className="mt-1"
                dir="ltr"
              />
            </div>

            {/* وضعیت فعال */}
            <div className="flex items-center justify-between col-span-1 sm:col-span-2">
              <Label className="text-xs">وضعیت فعال</Label>
              <Switch
                checked={editForm.isActive}
                onCheckedChange={(v) =>
                  setEditForm({ ...editForm, isActive: v })
                }
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} className="h-9">
              انصراف
            </Button>
            <Button
              onClick={handleEditProduct}
              disabled={submitting}
              className="bg-emerald-600 hover:bg-emerald-700 h-9"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin ml-1" />
              ) : null}
              به‌روزرسانی
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ★ Delete Dialog */}
      <Dialog
        open={!!deletingProduct}
        onOpenChange={(v) => !v && setDeletingProduct(null)}
      >
        <DialogContent className="sm:max-w-[400px] w-[calc(100%-2rem)]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-sm sm:text-base">حذف محصول</DialogTitle>
            <DialogDescription className="text-xs">
              این عملیات قابل بازگشت نیست.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-gray-700">
              آیا از حذف «<strong>{deletingProduct?.name}</strong>» مطمئن هستید؟
              <br />
              <span className="text-xs text-gray-500">
                اگر فاکتوری داشته باشد، غیرفعال می‌شود.
              </span>
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeletingProduct(null)} className="h-9">
              انصراف
            </Button>
            <Button
              onClick={handleDeleteProduct}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 h-9"
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 animate-spin ml-1" />
              ) : null}
              حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ★ Barcode Print Modal */}
      <BarcodePrintModal
        open={printModalOpen}
        onOpenChange={setPrintModalOpen}
        products={allProducts}
      />
    </div>
  )
}