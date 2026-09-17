'use client'

// ============================================================================
// src/components/settings/employees-tab.tsx
// ShopAccounting — تب مدیریت کاربران/صندوق‌داران
// ★ v11.9.6: اصلاح تشخیص مدیر اصلی بر اساس نقش (نه نام کاربری)
// ★ سازگاری با نقش‌های: Admin, Manager, Owner
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import { resolveTenantId, getTenantIdFromStore } from '@/lib/tenant-utils'
import { useDemoStatus } from '@/lib/use-demo-status'
import { PLANS, type PlanName } from '@/lib/plan-features'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Users, Plus, Pencil, Trash2, ShieldCheck, Loader2, Lock, AlertTriangle,
  Infinity, Crown, AlertCircle, Info, Shield,
} from 'lucide-react'

// ★ v11.9.6: تابع کمکی برای تشخیص نقش‌های مدیریتی
const MANAGER_ROLES = ['Manager', 'Admin', 'Owner', 'manager', 'admin', 'owner']

function isManagerRole(role: string | null | undefined): boolean {
  return !!role && MANAGER_ROLES.includes(role)
}

export function EmployeesTab() {
  const currentTenant = useAppStore((s) => s.currentTenant)
  const storeTenantId = useAppStore((s) => s.tenantId)
  const userTenantId = useAppStore((s) => s.user?.tenantId)
  
  const planNameFromStore = useAppStore((s) => s.planName)
  const planFeatures = useAppStore((s) => s.planFeatures)

  const tenantId = resolveTenantId(currentTenant, storeTenantId, userTenantId)
  console.log('[EmployeesTab] currentTenant:', currentTenant, '→ tenantId:', tenantId)

  const { isDemo } = useDemoStatus()

  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editUserId, setEditUserId] = useState<string | null>(null)
  const [formUsername, setFormUsername] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formMobile, setFormMobile] = useState('')
// ★ v11.9.7: اضافه کردن 'Manager' برای نمایش نقش مدیر در ویرایش
const [formRole, setFormRole] = useState<'Cashier' | 'Manager'>('Cashier')
  const [formPermissions, setFormPermissions] = useState<string[]>(['pos'])
  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null)

  // ═══════════════════════════════════════════════════════════════
  //  محاسبه محدودیت کاربران بر اساس پلن
  // ═══════════════════════════════════════════════════════════════
// ★ v11.9.9: لاگ دقیق برای ریشه‌یابی تشخیص پلن
const planNameRaw = planNameFromStore || currentTenant?.planName || currentTenant?.planTierName || 'simple'
console.log('[EmployeesTab] 🔍 Plan detection inputs:', {
  planNameFromStore,
  currentTenantPlanName: currentTenant?.planName,
  currentTenantPlanTierName: currentTenant?.planTierName,
  planNameRaw,
  tenantInfo: currentTenant,
})

const resolvedPlanName: PlanName = ((): PlanName => {
  const name = planNameRaw.toString().toLowerCase().trim()
  if (name.includes('enterprise') || name.includes('سازمانی') || name === 'enterprise') return 'enterprise'
  if (name.includes('professional') || name.includes('پیشرفته') || name === 'professional') return 'professional'
  return 'simple'
})()

console.log('[EmployeesTab] 🔍 Resolved plan:', resolvedPlanName)

const planInfo = PLANS[resolvedPlanName] || PLANS.simple

// ★ v11.9.8: مقادیر پیش‌فرض برای پلن‌ها (بر اساس طرح تجاری شما)
// این مقادیر از فایل دیگری خوانده نمی‌شوند تا مطمئن باشیم همیشه مقدار دارند
const PLAN_LIMITS_FALLBACK: Record<string, number> = {
  simple: 2,        // پلن پایه: ۲ کاربر (۱ مدیر + ۱ صندوق‌دار)
  professional: 5,  // پلن پیشرفته: ۵ کاربر (۱ مدیر + ۴ صندوق‌دار)
  enterprise: 0,    // پلن حرفه‌ای: نامحدود (0 = نامحدود)
}

// اول از پلن بخوان، اگر نبود از جدول بالا بخوان، اگر باز هم نبود 2 بگذار
const maxUsersFromPlan = planInfo.maxUsers
const maxUsers = (maxUsersFromPlan !== undefined && maxUsersFromPlan !== null)
  ? maxUsersFromPlan
  : (PLAN_LIMITS_FALLBACK[resolvedPlanName] ?? 2)

