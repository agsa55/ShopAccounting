// ============================================================================
// src/components/pos/quick-add-customer-modal.tsx — افزودن سریع مشتری
// ★ v1.0: فرم سریع با ۵ فیلد + اعتبارسنجی + Auto-select
// ============================================================================

'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  User,
  Phone,
  Hash,
  MapPin,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Save,
  UserPlus,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

// ═══════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════

const toFaNum = (n: number | string | null | undefined): string => {
  if (n === null || n === undefined) return '۰'
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)])
}

// ═══════════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════════

interface QuickAddCustomerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (customer: any) => void
  initialName?: string
}

interface FormData {
  firstName: string
  lastName: string
  mobile: string
  nationalCode: string
  address: string
}

interface FormErrors {
  firstName?: string
  lastName?: string
  mobile?: string
  nationalCode?: string
}

// ═══════════════════════════════════════════════════════════════
//  کامپوننت اصلی
// ═══════════════════════════════════════════════════════════════

export function QuickAddCustomerModal({
  open,
  onOpenChange,
  onCreated,
  initialName = '',
}: QuickAddCustomerModalProps) {
  const { toast } = useToast()
  const [formData, setFormData] = useState<FormData>({
    firstName: '',
    lastName: '',
    mobile: '',
    nationalCode: '',
    address: '',
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const firstNameRef = useRef<HTMLInputElement>(null)

  // ═══════════════════════════════════════════════════════════════
  //  Auto-focus و پر کردن از initialName
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (open) {
      // اگر نام اولیه داشت، تجزیه کن
      if (initialName.trim()) {
        const parts = initialName.trim().split(/\s+/)
        setFormData((prev) => ({
          ...prev,
          firstName: parts[0] || '',
          lastName: parts.slice(1).join(' ') || '',
        }))
      }
      
      setServerError(null)
      setErrors({})
      
      setTimeout(() => {
        firstNameRef.current?.focus()
        firstNameRef.current?.select()
      }, 100)
    }
  }, [open, initialName])

  // ═══════════════════════════════════════════════════════════════
  //  Keyboard shortcut: Ctrl+Enter برای submit
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        handleSubmit()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, formData])

  // ═══════════════════════════════════════════════════════════════
  //  اعتبارسنجی
  // ═══════════════════════════════════════════════════════════════
  const validate = (): boolean => {
    const newErrors: FormErrors = {}

    if (!formData.firstName.trim()) {
      newErrors.firstName = 'نام الزامی است'
    } else if (formData.firstName.trim().length < 2) {
      newErrors.firstName = 'نام حداقل ۲ کاراکتر'
    }

    if (!formData.lastName.trim()) {
      newErrors.lastName = 'نام خانوادگی الزامی است'
    } else if (formData.lastName.trim().length < 2) {
      newErrors.lastName = 'نام خانوادگی حداقل ۲ کاراکتر'
    }

    if (!formData.mobile.trim()) {
      newErrors.mobile = 'شماره تماس الزامی است'
    } else {
      const mobileClean = formData.mobile.replace(/\D/g, '')
      if (!/^09\d{9}$/.test(mobileClean)) {
        newErrors.mobile = 'شماره موبایل معتبر نیست (مثل ۰۹۱۲۳۴۵۶۷۸۹)'
      }
    }

    if (formData.nationalCode.trim()) {
      const codeClean = formData.nationalCode.replace(/\D/g, '')
      if (!/^\d{10}$/.test(codeClean)) {
        newErrors.nationalCode = 'کد ملی باید ۱۰ رقم باشد'
      } else if (!isValidNationalCode(codeClean)) {
        newErrors.nationalCode = 'کد ملی نامعتبر است'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // ═══════════════════════════════════════════════════════════════
  //  اعتبارسنجی کد ملی ایرانی
  // ═══════════════════════════════════════════════════════════════
  const isValidNationalCode = (code: string): boolean => {
    if (!/^\d{10}$/.test(code)) return false
    if (/^(\d)\1{9}$/.test(code)) return false // همه ارقام یکسان
    
    const check = parseInt(code[9])
    let sum = 0
    for (let i = 0; i < 9; i++) {
      sum += parseInt(code[i]) * (10 - i)
    }
    const remainder = sum % 11
    return (
      (remainder < 2 && check === remainder) ||
      (remainder >= 2 && check === 11 - remainder)
    )
  }

  // ═══════════════════════════════════════════════════════════════
  //  Submit
  // ═══════════════════════════════════════════════════════════════
  const handleSubmit = async () => {
    if (!validate()) return
    if (isSubmitting) return

    setIsSubmitting(true)
    setServerError(null)

    try {
      const payload = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        mobile: formData.mobile.replace(/\D/g, ''),
        nationalCode: formData.nationalCode.replace(/\D/g, '') || null,
        address: formData.address.trim() || null,
      }

      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        if (data.code === 'PLAN_LIMIT_CUSTOMERS') {
          setServerError(
            `محدودیت پلن: شما به سقف مشتریان مجاز رسیده‌اید. ${data.error || ''}`
          )
        } else {
          setServerError(data.error || 'خطا در ایجاد مشتری')
        }
        return
      }

      const newCustomer = {
        ...data.data,
        displayName: `${data.data.firstName} ${data.data.lastName}`.trim(),
      }

      toast({
        title: '✅ مشتری اضافه شد',
        description: `${newCustomer.displayName} با موفقیت ثبت و انتخاب شد`,
        variant: 'default',
        duration: 3000,
      })

      // فراخوانی callback برای auto-select
      onCreated(newCustomer)

      // پاک کردن فرم و بستن
      setFormData({
        firstName: '',
        lastName: '',
        mobile: '',
        nationalCode: '',
        address: '',
      })
      setErrors({})
      onOpenChange(false)
    } catch (err: any) {
      console.error('[QuickAddCustomer] Error:', err)
      setServerError(err.message || 'خطا در اتصال به سرور')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  Handle input changes
  // ═══════════════════════════════════════════════════════════════
  const handleChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  Render
  // ═══════════════════════════════════════════════════════════════

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-700 text-sm sm:text-base">
            <UserPlus className="w-4 h-4" />
            افزودن مشتری جدید
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            اطلاعات مشتری را وارد کنید. پس از ثبت، به طور خودکار برای این فاکتور انتخاب می‌شود.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-3 text-[11px] sm:text-xs">
          {/* خطای سرور */}
          {serverError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-[11px] text-red-700 font-medium">خطا در ثبت</p>
                <p className="text-[10px] text-red-600 mt-0.5">{serverError}</p>
              </div>
            </div>
          )}

          {/* نام */}
          <div className="space-y-1">
            <Label className="text-slate-600 font-medium flex items-center gap-1 text-[11px]">
              <User className="w-3 h-3" />
              نام <span className="text-red-500">*</span>
            </Label>
            <Input
              ref={firstNameRef}
              type="text"
              value={formData.firstName}
              onChange={(e) => handleChange('firstName', e.target.value)}
              placeholder="مثلاً: علی"
              className={`h-8 sm:h-9 text-xs ${
                errors.firstName ? 'border-red-400 focus:border-red-500' : ''
              }`}
              autoFocus
              dir="rtl"
            />
            {errors.firstName && (
              <p className="text-[10px] text-red-500 mt-0.5">{errors.firstName}</p>
            )}
          </div>

          {/* نام خانوادگی */}
          <div className="space-y-1">
            <Label className="text-slate-600 font-medium flex items-center gap-1 text-[11px]">
              <User className="w-3 h-3" />
              نام خانوادگی <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              value={formData.lastName}
              onChange={(e) => handleChange('lastName', e.target.value)}
              placeholder="مثلاً: رضایی"
              className={`h-8 sm:h-9 text-xs ${
                errors.lastName ? 'border-red-400 focus:border-red-500' : ''
              }`}
              dir="rtl"
            />
            {errors.lastName && (
              <p className="text-[10px] text-red-500 mt-0.5">{errors.lastName}</p>
            )}
          </div>

          {/* شماره تماس */}
          <div className="space-y-1">
            <Label className="text-slate-600 font-medium flex items-center gap-1 text-[11px]">
              <Phone className="w-3 h-3" />
              شماره تماس <span className="text-red-500">*</span>
            </Label>
            <Input
              type="tel"
              value={formData.mobile}
              onChange={(e) => {
                // فقط ارقام
                const digits = e.target.value.replace(/\D/g, '').slice(0, 11)
                handleChange('mobile', digits)
              }}
              placeholder="09123456789"
              className={`h-8 sm:h-9 text-xs font-mono ${
                errors.mobile ? 'border-red-400 focus:border-red-500' : ''
              }`}
              dir="ltr"
              maxLength={11}
            />
            {errors.mobile && (
              <p className="text-[10px] text-red-500 mt-0.5">{errors.mobile}</p>
            )}
          </div>

          {/* کد ملی */}
          <div className="space-y-1">
            <Label className="text-slate-600 font-medium flex items-center gap-1 text-[11px]">
              <Hash className="w-3 h-3" />
              کد ملی <span className="text-slate-400 text-[9px]">(اختیاری)</span>
            </Label>
            <Input
              type="text"
              value={formData.nationalCode}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '').slice(0, 10)
                handleChange('nationalCode', digits)
              }}
              placeholder="1234567890"
              className={`h-8 sm:h-9 text-xs font-mono ${
                errors.nationalCode ? 'border-red-400 focus:border-red-500' : ''
              }`}
              dir="ltr"
              maxLength={10}
            />
            {errors.nationalCode && (
              <p className="text-[10px] text-red-500 mt-0.5">{errors.nationalCode}</p>
            )}
          </div>

          {/* آدرس */}
          <div className="space-y-1">
            <Label className="text-slate-600 font-medium flex items-center gap-1 text-[11px]">
              <MapPin className="w-3 h-3" />
              آدرس <span className="text-slate-400 text-[9px]">(اختیاری)</span>
            </Label>
            <Input
              type="text"
              value={formData.address}
              onChange={(e) => handleChange('address', e.target.value)}
              placeholder="آدرس کامل..."
              className="h-8 sm:h-9 text-xs"
              dir="rtl"
            />
          </div>

          {/* راهنمای کلید میانبر */}
          <div className="flex items-center justify-between text-[9px] text-slate-400 pt-1 border-t border-slate-100">
            <span>
              <kbd className="px-1.5 py-0.5 bg-slate-100 rounded border border-slate-200 font-mono text-[8px]">
                Ctrl
              </kbd>
              {' + '}
              <kbd className="px-1.5 py-0.5 bg-slate-100 rounded border border-slate-200 font-mono text-[8px]">
                Enter
              </kbd>
              {' برای ثبت سریع'}
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="border-slate-300 text-xs sm:text-sm h-8 sm:h-9"
          >
            انصراف
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm h-8 sm:h-9"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 ml-1 animate-spin" />
                در حال ثبت...
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5 ml-1" />
                ثبت و انتخاب
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}