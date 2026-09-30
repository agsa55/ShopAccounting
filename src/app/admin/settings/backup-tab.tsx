'use client'

// ============================================================================
// src/app/admin/settings/backup-tab.tsx
// تب پشتیبان‌گیری در تنظیمات ادمین
// ★ v1.2 — قابلیت بکاپ گروهی از همه فروشگاه‌ها
// ============================================================================

import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Database, FileArchive, Loader2, CheckCircle2, Download, Trash2,
  AlertTriangle, ShieldAlert, Store, HardDrive, Clock,
  Search, XCircle, Info, RefreshCw, Crown, Users, Play, Square,
} from 'lucide-react'

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════
const toFaNum = (n: number | string | null | undefined): string => {
  if (n === null || n === undefined) return '۰'
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)])
}

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return toFaNum(bytes) + ' B'
  if (bytes < 1024 * 1024) return toFaNum((bytes / 1024).toFixed(1)) + ' KB'
  if (bytes < 1024 * 1024 * 1024)
    return toFaNum((bytes / (1024 * 1024)).toFixed(2)) + ' MB'
  return toFaNum((bytes / (1024 * 1024 * 1024)).toFixed(2)) + ' GB'
}

const formatDate = (dateStr: string): string => {
  try {
    return new Date(dateStr).toLocaleString('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════
interface BulkError {
  tenantId: string
  tenantName: string
  error: string
}

interface BulkProgress {
  total: number
  completed: number
  currentTenant: string | null
  currentSubDomain: string | null
  successes: number
  errors: BulkError[]
  startTime: number
}

// ═══════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════
export function AdminBackupTab() {
  const [backups, setBackups] = useState<any[]>([])
  const [tenants, setTenants] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<any>(null)

  // ─── Delete / Full Backup Dialog ───
  const [confirmDialog, setConfirmDialog] = useState<{
    type: 'delete' | 'full_backup'
    item: any
  } | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [processing, setProcessing] = useState(false)

  // ─── Restore Dialog ───
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false)
  const [restoreBackupId, setRestoreBackupId] = useState<string | null>(null)
  const [restoreConfirmText, setRestoreConfirmText] = useState('')
  const [restoring, setRestoring] = useState(false)

  // ─── ★ Bulk Backup (جدید) ───
  const [bulkProgress, setBulkProgress] = useState<BulkProgress | null>(null)
  const [isBulkRunning, setIsBulkRunning] = useState(false)
  const bulkCancelRef = useRef(false)

  // ─── Filters ───
  const [filterType, setFilterType] = useState<
    'all' | 'tenant' | 'full_database'
  >('all')
  const [searchTerm, setSearchTerm] = useState('')

  // ═══════════════════════════════════════════════════════
  // Load data
  // ═══════════════════════════════════════════════════════
  const loadData = async () => {
    try {
      const [backupRes, tenantRes] = await Promise.all([
        fetch('/api/admin/backup', { credentials: 'include' }),
        fetch('/api/admin/tenants', { credentials: 'include' }),
      ])
      const backupData = await backupRes.json().catch(() => ({}))
      const tenantData = await tenantRes.json().catch(() => ({}))

      if (backupData.success) {
        setBackups(backupData.data || [])
        setStats(backupData.stats || null)
      }
      if (tenantData.success) {
        setTenants(tenantData.data || [])
      }
    } catch (err) {
      console.error('[BackupTab] Load error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // ═══════════════════════════════════════════════════════
  // Filtered backups
  // ═══════════════════════════════════════════════════════
  const filteredBackups = useMemo(() => {
    return backups.filter((b) => {
      const matchType = filterType === 'all' || b.type === filterType
      const matchSearch =
        searchTerm === '' ||
        (b.file_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (b.tenant_name || '').toLowerCase().includes(searchTerm.toLowerCase())
      return matchType && matchSearch
    })
  }, [backups, filterType, searchTerm])

  // ═══════════════════════════════════════════════════════
  // Create tenant backup
  // ═══════════════════════════════════════════════════════
  const handleCreateTenantBackup = async (tenant: any) => {
    const key = `tenant:${tenant.id}`
    setCreating(key)
    setLastResult(null)
    try {
      const res = await fetch('/api/admin/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ type: 'tenant', tenantId: tenant.id }),
      })
      const data = await res.json()
      if (data.success) {
        setLastResult({
          type: 'tenant',
          ...data.data,
          tenantName: tenant.companyName,
        })
        await loadData()
      } else {
        alert('خطا: ' + (data.error || 'نامشخص'))
      }
    } catch (err: any) {
      alert('خطای شبکه: ' + err.message)
    } finally {
      setCreating(null)
    }
  }

  // ═══════════════════════════════════════════════════════
  // Create full database backup
  // ═══════════════════════════════════════════════════════
  const handleCreateFullBackup = async () => {
    setProcessing(true)
    try {
      const res = await fetch('/api/admin/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ type: 'full_database' }),
      })
      const data = await res.json()
      if (data.success) {
        setLastResult({ type: 'full_database', ...data.data })
        setConfirmDialog(null)
        setConfirmText('')
        await loadData()
      } else {
        alert('خطا: ' + (data.error || 'نامشخص'))
      }
    } catch (err: any) {
      alert('خطای شبکه: ' + err.message)
    } finally {
      setProcessing(false)
    }
  }

  // ═══════════════════════════════════════════════════════
  // Download backup
  // ═══════════════════════════════════════════════════════
  const handleDownload = async (id: string, fileName: string) => {
    try {
      const res = await fetch(`/api/admin/backup/download?id=${id}`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error('خطا در دانلود')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err: any) {
      alert('خطا در دانلود: ' + err.message)
    }
  }

  // ═══════════════════════════════════════════════════════
  // Delete backup
  // ═══════════════════════════════════════════════════════
  const handleDelete = async () => {
    if (!confirmDialog || confirmDialog.type !== 'delete') return
    setProcessing(true)
    try {
      const res = await fetch(
        `/api/admin/backup?id=${confirmDialog.item.id}`,
        {
          method: 'DELETE',
          credentials: 'include',
        }
      )
      const data = await res.json()
      if (data.success) {
        setConfirmDialog(null)
        setConfirmText('')
        await loadData()
      } else {
        alert('خطا: ' + (data.error || 'نامشخص'))
      }
    } catch (err: any) {
      alert('خطای شبکه: ' + err.message)
    } finally {
      setProcessing(false)
    }
  }

  // ═══════════════════════════════════════════════════════
  // Restore backup
  // ═══════════════════════════════════════════════════════
  const handleRestore = async () => {
    if (!restoreBackupId) return

    if (restoreConfirmText.trim() !== 'RESTORE') {
      alert('لطفاً عبارت RESTORE را به درستی تایپ کنید')
      return
    }

    setRestoring(true)
    try {
      const res = await fetch('/api/admin/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'restore',
          backupId: restoreBackupId,
        }),
      })
      const data = await res.json()
      if (data.success) {
        alert(
          `✅ بازیابی با موفقیت انجام شد!\n\n` +
            `تعداد رکوردهای بازیابی شده: ${toFaNum(data.data.restoredCount)}\n` +
            `تعداد جداول: ${toFaNum(data.data.tablesRestored.length)}\n` +
            `مدت زمان: ${toFaNum((data.data.duration / 1000).toFixed(1))} ثانیه\n\n` +
            `⚠️ صفحه رفرش می‌شود...`
        )
        setRestoreDialogOpen(false)
        setRestoreBackupId(null)
        setRestoreConfirmText('')
        window.location.reload()
      } else {
        alert('خطا: ' + (data.error || 'نامشخص'))
      }
    } catch (err: any) {
      alert('خطای شبکه: ' + err.message)
    } finally {
      setRestoring(false)
    }
  }

  const openRestoreDialog = (backupId: string) => {
    setRestoreBackupId(backupId)
    setRestoreConfirmText('')
    setRestoreDialogOpen(true)
  }

  const closeRestoreDialog = () => {
    if (restoring) return
    setRestoreDialogOpen(false)
    setRestoreBackupId(null)
    setRestoreConfirmText('')
  }

  // ═══════════════════════════════════════════════════════
  // ★ Bulk Backup — بکاپ گروهی از همه فروشگاه‌ها (جدید)
  // ═══════════════════════════════════════════════════════
  const handleBulkBackup = async () => {
    if (tenants.length === 0) {
      alert('هیچ فروشگاهی برای بکاپ‌گیری وجود ندارد')
      return
    }

    const confirmMsg = 
      `🎯 بکاپ‌گیری گروهی از ${toFaNum(tenants.length)} فروشگاه\n\n` +
      `• هر فروشگاه در یک فایل بکاپ جداگانه ذخیره می‌شود\n` +
      `• این عملیات ممکن است ${toFaNum(Math.ceil(tenants.length * 0.1))} تا ${toFaNum(Math.ceil(tenants.length * 0.3))} دقیقه طول بکشد\n` +
      `• در حین انجام، صفحه را نبندید\n\n` +
      `آیا مطمئن هستید؟`

    if (!confirm(confirmMsg)) return

    setIsBulkRunning(true)
    bulkCancelRef.current = false
    
    setBulkProgress({
      total: tenants.length,
      completed: 0,
      currentTenant: null,
      currentSubDomain: null,
      successes: 0,
      errors: [],
      startTime: Date.now(),
    })

    const errors: BulkError[] = []
    let successes = 0

    for (let i = 0; i < tenants.length; i++) {
      // بررسی لغو
      if (bulkCancelRef.current) {
        console.log('[Bulk] Cancelled by user at tenant', i)
        break
      }

      const tenant = tenants[i]
      
      // به‌روزرسانی فروشگاه فعلی
      setBulkProgress((prev) =>
        prev
          ? {
              ...prev,
              currentTenant: tenant.companyName,
              currentSubDomain: tenant.subDomain,
            }
          : prev
      )

      try {
        const res = await fetch('/api/admin/backup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ type: 'tenant', tenantId: tenant.id }),
        })
        const data = await res.json()

        if (data.success) {
          successes++
        } else {
          errors.push({
            tenantId: tenant.id,
            tenantName: tenant.companyName,
            error: data.error || 'خطای نامشخص',
          })
        }
      } catch (err: any) {
        errors.push({
          tenantId: tenant.id,
          tenantName: tenant.companyName,
          error: err.message || 'خطای شبکه',
        })
      }

      // به‌روزرسانی پیشرفت
      setBulkProgress((prev) =>
        prev
          ? {
              ...prev,
              completed: i + 1,
              successes,
              errors: [...errors],
            }
          : prev
      )
    }

    setIsBulkRunning(false)

    // بارگذاری مجدد لیست بکاپ‌ها
    await loadData()

    // پیام نهایی
    if (bulkCancelRef.current) {
      alert(
        `⏹️ عملیات لغو شد\n\n` +
          `موفق: ${toFaNum(successes)}\n` +
          `خطا: ${toFaNum(errors.length)}\n` +
          `باقی‌مانده: ${toFaNum(tenants.length - (successes + errors.length))}`
      )
    } else if (errors.length === 0) {
      alert(
        `🎉 بکاپ‌گیری از همه ${toFaNum(tenants.length)} فروشگاه با موفقیت انجام شد!\n\n` +
          `مدت زمان: ${toFaNum(((Date.now() - Date.now()) / 1000).toFixed(1))} ثانیه`
      )
    } else {
      alert(
        `⚠️ بکاپ‌گیری با ${toFaNum(errors.length)} خطا انجام شد\n\n` +
          `موفق: ${toFaNum(successes)}\n` +
          `خطا: ${toFaNum(errors.length)}\n\n` +
          `جزئیات خطاها در صفحه نمایش داده شده است.`
      )
    }
  }

  const cancelBulkBackup = () => {
    if (confirm('آیا از لغو عملیات بکاپ‌گیری گروهی مطمئن هستید؟\nبکاپ‌های گرفته‌شده حفظ می‌شوند.')) {
      bulkCancelRef.current = true
    }
  }

  const clearBulkProgress = () => {
    setBulkProgress(null)
  }

  // ═══════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-[#7C7BEB]" />
      </div>
    )
  }

  const restoreBackupItem = restoreBackupId
    ? backups.find((b) => b.id === restoreBackupId)
    : null

  const bulkPercentage = bulkProgress
    ? Math.round((bulkProgress.completed / bulkProgress.total) * 100)
    : 0

  return (
    <div className="space-y-4">
      {/* ═══════ Success Alert ═══════ */}
      {lastResult && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-emerald-900">
              {lastResult.type === 'full_database'
                ? '✅ بکاپ کامل دیتابیس ایجاد شد'
                : `✅ بکاپ فروشگاه «${lastResult.tenantName}» ایجاد شد`}
            </p>
            <p className="text-xs text-emerald-700 mt-0.5">
              حجم:{' '}
              <span className="font-bold">
                {formatSize(lastResult.fileSize)}
              </span>{' '}
              • رکوردها:{' '}
              <span className="font-bold">
                {toFaNum(lastResult.recordCount)}
              </span>{' '}
              • مدت:{' '}
              <span className="font-bold">
                {toFaNum((lastResult.duration / 1000).toFixed(1))} ثانیه
              </span>
            </p>
          </div>
          <button
            onClick={() => setLastResult(null)}
            className="text-emerald-600 hover:text-emerald-800"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ═══════ Stats Cards ═══════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#7C7BEB] to-[#5B5AC7] flex items-center justify-center">
              <Database className="w-4 h-4 text-white" />
            </div>
            <p className="text-[10px] text-gray-500 font-medium">
              کل بکاپ‌ها
            </p>
          </div>
          <p className="text-2xl font-black text-gray-900" dir="ltr">
            {toFaNum(stats?.total || 0)}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <Store className="w-4 h-4 text-white" />
            </div>
            <p className="text-[10px] text-gray-500 font-medium">
              بکاپ فروشگاه
            </p>
          </div>
          <p className="text-2xl font-black text-gray-900" dir="ltr">
            {toFaNum(stats?.tenantCount || 0)}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <HardDrive className="w-4 h-4 text-white" />
            </div>
            <p className="text-[10px] text-gray-500 font-medium">
              بکاپ کامل
            </p>
          </div>
          <p className="text-2xl font-black text-gray-900" dir="ltr">
            {toFaNum(stats?.fullCount || 0)}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <FileArchive className="w-4 h-4 text-white" />
            </div>
            <p className="text-[10px] text-gray-500 font-medium">حجم کل</p>
          </div>
          <p className="text-2xl font-black text-gray-900" dir="ltr">
            {formatSize(stats?.totalSize || 0)}
          </p>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ★★★ بخش جدید: بکاپ گروهی از همه فروشگاه‌ها ★★★ */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 border-2 border-indigo-200 rounded-xl p-4 shadow-md">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-600 flex items-center justify-center shadow-lg shrink-0">
            <Users className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-black text-gray-900 flex items-center gap-1.5 flex-wrap">
              بکاپ گروهی از همه فروشگاه‌ها
              <span className="text-[9px] font-bold bg-gradient-to-l from-indigo-500 to-purple-600 text-white px-2 py-0.5 rounded-full">
                جدید
              </span>
            </h3>
            <p className="text-[11px] text-gray-600 mt-0.5 leading-relaxed">
              با یک کلیک از همه{' '}
              <span className="font-bold text-indigo-700">
                {toFaNum(tenants.length)}
              </span>{' '}
              فروشگاه موجود، بکاپ جداگانه گرفته می‌شود
            </p>
          </div>
        </div>

        {/* حالت اولیه - دکمه شروع */}
        {!bulkProgress && (
          <button
            onClick={handleBulkBackup}
            disabled={tenants.length === 0}
            className="w-full px-4 py-3 bg-gradient-to-l from-indigo-500 via-purple-600 to-pink-600 hover:from-indigo-600 hover:via-purple-700 hover:to-pink-700 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
          >
            {tenants.length === 0 ? (
              <>
                <AlertTriangle className="w-4 h-4" />
                فروشگاهی برای بکاپ‌گیری وجود ندارد
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                شروع بکاپ‌گیری از {toFaNum(tenants.length)} فروشگاه
              </>
            )}
          </button>
        )}

        {/* حالت در حال اجرا یا پایان یافته */}
        {bulkProgress && (
          <div className="space-y-3">
            {/* Progress Header */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <div className="flex items-center gap-2">
                  {isBulkRunning ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                  ) : bulkProgress.errors.length === 0 ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  )}
                  <span className="text-xs font-bold text-gray-700">
                    {isBulkRunning
                      ? 'در حال بکاپ‌گیری...'
                      : bulkProgress.errors.length === 0
                      ? '✅ عملیات با موفقیت پایان یافت'
                      : `⚠️ عملیات با ${toFaNum(bulkProgress.errors.length)} خطا پایان یافت`}
                  </span>
                </div>
                <span className="text-xs font-black text-indigo-700">
                  {toFaNum(bulkPercentage)}٪
                </span>
              </div>

              {/* Progress Bar */}
              <div className="h-2.5 bg-white/60 border border-indigo-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    bulkProgress.errors.length > 0 && !isBulkRunning
                      ? 'bg-gradient-to-l from-amber-500 to-orange-600'
                      : 'bg-gradient-to-l from-indigo-500 via-purple-600 to-pink-600'
                  }`}
                  style={{ width: `${bulkPercentage}%` }}
                />
              </div>

              {/* Stats Row */}
              <div className="flex items-center justify-between mt-2 text-[10px]">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-gray-600">
                    <span className="font-bold text-gray-900">
                      {toFaNum(bulkProgress.completed)}
                    </span>{' '}
                    از{' '}
                    <span className="font-bold text-gray-900">
                      {toFaNum(bulkProgress.total)}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 text-emerald-700">
                    <CheckCircle2 className="w-3 h-3" />
                    موفق:{' '}
                    <span className="font-bold">
                      {toFaNum(bulkProgress.successes)}
                    </span>
                  </span>
                  {bulkProgress.errors.length > 0 && (
                    <span className="flex items-center gap-1 text-red-700">
                      <XCircle className="w-3 h-3" />
                      خطا:{' '}
                      <span className="font-bold">
                        {toFaNum(bulkProgress.errors.length)}
                      </span>
                    </span>
                  )}
                </div>
              </div>

              {/* Current Tenant */}
              {isBulkRunning && bulkProgress.currentTenant && (
                <div className="mt-2 bg-white/70 border border-indigo-200 rounded-lg p-2 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
                    {(bulkProgress.currentTenant || 'ف')[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-gray-500">
                      در حال بکاپ‌گیری:
                    </p>
                    <p className="text-xs font-bold text-gray-800 truncate">
                      {bulkProgress.currentTenant}
                    </p>
                  </div>
                  <p
                    className="text-[9px] text-gray-500 font-mono shrink-0"
                    dir="ltr"
                  >
                    {bulkProgress.currentSubDomain}
                  </p>
                </div>
              )}
            </div>

            {/* خطاها */}
            {bulkProgress.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-2.5">
                <p className="text-[11px] font-bold text-red-800 mb-1.5 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  فروشگاه‌هایی که بکاپ‌گیری از آنها ناموفق بود:
                </p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {bulkProgress.errors.map((err) => (
                    <div
                      key={err.tenantId}
                      className="bg-white border border-red-200 rounded p-1.5 text-[10px]"
                    >
                      <div className="flex items-start gap-1.5">
                        <XCircle className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-800 truncate">
                            {err.tenantName}
                          </p>
                          <p className="text-red-600 mt-0.5">{err.error}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2">
              {isBulkRunning ? (
                <button
                  onClick={cancelBulkBackup}
                  className="flex-1 px-3 py-2 bg-white border-2 border-red-300 text-red-600 hover:bg-red-50 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                >
                  <Square className="w-3.5 h-3.5" />
                  لغو عملیات
                </button>
              ) : (
                <>
                  <button
                    onClick={clearBulkProgress}
                    className="flex-1 px-3 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    بستن گزارش
                  </button>
                  <button
                    onClick={handleBulkBackup}
                    className="flex-1 px-3 py-2 bg-gradient-to-l from-indigo-500 to-purple-600 text-white hover:shadow-lg rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    اجرای مجدد
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ★★★ پایان بخش بکاپ گروهی ★★★ */}
      {/* ═══════════════════════════════════════════════════════════ */}

      {/* ═══════ Two Main Actions ═══════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Full Database Backup */}
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-md">
              <HardDrive className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-black text-gray-900 flex items-center gap-1.5">
                بکاپ کامل دیتابیس
                <Crown className="w-3.5 h-3.5 text-amber-600" />
              </h3>
              <p className="text-[11px] text-gray-600 mt-0.5 leading-relaxed">
                تمام داده‌های همه فروشگاه‌ها + داده‌های سیستمی
              </p>
            </div>
          </div>

          <div className="bg-amber-100/60 border border-amber-300 rounded-lg p-2.5 mb-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <p className="text-[10px] text-amber-900 leading-relaxed">
                <strong>هشدار:</strong> این عمل سنگین است و ممکن است چند دقیقه
                طول بکشد.
              </p>
            </div>
          </div>

          <button
            onClick={() =>
              setConfirmDialog({ type: 'full_backup', item: null })
            }
            disabled={creating !== null || isBulkRunning}
            className="w-full px-4 py-2.5 bg-gradient-to-l from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-md hover:shadow-lg"
          >
            {creating === 'full' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                در حال ایجاد بکاپ...
              </>
            ) : (
              <>
                <HardDrive className="w-4 h-4" />
                ایجاد بکاپ کامل دیتابیس
              </>
            )}
          </button>
        </div>

        {/* Tenant Backup */}
        <div className="bg-white border-2 border-gray-200 rounded-xl p-4">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#7C7BEB] to-[#5B5AC7] flex items-center justify-center shadow-md">
              <Store className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-black text-gray-900">
                بکاپ فروشگاه خاص
              </h3>
              <p className="text-[11px] text-gray-600 mt-0.5 leading-relaxed">
                فقط داده‌های یک فروشگاه مشخص
              </p>
            </div>
          </div>

          <div className="max-h-52 overflow-y-auto space-y-1.5">
            {tenants.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">
                فروشگاهی ثبت نشده
              </p>
            ) : (
              tenants.map((tenant) => {
                const isCreating = creating === `tenant:${tenant.id}`
                return (
                  <div
                    key={tenant.id}
                    className="flex items-center gap-2 p-2 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-100 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#7C7BEB] to-[#5B5AC7] flex items-center justify-center text-white font-bold text-xs shrink-0">
                      {(tenant.companyName || 'ف')[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-800 truncate">
                        {tenant.companyName}
                      </p>
                      <p
                        className="text-[9px] text-gray-500 font-mono truncate"
                        dir="ltr"
                      >
                        {tenant.subDomain}
                      </p>
                    </div>
                    <button
                      onClick={() => handleCreateTenantBackup(tenant)}
                      disabled={creating !== null || isBulkRunning}
                      className="px-3 py-1.5 bg-[#7C7BEB] hover:bg-[#5B5AC7] text-white rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all disabled:opacity-50 shrink-0"
                    >
                      {isCreating ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <>
                          <Database className="w-3 h-3" />
                          بکاپ
                        </>
                      )}
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* ═══════ Backup History ═══════ */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-3 border-b border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-500" />
            تاریخچه بکاپ‌ها
            <span className="text-[10px] font-bold text-[#7C7BEB] bg-purple-50 px-2 py-0.5 rounded-full">
              {toFaNum(filteredBackups.length)}
            </span>
          </h3>
          <button
            onClick={() => loadData()}
            className="p-1.5 text-gray-500 hover:text-[#7C7BEB] hover:bg-gray-100 rounded-lg transition"
            title="به‌روزرسانی"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Filters */}
        <div className="p-3 border-b border-gray-100 bg-gray-50/50">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="جستجو در نام فایل یا فروشگاه..."
                className="w-full pr-8 pl-3 py-2 text-xs bg-white border border-gray-200 rounded-lg focus:border-[#7C7BEB] focus:ring-2 focus:ring-[#7C7BEB]/10 outline-none transition"
              />
            </div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="px-3 py-2 text-xs bg-white border border-gray-200 rounded-lg focus:border-[#7C7BEB] outline-none cursor-pointer"
            >
              <option value="all">همه انواع</option>
              <option value="tenant">بکاپ فروشگاه</option>
              <option value="full_database">بکاپ کامل</option>
            </select>
          </div>
        </div>

        {/* List */}
        <div className="divide-y divide-gray-50">
          {filteredBackups.length === 0 ? (
            <div className="p-8 text-center">
              <FileArchive className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-xs text-gray-500">
                هنوز بکاپی ایجاد نشده است
              </p>
            </div>
          ) : (
            filteredBackups.map((backup) => (
              <div
                key={backup.id}
                className="p-3 hover:bg-gray-50/50 transition-colors flex items-center gap-3"
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    backup.type === 'full_database'
                      ? 'bg-gradient-to-br from-amber-500 to-orange-600'
                      : 'bg-gradient-to-br from-[#7C7BEB] to-[#5B5AC7]'
                  }`}
                >
                  {backup.type === 'full_database' ? (
                    <HardDrive className="w-4 h-4 text-white" />
                  ) : (
                    <Store className="w-4 h-4 text-white" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-bold text-gray-800 truncate">
                      {backup.tenant_name || 'بکاپ کامل دیتابیس'}
                    </p>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        backup.type === 'full_database'
                          ? 'bg-amber-100 text-amber-700 border border-amber-200'
                          : 'bg-purple-100 text-purple-700 border border-purple-200'
                      }`}
                    >
                      {backup.type === 'full_database' ? 'کامل' : 'فروشگاه'}
                    </span>
                  </div>
                  <p
                    className="text-[10px] text-gray-500 font-mono mt-0.5 truncate"
                    dir="ltr"
                  >
                    {backup.file_name}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-500 flex-wrap">
                    <span>{formatDate(backup.created_at)}</span>
                    <span className="text-gray-300">•</span>
                    <span>{formatSize(backup.file_size)}</span>
                    <span className="text-gray-300">•</span>
                    <span>{toFaNum(backup.record_count)} رکورد</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() =>
                      handleDownload(backup.id, backup.file_name)
                    }
                    className="w-8 h-8 rounded-lg text-emerald-600 hover:text-white bg-emerald-50 hover:bg-emerald-600 flex items-center justify-center transition"
                    title="دانلود فایل بکاپ"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => openRestoreDialog(backup.id)}
                    className="w-8 h-8 rounded-lg text-amber-600 hover:text-white bg-amber-50 hover:bg-amber-600 flex items-center justify-center transition"
                    title="بازیابی داده‌ها از این بکاپ (هشدار: جایگزینی کامل)"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() =>
                      setConfirmDialog({ type: 'delete', item: backup })
                    }
                    className="w-8 h-8 rounded-lg text-red-500 hover:text-white bg-red-50 hover:bg-red-600 flex items-center justify-center transition"
                    title="حذف فایل بکاپ"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ═══════ Info Box ═══════ */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-[11px] text-blue-900 leading-relaxed">
          <strong className="block mb-1">نکات مهم:</strong>
          <ul className="space-y-0.5 text-blue-800">
            <li>
              • <strong>بکاپ گروهی:</strong> با یک کلیک از همه فروشگاه‌ها بکاپ
              جداگانه می‌گیرد (مناسب برای ۱۰۰+ فروشگاه)
            </li>
            <li>
              • بکاپ‌ها به صورت JSON فشرده در دیتابیس ذخیره می‌شوند (دائمی و
              امن)
            </li>
            <li>
              • <strong>بازیابی:</strong> تمام داده‌های فعلی را پاک و داده‌های
              بکاپ را جایگزین می‌کند (غیرقابل بازگشت!)
            </li>
            <li>
              • قبل از بازیابی، حتماً یک بکاپ جدید از وضعیت فعلی بگیرید
            </li>
          </ul>
        </div>
      </div>

      {/* ═══════ Confirmation Dialog (Delete / Full Backup) ═══════ */}
      {confirmDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() =>
            !processing && (setConfirmDialog(null), setConfirmText(''))
          }
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {confirmDialog.type === 'full_backup' ? (
              <>
                <div className="bg-gradient-to-l from-amber-500 to-orange-600 px-4 py-3 text-white">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5" />
                    <h3 className="text-sm font-black">
                      تأیید بکاپ کامل دیتابیس
                    </h3>
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-xs text-amber-900 leading-relaxed">
                      این عملیات از <strong>تمام داده‌های سیستم</strong> شامل همه
                      فروشگاه‌ها، کاربران، پلن‌ها و اشتراک‌ها بکاپ می‌گیرد.
                      <br />
                      این عملیات ممکن است <strong>چند دقیقه</strong> طول بکشد.
                    </p>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-gray-700 mb-1.5 block">
                      برای تأیید، عبارت{' '}
                      <span className="text-amber-600">FULL BACKUP</span> را
                      تایپ کنید:
                    </label>
                    <input
                      type="text"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder="FULL BACKUP"
                      disabled={processing}
                      className="w-full px-3 py-2 border-2 border-amber-200 rounded-lg focus:border-amber-500 outline-none text-xs font-mono"
                      dir="ltr"
                    />
                  </div>
                </div>
                <div className="px-4 pb-4 flex gap-2">
                  <button
                    onClick={() => {
                      setConfirmDialog(null)
                      setConfirmText('')
                    }}
                    disabled={processing}
                    className="flex-1 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-50 disabled:opacity-50"
                  >
                    انصراف
                  </button>
                  <button
                    onClick={handleCreateFullBackup}
                    disabled={
                      processing || confirmText.trim() !== 'FULL BACKUP'
                    }
                    className="flex-1 px-3 py-2 bg-gradient-to-l from-amber-500 to-orange-600 text-white rounded-lg text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                  >
                    {processing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        در حال ایجاد...
                      </>
                    ) : (
                      <>
                        <HardDrive className="w-3.5 h-3.5" />
                        تأیید و شروع
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-gradient-to-l from-red-500 to-rose-600 px-4 py-3 text-white">
                  <div className="flex items-center gap-2">
                    <Trash2 className="w-5 h-5" />
                    <h3 className="text-sm font-black">حذف فایل بکاپ</h3>
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  <p className="text-xs text-gray-700 leading-relaxed">
                    آیا از حذف دائمی فایل{' '}
                    <strong>{confirmDialog.item.file_name}</strong> مطمئن هستید؟
                  </p>
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                    <p className="text-[10px] text-gray-500 mb-1">مشخصات:</p>
                    <p className="text-xs font-bold text-gray-900">
                      {confirmDialog.item.tenant_name || 'بکاپ کامل دیتابیس'}
                    </p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {formatSize(confirmDialog.item.file_size)} •{' '}
                      {toFaNum(confirmDialog.item.record_count)} رکورد
                    </p>
                  </div>
                </div>
                <div className="px-4 pb-4 flex gap-2">
                  <button
                    onClick={() => setConfirmDialog(null)}
                    disabled={processing}
                    className="flex-1 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-50 disabled:opacity-50"
                  >
                    انصراف
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={processing}
                    className="flex-1 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {processing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        در حال حذف...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-3.5 h-3.5" />
                        حذف دائمی
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══════ Restore Confirmation Dialog ═══════ */}
      {restoreDialogOpen && restoreBackupItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={closeRestoreDialog}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-l from-amber-500 to-orange-600 px-4 py-3 text-white">
              <div className="flex items-center gap-2">
                <RefreshCw
                  className={`w-5 h-5 ${restoring ? 'animate-spin' : ''}`}
                />
                <h3 className="text-sm font-black">بازیابی از بکاپ</h3>
              </div>
            </div>

            <div className="p-4 space-y-3">
              <div className="bg-red-50 border-2 border-red-300 rounded-lg p-3">
                <div className="flex gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-red-800 leading-relaxed">
                    <strong className="font-black block mb-1">
                      ⚠️ هشدار جدی!
                    </strong>
                    این عمل <strong>غیرقابل بازگشت</strong> است. تمام داده‌های
                    فعلی سیستم <strong>حذف</strong> شده و داده‌های این بکاپ
                    جایگزین می‌شوند.
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="text-[10px] text-gray-500 mb-2">
                  بکاپی که بازیابی می‌شود:
                </p>
                <div className="flex items-center gap-2">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0 ${
                      restoreBackupItem.type === 'full_database'
                        ? 'bg-gradient-to-br from-amber-500 to-orange-600'
                        : 'bg-gradient-to-br from-[#7C7BEB] to-[#5B5AC7]'
                    }`}
                  >
                    {restoreBackupItem.type === 'full_database' ? (
                      <HardDrive className="w-4 h-4" />
                    ) : (
                      <Store className="w-4 h-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-900 truncate">
                      {restoreBackupItem.tenant_name ||
                        'بکاپ کامل دیتابیس'}
                    </p>
                    <p
                      className="text-[10px] text-gray-500 font-mono truncate"
                      dir="ltr"
                    >
                      {restoreBackupItem.file_name}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-700 mb-1.5 block">
                  برای تأیید، عبارت <span className="text-red-600">RESTORE</span>{' '}
                  را تایپ کنید:
                </label>
                <input
                  type="text"
                  value={restoreConfirmText}
                  onChange={(e) => setRestoreConfirmText(e.target.value)}
                  placeholder="RESTORE"
                  disabled={restoring}
                  className="w-full px-3 py-2 border-2 border-red-200 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition text-xs font-mono disabled:opacity-50"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="px-4 pb-4 flex gap-2">
              <button
                onClick={closeRestoreDialog}
                disabled={restoring}
                className="flex-1 px-3 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-all text-xs font-bold disabled:opacity-50"
              >
                انصراف
              </button>
              <button
                onClick={handleRestore}
                disabled={
                  restoring || restoreConfirmText.trim() !== 'RESTORE'
                }
                className="flex-1 px-3 py-2.5 bg-gradient-to-l from-red-600 to-red-700 text-white rounded-lg hover:shadow-lg transition-all text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                {restoring ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>در حال بازیابی...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>بله، بازیابی کن</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}