'use client'

import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { Label } from '@/components/ui/label'

interface OTPFormProps {
  value: string
  onChange: (value: string) => void
  label?: string
  description?: string
  disabled?: boolean
}

export default function OTPForm({
  value,
  onChange,
  label = 'کد تایید',
  description = 'کد ۶ رقمی ارسال شده را وارد کنید',
  disabled = false,
}: OTPFormProps) {
  return (
    <div className="space-y-2">
      {label && <Label>{label}</Label>}
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
      {description && (
        <p className="text-xs text-center text-gray-500">{description}</p>
      )}
    </div>
  )
}