const isUnlimitedUsers = maxUsers === 0

// ★ لاگ دقیق برای بررسی
console.log('[EmployeesTab] Plan info:', {
  resolvedPlanName,
  maxUsersFromPlan,
  maxUsers,
  isUnlimitedUsers,
  planInfoLabel: planInfo.label,
})

// ★ v11.9.6: شمارش صندوق‌داران فعال
const activeCashiersCount = useMemo(() => {
  return users.filter(u => u.isActive !== false && !isManagerRole(u.role)).length
}, [users])

const totalUsersCount = users.length
const isAtLimit = !isUnlimitedUsers && activeCashiersCount >= maxUsers
const remainingSlots = isUnlimitedUsers ? -1 : Math.max(0, maxUsers - activeCashiersCount)
const usagePercent = isUnlimitedUsers ? 0 : maxUsers > 0 ? Math.round((activeCashiersCount / maxUsers) * 100) : 0

// ★ v11.9.7: لاگ برای debug (بعد از تعریف همه متغیرها)
console.log('[EmployeesTab] Plan info:', {
  resolvedPlanName,
  maxUsers,
  isUnlimitedUsers,
  activeCashiersCount,
  isAtLimit,
  remainingSlots,
  usagePercent,
})

  // ═══════════════════════════════════════════════════════════════
  //  لیست مجوزهای دسترسی (فیلتر شده بر اساس پلن)
  // ═══════════════════════════════════════════════════════════════
  const BASE_PERMISSIONS = [
    { key: 'dashboard', label: 'داشبورد', minTier: 'simple' },
    { key: 'pos', label: 'صندوق فروش', minTier: 'simple' },
    { key: 'products', label: 'کالاها', minTier: 'simple' },
    { key: 'categories', label: 'دسته‌بندی‌ها', minTier: 'simple' },
    { key: 'customers', label: 'مشتریان', minTier: 'simple' },
    { key: 'invoices', label: 'فاکتورها', minTier: 'simple' },
    { key: 'reports', label: 'گزارشات', minTier: 'simple' },
  ]

  const ADVANCED_PERMISSIONS = [
    { 
      key: 'installments', 
      label: 'اقساط', 
      requiresFeature: 'canAccessInstallments' as const,
      tierLabel: 'پیشرفته و بالاتر'
    },
    { 
      key: 'accounting', 
      label: 'حسابداری', 
      requiresFeature: 'canTrialBalance' as const,
      tierLabel: 'پیشرفته و بالاتر'
    },
  ]

  const CASHIER_PERMISSIONS = useMemo(() => {
    const available: typeof BASE_PERMISSIONS = [...BASE_PERMISSIONS]
    
    ADVANCED_PERMISSIONS.forEach((perm) => {
      const featureValue = planFeatures[perm.requiresFeature]
      if (featureValue === true) {
        available.push({
          key: perm.key,
          label: perm.label,
          minTier: 'professional',
        })
      }
    })
    
    return available
  }, [planFeatures])

  const LOCKED_PERMISSIONS = useMemo(() => {
    return ADVANCED_PERMISSIONS.filter((perm) => {
      const featureValue = planFeatures[perm.requiresFeature]
      return featureValue !== true
    })
  }, [planFeatures])

  const togglePermission = (key: string) => {
    setFormPermissions((prev) => prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key])
  }

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/employees')
      const data = await res.json()
      
      if (data.success) {
        let usersList: any[] = []
        if (Array.isArray(data.data)) {
          usersList = data.data
        } else if (data.data && Array.isArray(data.data.users)) {
          usersList = data.data.users
        } else if (data.data && Array.isArray(data.data.employees)) {
          usersList = data.data.employees
        } else if (Array.isArray(data.employees)) {
          usersList = data.employees
        } else if (Array.isArray(data.users)) {
          usersList = data.users
        }
        setUsers(usersList)
      } else {
        console.error('[EmployeesTab] API error:', data.error)
        setUsers([])
      }
    } catch (error) {
      console.error('[EmployeesTab] Fetch error:', error)
      setUsers([])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (tenantId) {
      fetchUsers()
    } else {
      setLoading(false)
    }
  }, [tenantId, fetchUsers])

  const resetForm = () => {
    setFormUsername('')
    setFormPassword('')
    setFormMobile('')
    setFormRole('Cashier')
    setFormPermissions(['pos'])
    setFormError('')
    setEditUserId(null)
  }

  const handleAddUser = () => {
    // بررسی محدودیت پلن قبل از باز کردن dialog
    if (isAtLimit) {
      setFormError(`سقف صندوق‌داران پلن ${planInfo.label} (${maxUsers} صندوق‌دار) تکمیل شده است. برای افزودن صندوق‌دار بیشتر، لطفاً پلن خود را ارتقا دهید.`)
      return
    }
    resetForm()
    setDialogOpen(true)
  }

