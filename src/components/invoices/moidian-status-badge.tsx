'use client'

// ============================================================================
// src/components/invoices/moidian-status-badge.tsx — Badge وضعیت فاکتور در مودیان
// ============================================================================
// ★ نمایش وضعیت ارسال فاکتور به سامانه مودیان در لیست فاکتورها
// ★ استفاده: <MoidianStatusBadge status={inv.moidianStatus} referenceId={inv.moidianReferenceId} />
// ============================================================================

import React from 'react'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, XCircle, Clock, AlertCircle, Ban, Send, Loader2 } from 'lucide-react'

export type MoidianStatus =
  | 'PENDING'
  | 'SUBMITTED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'FAILED'
  | null
  | undefined

interface Props {
  status: MoidianStatus
  referenceId?: string | null
  size?: 'sm' | 'md'
}

const STATUS_CONFIG: Record<string, {
  label: string
  bg: string
  text: string
  border: string
  icon: React.ReactNode
}> = {
  PENDING: {
    label: 'در انتظار',
    bg: 'bg-gray-100',
    text: 'text-gray-700',
    border: 'border-gray-200',
    icon: <Clock className="w-3 h-3" />,
  },
  SUBMITTED: {
    label: 'ارسال شده',
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    border: 'border-blue-200',
    icon: <Send className="w-3 h-3" />,
  },
  ACCEPTED: {
    label: 'پذیرفته شده',
    bg: 'bg-emerald-100',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  REJECTED: {
    label: 'رد شده',
    bg: 'bg-red-100',
    text: 'text-red-700',
    border: 'border-red-200',
    icon: <XCircle className="w-3 h-3" />,
  },
  CANCELLED: {
    label: 'لغو شده',
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    border: 'border-gray-200',
    icon: <Ban className="w-3 h-3" />,
  },
  FAILED: {
    label: 'ناموفق',
    bg: 'bg-amber-100',
    text: 'text-amber-700',
    border: 'border-amber-200',
    icon: <AlertCircle className="w-3 h-3" />,
  },
}

export function MoidianStatusBadge({ status, referenceId, size = 'sm' }: Props) {
  // ★ اگر status null یا undefined باشد، یعنی فاکتور هنوز به مودیان ارسال نشده
  if (!status) {
    return (
      <Badge
        variant="outline"
        className={`text-[9px] sm:text-[10px] bg-gray-50 text-gray-400 border-gray-200 ${size === 'sm' ? 'h-5' : 'h-6'} px-1.5`}
        title="این فاکتور به سامانه مودیان ارسال نشده است"
      >
        مودیان: ارسال نشده
      </Badge>
    )
  }

  const config = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING

  return (
    <Badge
      variant="outline"
      className={`text-[9px] sm:text-[10px] ${config.bg} ${config.text} ${config.border} ${size === 'sm' ? 'h-5' : 'h-6'} px-1.5 gap-0.5`}
      title={referenceId ? `شماره مرجع مودیان: ${referenceId}` : undefined}
    >
      {config.icon}
      مودیان: {config.label}
    </Badge>
  )
}

// ★ helper برای تشخیص اینکه آیا فاکتور قابل ارسال به مودیان است
export function canSubmitToMoidian(status: MoidianStatus, invoiceStatus: string): boolean {
  if (!status || status === 'FAILED' || status === 'PENDING') {
    const s = (invoiceStatus || '').toLowerCase()
    return ['paid', 'confirmed'].includes(s)
  }
  return false
}

// ★ helper برای تشخیص اینکه آیا فاکتور قابل لغو در مودیان است
export function canCancelInMoidian(status: MoidianStatus): boolean {
  return status === 'SUBMITTED' || status === 'ACCEPTED' || status === 'PENDING'
}
