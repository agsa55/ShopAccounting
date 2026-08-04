'use client'

// ============================================================================
// src/components/settings/employees-tab.tsx
// ShopAccounting — تب مدیریت کاربران/صندوق‌داران
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { resolveTenantId, getTenantIdFromStore } from '@/lib/tenant-utils'
import { useDemoStatus } from '@/lib/use-demo-status'
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
} from 'lucide-react'

export function EmployeesTab() {
  const currentTenant = useAppStore((s) => s.currentTenant)
  const storeTenantId = useAppStore((s) => s.tenantId)
  const userTenantId = useAppStore((s) => s.user?.tenantId)

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
  const [formRole, setFormRole] = useState<'Cashier' | 'Manager'>('Cashier')
  const [formPermissions, setFormPermissions] = useState<string[]>(['pos'])
  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null)

  const CASHIER_PERMISSIONS = [
    { key: 'dashboard', label: 'داشبورد' },
    { key: 'pos', label: 'صندوق فروش' },
    { key: 'products', label: 'محصولات' },
    { key: 'categories', label: 'دسته‌بندی‌ها' },
    { key: 'customers', label: 'مشتریان' },
    { key: 'invoices', label: 'فاکتورها' },
    { key: 'installments', label: 'اقساط' },
    { key: 'accounting', label: 'حسابداری' },
    { key: 'reports', label: 'گزارشات' },
  ]

  const togglePermission = (key: string) => {
    setFormPermissions((prev) => prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key])
  }

   const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      // ★★★ اصلاح: حذف tenantId از URL (Middleware خودش آن را مدیریت می‌کند)
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
    resetForm()
    setDialogOpen(true)
  }

  const handleEditUser = (user: any) => {
    setFormUsername(user.username)
    setFormPassword('')
    setFormMobile(user.mobile || '')
    setFormRole(user.role as 'Cashier' | 'Manager')
    let userPerms: string[] = []
    const p = user.permissions
    if (typeof p === 'string') {
      try { userPerms = JSON.parse(p) } catch { userPerms = [] }
    } else if (Array.isArray(p)) {
      userPerms = p
    }
    setFormPermissions(userPerms.length > 0 ? userPerms : ['pos'])
    setEditUserId(user.id || user.userId)
    setDialogOpen(true)
  }

  const handleSaveUser = async () => {
    setFormError('')
    if (!formUsername) { setFormError('نام کاربری الزامی است'); return }
    if (!editUserId && !formPassword) { setFormError('رمز عبور الزامی است'); return }
    if (formPassword && formPassword.length < 6) { setFormError('رمز عبور باید حداقل ۶ کاراکتر باشد'); return }
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
        console.log('[EmployeesTab] PUT request body:', { ...requestBody, password: requestBody.password ? '***' : undefined })

        const res = await fetch('/api/employees', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        })
        const data = await res.json()
        console.log('[EmployeesTab] PUT response:', data)

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
        console.log('[EmployeesTab] POST request body:', { ...requestBody, password: '***' })

        const res = await fetch('/api/employees', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        })
        const data = await res.json()
        console.log('[EmployeesTab] POST response:', data)

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
    if (user.role === 'Manager') return 'دسترسی کامل'
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

  return (
    <div className="space-y-1.5">
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
                title="در حالت تست دمو، افزودن کاربر جدید غیرفعال است"
                className="bg-gray-300 text-gray-500 cursor-not-allowed w-full sm:w-auto gap-1"
              >
                <Lock className="w-3.5 h-3.5 ms-1" />
                افزودن صندوق‌دار (غیرفعال در دمو)
              </Button>
            ) : (
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto" onClick={handleAddUser}>
                <Plus className="w-4 h-4 ms-1" />
                افزودن صندوق‌دار
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
                    {users.map((user, index) => (
                      <TableRow key={user.id || user.userId || index} className="hover:bg-emerald-50/50" dir="rtl">
                        <TableCell className="text-sm font-medium whitespace-nowrap text-right">{user.username}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          <Badge className={`text-xs ${user.role === 'Manager' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-700 border-gray-200'}`} variant="outline">
                            {user.role === 'Manager' ? 'مدیر' : 'صندوق‌دار'}
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
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-500 hover:text-emerald-700" onClick={() => handleEditUser(user)} title="ویرایش">
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" className={`h-8 w-8 p-0 ${user.isActive ? 'text-amber-500 hover:text-amber-700' : 'text-emerald-500 hover:text-emerald-700'}`} onClick={() => toggleUserActive(user)} title={user.isActive ? 'غیرفعال کردن' : 'فعال کردن'}>
                              <ShieldCheck className="w-3.5 h-3.5" />
                            </Button>
                            {user.role !== 'Manager' && (
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-700" onClick={() => handleDeleteClick(user.id || user.userId)} title="حذف">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm() }}>
        <DialogContent className="w-[95vw] sm:max-w-[550px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              {editUserId ? <><Pencil className="w-4 h-4 text-emerald-600 shrink-0" />ویرایش کاربر</> : <><Plus className="w-4 h-4 text-emerald-600 shrink-0" />افزودن کاربر جدید</>}
            </DialogTitle>
            <DialogDescription className="text-sm">{editUserId ? 'اطلاعات کاربر را ویرایش کنید' : 'اطلاعات کاربر جدید را وارد کنید'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2 sm:py-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1.5">
                <Label htmlFor="emp-username">نام کاربری</Label>
                <Input id="emp-username" value={formUsername} onChange={(e) => setFormUsername(e.target.value)} placeholder="مثال: cashier3" dir="ltr" />
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
                <Select value={formRole} onValueChange={(v) => setFormRole(v as 'Cashier' | 'Manager')}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cashier">صندوق‌دار</SelectItem>
                    <SelectItem value="Manager">مدیر</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {formRole === 'Cashier' && (
              <div className="space-y-2 p-2.5 sm:p-3.5 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                  <Label className="text-sm font-semibold text-amber-800">مجوزهای دسترسی صندوق‌دار</Label>
                </div>
                <p className="text-xs text-amber-700">منوهایی که این صندوق‌دار می‌بیند و به آنها دسترسی دارد. مدیر همیشه دسترسی کامل دارد.</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                  {CASHIER_PERMISSIONS.map((perm) => (
                    <label key={perm.key} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all text-sm ${formPermissions.includes(perm.key) ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                      <input type="checkbox" checked={formPermissions.includes(perm.key)} onChange={() => togglePermission(perm.key)} className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 shrink-0" />
                      <span className="truncate">{perm.label}</span>
                    </label>
                  ))}
                </div>
                {formPermissions.length === 0 && <p className="text-xs text-red-500 mt-1">حداقل یک مجوز باید انتخاب شود</p>}
              </div>
            )}
            {formRole === 'Manager' && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-emerald-800">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>مدیر دسترسی کامل به تمام بخش‌ها دارد</span>
                </div>
              </div>
            )}
            {formError && (
              <Alert className="border-red-200 bg-red-50">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                <AlertDescription className="text-red-700 text-sm">{formError}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm() }} className="w-full sm:w-auto">انصراف</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto" onClick={handleSaveUser} disabled={formSaving || (formRole === 'Cashier' && formPermissions.length === 0)}>
              {formSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : editUserId ? 'ذخیره تغییرات' : 'افزودن کاربر'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="w-[95vw] sm:max-w-[425px]">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف کاربر</AlertDialogTitle>
            <AlertDialogDescription>آیا از حذف این کاربر اطمینان دارید؟ این عمل قابل بازگشت نیست.</AlertDialogDescription>
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