const handleEditUser = (user: any) => {
  setFormUsername(user.username)
  setFormPassword('')
  setFormMobile(user.mobile || '')
  
  // ★ v11.9.7: نقش واقعی کاربر را ست کن (نه همیشه Cashier)
  if (isManagerRole(user.role)) {
    setFormRole('Manager')
  } else {
    setFormRole('Cashier')
  }
  
  let userPerms: string[] = []
  const p = user.permissions
  if (typeof p === 'string') {
    try { userPerms = JSON.parse(p) } catch { userPerms = [] }
  } else if (Array.isArray(p)) {
    userPerms = p
  }
  const availableKeys = CASHIER_PERMISSIONS.map(p => p.key)
  const filteredPerms = userPerms.filter(perm => availableKeys.includes(perm))
  setFormPermissions(filteredPerms.length > 0 ? filteredPerms : ['pos'])
  setEditUserId(user.id || user.userId)
  setFormError('')
  setDialogOpen(true)
}

  const handleSaveUser = async () => {
    setFormError('')
    if (!formUsername) { setFormError('نام کاربری الزامی است'); return }
    if (!editUserId && !formPassword) { setFormError('رمز عبور الزامی است'); return }
    if (formPassword && formPassword.length < 6) { setFormError('رمز عبور باید حداقل ۶ کاراکتر باشد'); return }
    
    // ★ v11.9.6: جلوگیری از استفاده از نام کاربری مدیر اصلی
    const mainAdmin = users.find(u => isManagerRole(u.role))
    if (!editUserId && mainAdmin && formUsername === mainAdmin.username) {
      setFormError('این نام کاربری رزرو شده است.')
      return
    }
    
    if (!editUserId && isAtLimit) {
      setFormError(`سقف صندوق‌داران پلن ${planInfo.label} (${maxUsers} صندوق‌دار) تکمیل شده است.`)
      return
    }
    
    setFormSaving(true)
    try {
      const tid = getTenantIdFromStore()
      console.log('[EmployeesTab] handleSaveUser tid:', tid, 'editUserId:', editUserId)
      if (!tid) { setFormError('خطا: tenantId در دسترس نیست'); setFormSaving(false); return }

      if (editUserId) {
        const requestBody = {
          employeeId: editUserId,
          username: formUsername,
          password: formPassword || undefined,
          mobile: formMobile,
          role: formRole,
          tenantId: tid,
          permissions: formRole === 'Cashier' ? formPermissions : undefined,
        }

        const res = await fetch('/api/employees', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        })
        const data = await res.json()

        if (!data.success) {
          setFormError(data.error || 'خطا در ویرایش کاربر')
          setFormSaving(false)
          return
        }
      } else {
        const requestBody = {
          username: formUsername,
          password: formPassword,
          mobile: formMobile,
          role: formRole,
          tenantId: tid,
          permissions: formRole === 'Cashier' ? formPermissions : undefined,
        }

        const res = await fetch('/api/employees', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        })
        const data = await res.json()

        if (!data.success) { setFormError(data.error || 'خطا در افزودن کاربر'); setFormSaving(false); return }
      }
      setDialogOpen(false)
      resetForm()
      fetchUsers()
    } catch (err: any) {
      console.error('[EmployeesTab] handleSaveUser error:', err)
      setFormError('خطا در ارتباط با سرور')
    }
    setFormSaving(false)
  }

  const toggleUserActive = async (user: any) => {
    // ★ v11.9.6: جلوگیری از غیرفعال‌سازی مدیر اصلی (بر اساس نقش)
    if (isManagerRole(user.role)) {
      alert('مدیر اصلی را نمی‌توان غیرفعال کرد.')
      return
    }
    
    if (user.isActive === false && isAtLimit) {
      alert(`سقف صندوق‌داران فعال پلن ${planInfo.label} (${maxUsers} صندوق‌دار) تکمیل شده است. ابتدا یک صندوق‌دار دیگر را غیرفعال کنید.`)
      return
    }
    
    try {
      const tid = getTenantIdFromStore()
      const userId = user.id || user.userId
      const res = await fetch('/api/employees', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: userId,
          isActive: !user.isActive,
          tenantId: tid
        }),
      })
      const data = await res.json()
      if (data.success) fetchUsers()
      else console.error('[EmployeesTab] toggleUserActive error:', data.error)
    } catch (err) {
      console.error('[EmployeesTab] toggleUserActive error:', err)
    }
  }

  const handleDeleteClick = (userId: string) => {
    setDeleteUserId(userId)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!deleteUserId) return
    try {
      const tid = getTenantIdFromStore()
      const res = await fetch(`/api/employees?id=${deleteUserId}&tenantId=${tid}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) fetchUsers()
      else alert(data.error || 'خطا در حذف کاربر')
    } catch { alert('خطا در ارتباط با سرور') }
    setDeleteDialogOpen(false)
    setDeleteUserId(null)
  }

  const getPermissionLabels = (user: any) => {
    // ★ v11.9.6: تشخیص مدیر بر اساس نقش
    if (isManagerRole(user.role)) return 'دسترسی کامل'
    let perms: string[] = []
    const p = user.permissions
    if (typeof p === 'string') { try { perms = JSON.parse(p) } catch { perms = [] } } else if (Array.isArray(p)) { perms = p }
    if (perms.length === 0) return 'بدون دسترسی'
    return perms.map((key) => CASHIER_PERMISSIONS.find((pp) => pp.key === key)?.label || key).join('، ')
  }

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '—'
    const d = new Date(dateStr)
    return d.toLocaleDateString('fa-IR') + ' ' + d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })
  }

  const getLimitBarColor = () => {
    if (isUnlimitedUsers) return 'bg-emerald-500'
    if (usagePercent >= 100) return 'bg-red-500'
    if (usagePercent >= 80) return 'bg-amber-500'
    return 'bg-emerald-500'
  }

  return (
    <div className="space-y-1.5">
      {/* بنر محدودیت کاربران پلن */}
      <Card className={`border ${isAtLimit ? 'border-red-200' : 'border-gray-200'}`}>
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              isAtLimit 
                ? 'bg-red-100' 
                : isUnlimitedUsers 
                  ? 'bg-emerald-100' 
                  : usagePercent >= 80 
                    ? 'bg-amber-100' 
                    : 'bg-emerald-100'
            }`}>
              {isUnlimitedUsers ? (
                <Infinity className={`w-5 h-5 ${isAtLimit ? 'text-red-600' : 'text-emerald-600'}`} />
              ) : (
                <Users className={`w-5 h-5 ${isAtLimit ? 'text-red-600' : usagePercent >= 80 ? 'text-amber-600' : 'text-emerald-600'}`} />
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-gray-900">
                    محدودیت صندوق‌داران پلن
                  </h3>
                  <Badge className={`text-[10px] ${
                    resolvedPlanName === 'enterprise' 
                      ? 'bg-purple-100 text-purple-700 border-purple-200' 
                      : resolvedPlanName === 'professional'
                        ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                        : 'bg-blue-100 text-blue-700 border-blue-200'
                  }`} variant="outline">
                    <Crown className="w-3 h-3 ml-1" />
                    {planInfo.label}
                  </Badge>
                </div>
                
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-black text-gray-900">
                    {isUnlimitedUsers ? (
                      <>
                        <span className="text-emerald-600">{activeCashiersCount}</span>
                        <span className="text-gray-500 text-xs mr-1">صندوق‌دار فعال</span>
                      </>
                    ) : (
                      <>
                        <span className={isAtLimit ? 'text-red-600' : usagePercent >= 80 ? 'text-amber-600' : 'text-emerald-600'}>
                          {activeCashiersCount}
                        </span>
                        <span className="text-gray-500 text-xs"> از </span>
                        <span className="text-gray-900">{maxUsers}</span>
                      </>
                    )}
                  </span>
                </div>
              </div>
              
              {!isUnlimitedUsers && (
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden mb-1.5">
                  <div 
                    className={`h-full transition-all duration-500 ${getLimitBarColor()}`}
                    style={{ width: `${Math.min(100, usagePercent)}%` }}
                  />
                </div>
              )}
              
              <div className="flex items-center gap-1.5 flex-wrap">
                {isUnlimitedUsers ? (
                  <p className="text-xs text-emerald-700 flex items-center gap-1">
                    <Infinity className="w-3 h-3" />
                    پلن شما بدون محدودیت صندوق‌دار است.
                  </p>
                ) : isAtLimit ? (
                  <p className="text-xs text-red-700 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    <span className="font-bold">سقف صندوق‌داران تکمیل شده است!</span>
                  </p>
                ) : usagePercent >= 80 ? (
                  <p className="text-xs text-amber-700 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    <span>فقط {remainingSlots} جای خالی باقی مانده است.</span>
                  </p>
                ) : (
                  <p className="text-xs text-gray-600 flex items-center gap-1">
                    <Info className="w-3 h-3 shrink-0" />
                    <span>{remainingSlots} جای خالی برای افزودن صندوق‌دار جدید دارید.</span>
                  </p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-gray-200">
        <CardHeader className="p-2.5 sm:p-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-600" />
              کاربران فروشگاه
              {isDemo && (
                <Badge className="bg-amber-100 text-amber-700 text-[10px] mr-1" variant="secondary">
                  دمو — فقط ویرایش
                </Badge>
              )}
            </CardTitle>
            {isDemo ? (
              <Button
                size="sm"
                disabled
                className="bg-gray-300 text-gray-500 cursor-not-allowed w-full sm:w-auto gap-1"
              >
                <Lock className="w-3.5 h-3.5 ms-1" />
                افزودن صندوق‌دار (غیرفعال در دمو)
              </Button>
            ) : isAtLimit ? (
              <Button
                size="sm"
                disabled
                className="bg-red-100 text-red-700 border border-red-200 hover:bg-red-100 cursor-not-allowed w-full sm:w-auto gap-1"
              >
                <Lock className="w-3.5 h-3.5 ms-1" />
                سقف تکمیل ({activeCashiersCount}/{maxUsers})
              </Button>
            ) : (
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto" onClick={handleAddUser}>
                <Plus className="w-4 h-4 ms-1" />
                افزودن صندوق‌دار
                {!isUnlimitedUsers && (
                  <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-md mr-1">
                    {remainingSlots} جای خالی
                  </span>
                )}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[400px]">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                <span className="ms-2 text-sm text-gray-500">در حال بارگذاری...</span>
              </div>
            ) : (
              <div className="overflow-x-auto" dir="rtl">
                <Table dir="rtl">
                  <TableHeader dir="rtl">
                    <TableRow className="bg-gray-50" dir="rtl">
                      <TableHead className="text-right text-xs whitespace-nowrap">نام کاربری</TableHead>
                      <TableHead className="text-right text-xs whitespace-nowrap">نقش</TableHead>
                      <TableHead className="text-right text-xs whitespace-nowrap hidden md:table-cell">مجوزها</TableHead>
                      <TableHead className="text-right text-xs whitespace-nowrap hidden sm:table-cell">موبایل</TableHead>
                      <TableHead className="text-right text-xs whitespace-nowrap">وضعیت</TableHead>
                      <TableHead className="text-right text-xs whitespace-nowrap hidden lg:table-cell">آخرین ورود</TableHead>
                      <TableHead className="text-right text-xs whitespace-nowrap">عملیات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody dir="rtl">
                    {users.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-gray-500 text-sm">
                          هنوز صندوق‌داری اضافه نشده است. روی "افزودن صندوق‌دار" کلیک کنید.
                        </TableCell>
                      </TableRow>
                    ) : (
                      users.map((user, index) => {
                        // ★ v11.9.6: تشخیص مدیر اصلی بر اساس نقش
                        const isMainAdmin = isManagerRole(user.role)
                        
                        return (
                          <TableRow 
                            key={user.id || user.userId || index} 
                            className={`hover:bg-emerald-50/50 ${isMainAdmin ? 'bg-blue-50/30' : ''}`} 
                            dir="rtl"
                          >
                            <TableCell className="text-sm font-medium whitespace-nowrap text-right">
                              <div className="flex items-center gap-1.5">
                                {user.username}
                                {isMainAdmin && (
                                  <Badge className="text-[9px] bg-blue-100 text-blue-700 border-blue-200">
                                    <Shield className="w-2.5 h-2.5 ml-0.5" />
                                    اصلی
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-right">
                              {/* ★ v11.9.6: تشخیص نقش بر اساس تمام نقش‌های مدیریتی */}
                              <Badge className={`text-xs ${
                                isMainAdmin 
                                  ? 'bg-emerald-100 text-emerald-700 border-emerald-200' 
                                  : 'bg-gray-100 text-gray-700 border-gray-200'
                              }`} variant="outline">
                                {isMainAdmin ? 'مدیر' : 'صندوق‌دار'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-gray-600 max-w-[180px] hidden md:table-cell text-right">
                              <span className="line-clamp-2">{getPermissionLabels(user)}</span>
                            </TableCell>
                            <TableCell className="text-sm whitespace-nowrap hidden sm:table-cell text-right" dir="ltr">{user.mobile || '—'}</TableCell>
                            <TableCell className="whitespace-nowrap text-right">
                              <Badge className={`text-xs ${user.isActive ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-red-100 text-red-700 border-red-200'}`} variant="outline">
                                {user.isActive ? 'فعال' : 'غیرفعال'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-gray-500 whitespace-nowrap hidden lg:table-cell text-right">{formatDate(user.lastLoginAt)}</TableCell>
                            <TableCell className="whitespace-nowrap text-right">
                              <div className="flex items-center gap-1 justify-end">
                                {/* دکمه ویرایش */}
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-8 w-8 p-0 text-gray-500 hover:text-emerald-700" 
                                  onClick={() => handleEditUser(user)} 
                                  title={isMainAdmin ? 'ویرایش اطلاعات مدیر اصلی' : 'ویرایش'}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                
                                {/* دکمه فعال/غیرفعال - برای مدیر اصلی غیرفعال است */}
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className={`h-8 w-8 p-0 ${
                                    isMainAdmin 
                                      ? 'text-gray-300 cursor-not-allowed' 
                                      : user.isActive 
                                        ? 'text-amber-500 hover:text-amber-700' 
                                        : 'text-emerald-500 hover:text-emerald-700'
                                  }`} 
                                  onClick={() => !isMainAdmin && toggleUserActive(user)} 
                                  disabled={isMainAdmin}
                                  title={isMainAdmin ? 'مدیر اصلی قابل غیرفعال‌سازی نیست' : user.isActive ? 'غیرفعال کردن' : 'فعال کردن'}
                                >
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                </Button>
                                
                                {/* دکمه حذف - برای مدیر اصلی مخفی است */}
                                {!isMainAdmin && (
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-8 w-8 p-0 text-red-500 hover:text-red-700" 
                                    onClick={() => handleDeleteClick(user.id || user.userId)} 
                                    title="حذف"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* دیالوگ افزودن/ویرایش */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm() }}>
        <DialogContent className="w-[95vw] sm:max-w-[550px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              {editUserId ? <><Pencil className="w-4 h-4 text-emerald-600 shrink-0" />ویرایش کاربر</> : <><Plus className="w-4 h-4 text-emerald-600 shrink-0" />افزودن صندوق‌دار جدید</>}
            </DialogTitle>
            <DialogDescription className="text-sm">
              {editUserId ? 'اطلاعات کاربر را ویرایش کنید' : 'اطلاعات صندوق‌دار جدید را وارد کنید'}
              {!editUserId && !isUnlimitedUsers && (
                <span className="block mt-1 text-xs">
                  با افزودن این صندوق‌دار، {activeCashiersCount + 1} از {maxUsers} جای پلن {planInfo.label} پر می‌شود.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2 sm:py-3">
            {!editUserId && isAtLimit && (
              <Alert className="border-red-200 bg-red-50">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                <AlertDescription className="text-red-700 text-sm">
                  <span className="font-bold">سقف صندوق‌داران پلن تکمیل شده است!</span>
                </AlertDescription>
              </Alert>
            )}
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1.5">
                <Label htmlFor="emp-username">نام کاربری</Label>
                <Input 
                  id="emp-username" 
                  value={formUsername} 
                  onChange={(e) => setFormUsername(e.target.value)} 
                  placeholder="مثال: cashier1" 
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-password">رمز عبور {editUserId && '(خالی = بدون تغییر)'}</Label>
                <Input id="emp-password" type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} placeholder="حداقل ۶ کاراکتر" dir="ltr" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1.5">
                <Label htmlFor="emp-mobile">شماره موبایل</Label>
                <Input id="emp-mobile" type="tel" value={formMobile} onChange={(e) => setFormMobile(e.target.value)} placeholder="۰۹۱۲۱۲۳۴۵۶۷" dir="ltr" />
              </div>
            <div className="space-y-1.5">
  <Label htmlFor="emp-role">نقش</Label>
  {/* ★ v11.9.7: نقش هوشمند بر اساس نوع کاربر */}
  <Select 
    value={formRole} 
    onValueChange={(v) => setFormRole(v as 'Cashier' | 'Manager')}
    disabled={true}  // همیشه غیرفعال - نقش قابل تغییر نیست
  >
    <SelectTrigger className="w-full">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {editUserId ? (
        // ویرایش کاربر موجود: نمایش نقش واقعی
        formRole === 'Manager' ? (
          <SelectItem value="Manager">مدیر</SelectItem>
        ) : (
          <SelectItem value="Cashier">صندوق‌دار</SelectItem>
        )
      ) : (
        // کاربر جدید: فقط صندوق‌دار
        <SelectItem value="Cashier">صندوق‌دار</SelectItem>
      )}
    </SelectContent>
  </Select>
  <p className="text-[9px] text-gray-500">
    {editUserId 
      ? (formRole === 'Manager' 
          ? 'مدیر اصلی - نقش قابل تغییر نیست' 
          : 'صندوق‌دار - نقش قابل تغییر نیست')
      : 'کاربران جدید همیشه به عنوان صندوق‌دار ایجاد می‌شوند.'
    }
  </p>
</div>
            </div>
            
            {/* مجوزهای دسترسی - فقط برای صندوق‌دار */}
            <div className="space-y-2 p-2.5 sm:p-3.5 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                <Label className="text-sm font-semibold text-amber-800">مجوزهای دسترسی صندوق‌دار</Label>
              </div>
              <p className="text-xs text-amber-700">منوهایی که این صندوق‌دار می‌بیند و به آنها دسترسی دارد.</p>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                {CASHIER_PERMISSIONS.map((perm) => (
                  <label key={perm.key} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all text-sm ${formPermissions.includes(perm.key) ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    <input type="checkbox" checked={formPermissions.includes(perm.key)} onChange={() => togglePermission(perm.key)} className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 shrink-0" />
                    <span className="truncate">{perm.label}</span>
                  </label>
                ))}
              </div>
              
              {LOCKED_PERMISSIONS.length > 0 && (
                <div className="mt-3 pt-3 border-t border-amber-200">
                  <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    منوهای قفل‌شده (نیاز به ارتقای پلن):
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {LOCKED_PERMISSIONS.map((perm) => (
                      <div 
                        key={perm.key} 
                        className="flex items-center gap-2 p-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 text-gray-400 text-sm cursor-not-allowed"
                      >
                        <Lock className="w-3 h-3 shrink-0" />
                        <span className="truncate line-through">{perm.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {formPermissions.length === 0 && <p className="text-xs text-red-500 mt-1">حداقل یک مجوز باید انتخاب شود</p>}
            </div>
            
            {formError && (
              <Alert className="border-red-200 bg-red-50">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                <AlertDescription className="text-red-700 text-sm">{formError}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm() }} className="w-full sm:w-auto">انصراف</Button>
            <Button 
              className="bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto" 
              onClick={handleSaveUser} 
              disabled={
                formSaving || 
                formPermissions.length === 0 ||
                (!editUserId && isAtLimit)
              }
            >
              {formSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : editUserId ? 'ذخیره تغییرات' : 'افزودن صندوق‌دار'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="w-[95vw] sm:max-w-[425px]">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف صندوق‌دار</AlertDialogTitle>
            <AlertDialogDescription>آیا از حذف این صندوق‌دار اطمینان دارید؟ این عمل قابل بازگشت نیست.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2 sm:gap-2">
            <AlertDialogCancel className="w-full sm:w-auto">انصراف</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-600 hover:bg-red-700 text-white w-full sm:w-auto">حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}