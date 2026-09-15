'use client'

// ============================================================================
// src/components/auth/otp-form.tsx (v2.0)
// ★ کامپوننت ورودی OTP با طراحی مدرن
// ============================================================================

import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { Label } from '@/components/ui/label'
import { Phone } from 'lucide-react'

interface OTPFormProps {
  value: string
  onChange: (value: string) => void
  mobile?: string
  label?: string
  description?: string
  disabled?: boolean
  error?: string
}

export default function OTPForm({
  value,
  onChange,
  mobile,
  label = 'کد تأیید',
  description = 'کد ۶ رقمی ارسال شده به شماره موبایل خود را وارد کنید',
  disabled = false,
  error,
}: OTPFormProps) {
  return (
    <div className="space-y-4">
      {/* نمایش شماره موبایل */}
      {mobile && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-center gap-2">
          <Phone className="w-4 h-4 text-emerald-600" />
          <span className="text-sm text-gray-700">ارسال شده به:</span>
          <span className="text-sm font-bold text-gray-900" dir="ltr">{mobile}</span>
        </div>
      )}

      {/* لیبل و توضیح */}
      <div className="text-center space-y-1">
        {label && (
          <Label className="text-sm font-bold text-gray-900 block">{label}</Label>
        )}
        {description && (
          <p className="text-xs text-gray-500">{description}</p>
        )}
      </div>

      {/* ورودی OTP */}
      <div className="flex justify-center" dir="ltr">
        <InputOTP
          maxLength={6}
          value={value}
          onChange={onChange}
          disabled={disabled}
        >
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
            <InputOTPSlot index={3} />
            <InputOTPSlot index={4} />
            <InputOTPSlot index={5} />
          </InputOTPGroup>
        </InputOTP>
      </div>

      {/* خطا */}
      {error && (
        <p className="text-xs text-center text-red-600 font-medium">{error}</p>
      )}

      {/* راهنما */}
      <p className="text-[11px] text-center text-gray-400">
        کد را از پیامک دریافتی وارد کنید. در صورت عدم دریافت، دکمه ارسال مجدد را بزنید.
      </p>
    </div>
  )
}