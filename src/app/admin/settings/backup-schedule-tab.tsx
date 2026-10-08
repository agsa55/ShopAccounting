'use client'

// ============================================================================
// src/app/admin/settings/backup-schedule-tab.tsx
// ★ تب زمان‌بندی و آرشیو استورج بکاپ — نسخه فارسی/شمسی
// ----------------------------------------------------------------------------
// امکانات:
// - تنظیم زمان‌بندی بکاپ خودکار
// - اجرای دستی بکاپ زمان‌بندی‌شده
// - لیست فایل‌های استورج
// - دانلود تک‌فایل
// - دانلود ZIP انتخابی/همه
// - علامت‌گذاری دانلودشده
// - حذف اختیاری فایل‌ها از استورج
// - بازیابی از فایل موجود در استورج
// ============================================================================

import { useState, useEffect, useMemo } from 'react'
import {
  Database,
  FileArchive,
  Loader2,
  CheckCircle2,
  Download,
  Trash2,
  AlertTriangle,
  Store,
  HardDrive,
  Clock,
  XCircle,
  Info,
  RefreshCw,
  Play,
  Upload,
} from 'lucide-react'

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

const PERSIAN_TIMEZONE = 'Asia/Tehran'

const toFaNum = (n: number | string | null | undefined): string => {
  if (n === null || n === undefined) return '۰'
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)])
}

const formatSize = (bytes: number | null | undefined): string => {
  const n = Number(bytes || 0)
  if (n < 1024) return toFaNum(n) + ' بایت'
  if (n < 1024 * 1024) return toFaNum((n / 1024).toFixed(1)) + ' کیلوبایت'
  if (n < 1024 * 1024 * 1024)
    return toFaNum((n / (1024 * 1024)).toFixed(2)) + ' مگابایت'
  return toFaNum((n / (1024 * 1024 * 1024)).toFixed(2)) + ' گیگابایت'
}

function toDateValue(value: string | Date | null | undefined): Date | null {
  if (!value) return null

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  const str = String(value).trim()
  if (!str) return null

  // For date-only strings like 2026-10-08, avoid timezone shift by using noon.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str)
  if (dateOnly) {
    const y = Number(dateOnly[1])
    const m = Number(dateOnly[2])
    const d = Number(dateOnly[3])
    return new Date(y, m - 1, d, 12, 0, 0, 0)
  }

  const date = new Date(str)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatPersianDateTime(
  value: string | Date | null | undefined,
  timeZone: string = PERSIAN_TIMEZONE
): string {
  const date = toDateValue(value)
  if (!date) return '—'

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      calendar: 'persian',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    } as any).formatToParts(date)

    const get = (type: string) =>
      parts.find((p) => p.type === type)?.value || ''

    let hour = get('hour')
    if (hour === '24') hour = '00'

    return `${toFaNum(get('year'))}/${toFaNum(get('month'))}/${toFaNum(
      get('day')
    )} - ${toFaNum(hour)}:${toFaNum(get('minute'))}`
  } catch {
    return toFaNum(date.toLocaleString('fa-IR'))
  }
}

function formatPersianDate(
  value: string | Date | null | undefined,
  timeZone: string = PERSIAN_TIMEZONE
): string {
  const date = toDateValue(value)
  if (!date) return '—'

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      calendar: 'persian',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    } as any).formatToParts(date)

    const get = (type: string) =>
      parts.find((p) => p.type === type)?.value || ''

    return `${toFaNum(get('year'))}/${toFaNum(get('month'))}/${toFaNum(
      get('day')
    )}`
  } catch {
    return toFaNum(date.toLocaleDateString('fa-IR'))
  }
}

function statusFa(status: string | null | undefined): string {
  const map: Record<string, string> = {
    success: 'موفق',
    partial: 'موفق با خطا',
    failed: 'ناموفق',
    running: 'در حال اجرا',
    skipped: 'رد شده',
    disabled: 'غیرفعال',
    not_due_yet: 'هنوز زمان نشده',
    already_run_today: 'امروز اجرا شده',
    concurrent_or_not_claimable: 'در حال اجرا / قابل برداشت نبود',
    completed: 'تکمیل شده',
    pending: 'در انتظار',
    error: 'خطا',
  }

  const key = String(status || '').trim()
  return map[key] || key || '—'
}

function fileStatusFa(status: string | null | undefined): string {
  const map: Record<string, string> = {
    completed: 'تکمیل شده',
    pending: 'در انتظار',
    failed: 'ناموفق',
    error: 'خطا',
  }

  const key = String(status || '').trim()
  return map[key] || key || '—'
}

function isJwtLike(value: string): boolean {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)
}

function cleanTokenValue(value: string): string {
  const trimmed = String(value || '').trim()
  if (trimmed.startsWith('Bearer ')) return trimmed.slice(7).trim()
  if (trimmed.startsWith('bearer ')) return trimmed.slice(7).trim()
  return trimmed
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null

  const candidateKeys = [
    'token',
    'adminToken',
    'accessToken',
    'admin_token',
    'auth_token',
    'authToken',
    'NEXT_AUTH_SESSION_TOKEN',
    'next-auth.session-token',
  ]

  const stores = [window.localStorage, window.sessionStorage]

  for (const store of stores) {
    for (const key of Object.keys(store)) {
      const raw = store.getItem(key)
      if (!raw) continue

      const direct = cleanTokenValue(raw)
      if (isJwtLike(direct)) return direct

      try {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') {
          for (const innerKey of Object.keys(parsed)) {
            const innerValue = cleanTokenValue(String(parsed[innerKey]))
            if (isJwtLike(innerValue)) return innerValue
          }
        }
      } catch {
        // not JSON
      }
    }
  }

  const cookie = document.cookie || ''
  if (cookie) {
    const parts = cookie.split(';')
    for (const part of parts) {
      const eq = part.indexOf('=')
      if (eq < 0) continue

      const name = part.slice(0, eq).trim().toLowerCase()
      const value = part.slice(eq + 1).trim()

      if (
        name.includes('token') ||
        name.includes('admin') ||
        name.includes('auth') ||
        name.includes('jwt') ||
        name.includes('session')
      ) {
        const decoded = safeDecodeURIComponent(value)
        const cleaned = cleanTokenValue(decoded)
        if (isJwtLike(cleaned)) return cleaned
      }
    }
  }

  for (const key of candidateKeys) {
    const raw =
      window.localStorage.getItem(key) || window.sessionStorage.getItem(key)
    if (!raw) continue

    const cleaned = cleanTokenValue(raw)
    if (isJwtLike(cleaned)) return cleaned
  }

  return null
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getAdminToken()
  return {
    ...(extra || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const len = binary.length
  const bytes = new Uint8Array(new ArrayBuffer(len))

  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes.buffer
}

async function saveBlobToDisk(
  blob: Blob,
  suggestedFileName: string
): Promise<'saved' | 'downloaded' | 'canceled'> {
  const w = window as any

  if (typeof w.showSaveFilePicker === 'function') {
    try {
      const fileHandle = await w.showSaveFilePicker({
        suggestedName: suggestedFileName,
        types: [
          {
            description: 'Backup Archive',
            accept: {
              'application/zip': ['.zip'],
              'application/gzip': ['.gz'],
              'application/json': ['.json'],
            },
          },
        ],
      })

      const writable = await fileHandle.createWritable()
      await writable.write(blob)
      await writable.close()

      return 'saved'
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return 'canceled'
      }

      console.warn('[Save File Picker] failed, falling back to download:', err)
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = suggestedFileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  return 'downloaded'
}

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

interface Tenant {
  id: string
  companyName: string
  subDomain: string
  status?: string
}

interface StorageFile {
  id: string
  type: string
  tenant_id: string | null
  tenant_name: string | null
  file_name: string
  storage_path: string | null
  file_size: number
  size_original: number | null
  size_compressed: number | null
  checksum: string | null
  status: string | null
  error_message: string | null
  created_at: string
  expires_at: string | null
  downloaded_at: string | null
  archive_batch_id: string | null
  exists: boolean
  actual_size: number | null
}

interface Schedule {
  id: string
  enabled: boolean
  schedule_time: string
  timezone: string
  backup_full_database: boolean
  backup_all_tenants: boolean
  backup_selected_tenants: boolean
  selected_tenant_ids: string[]
  retention_days: number
  max_backups_per_tenant: number
  max_full_backups: number
  last_run_at: string | null
  last_run_date: string | null
  last_status: string | null
  last_error: string | null
  last_summary: any | null
  created_at: string
  updated_at: string
}

// ═══════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════

export function AdminBackupScheduleTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)

  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [files, setFiles] = useState<StorageFile[]>([])
  const [summary, setSummary] = useState<any>(null)

  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const [message, setMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  // ─── Delete Dialog ───
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean
    ids: string[]
    all: boolean
  }>({
    open: false,
    ids: [],
    all: false,
  })
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [processingDelete, setProcessingDelete] = useState(false)

  // ─── Restore Dialog ───
  const [restoreDialog, setRestoreDialog] = useState<StorageFile | null>(null)
  const [restoreConfirm, setRestoreConfirm] = useState('')
  const [restoring, setRestoring] = useState(false)

  // ═══════════════════════════════════════════════════════
  // Load data
  // ═══════════════════════════════════════════════════════
  const loadData = async () => {
    try {
      const [scheduleRes, tenantsRes, filesRes] = await Promise.all([
        fetch('/api/admin/backup/schedule', {
          credentials: 'include',
          headers: authHeaders(),
        }),
        fetch('/api/admin/tenants', {
          credentials: 'include',
          headers: authHeaders(),
        }),
        fetch('/api/admin/backup/storage/files?limit=200', {
          credentials: 'include',
          headers: authHeaders(),
        }),
      ])

      const scheduleData = scheduleRes.ok
        ? await scheduleRes.json().catch(() => ({}))
        : { success: false }

      const tenantsData = tenantsRes.ok
        ? await tenantsRes.json().catch(() => ({}))
        : { success: false }

      const filesData = filesRes.ok
        ? await filesRes.json().catch(() => ({}))
        : { success: false }

      if (scheduleData.success) {
        setSchedule(scheduleData.data)
      }

      if (tenantsData.success) {
        setTenants(tenantsData.data || [])
      }

      if (filesData.success) {
        setFiles(filesData.data || [])
        setSummary(filesData.summary || null)
      }
    } catch (err: any) {
      console.error('[BackupScheduleTab] Load error:', err)
      setMessage({
        type: 'error',
        text: 'خطا در بارگذاری اطلاعات: ' + (err?.message || 'نامشخص'),
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // ═══════════════════════════════════════════════════════
  // Derived
  // ═══════════════════════════════════════════════════════
  const allVisibleSelected =
    files.length > 0 && selectedIds.length === files.length

  // ═══════════════════════════════════════════════════════
  // Schedule actions
  // ═══════════════════════════════════════════════════════
  const updateSchedule = (patch: Partial<Schedule>) => {
    setSchedule((prev) => {
      if (!prev) return prev
      return { ...prev, ...patch }
    })
  }

  const toggleTenantSelection = (tenantId: string) => {
    setSchedule((prev) => {
      if (!prev) return prev

      const current = Array.isArray(prev.selected_tenant_ids)
        ? prev.selected_tenant_ids
        : []

      const next = current.includes(tenantId)
        ? current.filter((id) => id !== tenantId)
        : [...current, tenantId]

      return { ...prev, selected_tenant_ids: next }
    })
  }

  const saveSchedule = async () => {
    if (!schedule) return

    setSaving(true)
    setMessage(null)

    try {
      const res = await fetch('/api/admin/backup/schedule', {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          enabled: Boolean(schedule.enabled),
          schedule_time: String(schedule.schedule_time || '03:00'),
          timezone: String(schedule.timezone || PERSIAN_TIMEZONE),
          backup_full_database: Boolean(schedule.backup_full_database),
          backup_all_tenants: Boolean(schedule.backup_all_tenants),
          backup_selected_tenants: Boolean(schedule.backup_selected_tenants),
          selected_tenant_ids: Array.isArray(schedule.selected_tenant_ids)
            ? schedule.selected_tenant_ids
            : [],
          retention_days: Number(schedule.retention_days || 7),
          max_backups_per_tenant: Number(schedule.max_backups_per_tenant || 7),
          max_full_backups: Number(schedule.max_full_backups || 7),
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'خطا در ذخیره تنظیمات')
      }

      setSchedule(data.data)
      setMessage({ type: 'success', text: '✅ تنظیمات زمان‌بندی ذخیره شد.' })
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: '❌ ' + (err?.message || 'خطای ناشناخته'),
      })
    } finally {
      setSaving(false)
    }
  }

  const runNow = async () => {
    setRunning(true)
    setMessage(null)

    try {
      const res = await fetch('/api/admin/backup/schedule', {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ action: 'run' }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'خطا در اجرای دستی زمان‌بندی')
      }

      const result = data.data

      setMessage({
        type: result?.status === 'success' ? 'success' : 'error',
        text:
          result?.status === 'success'
            ? `✅ اجرای دستی موفق بود. فروشگاه‌ها: ${toFaNum(
                result.tenantsTotal
              )} | موفق: ${toFaNum(result.successes)} | خطا: ${toFaNum(
                result.errors?.length || 0
              )}`
            : `⚠️ اجرای دستی با وضعیت «${statusFa(result?.status)}» پایان یافت.`,
      })

      await loadData()
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: '❌ ' + (err?.message || 'خطای ناشناخته'),
      })
    } finally {
      setRunning(false)
    }
  }

  // ═══════════════════════════════════════════════════════
  // File selection
  // ═══════════════════════════════════════════════════════
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds([])
    } else {
      setSelectedIds(files.map((f) => f.id))
    }
  }

  // ═══════════════════════════════════════════════════════
  // Download single file
  // ═══════════════════════════════════════════════════════
  const downloadSingle = async (file: StorageFile) => {
    setMessage(null)

    try {
      const res = await fetch(
        `/api/admin/backup/storage/download?id=${file.id}`,
        {
          credentials: 'include',
          headers: authHeaders(),
        }
      )

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(text || `خطا در دانلود (${res.status})`)
      }

      const blob = await res.blob()

      if (blob.size === 0) {
        throw new Error(
          'پاسخ سرور خالی بود. ممکن است دانلود باینری در این محیط کار نکند. برای اطمینان از ZIP استفاده کنید.'
        )
      }

      const outcome = await saveBlobToDisk(blob, file.file_name)

      if (outcome === 'canceled') {
        setMessage({ type: 'error', text: 'دانلود لغو شد.' })
        return
      }

      await fetch('/api/admin/backup/storage/downloaded', {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          ids: [file.id],
          archiveBatchId: `single-${Date.now()}`,
        }),
      }).catch(() => {})

      setMessage({
        type: 'success',
        text: `✅ فایل «${file.file_name}» دانلود شد.`,
      })

      await loadData()
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: '❌ ' + (err?.message || 'خطای ناشناخته'),
      })
    }
  }

  // ═══════════════════════════════════════════════════════
  // Download ZIP
  // ═══════════════════════════════════════════════════════
  const downloadZip = async (all: boolean) => {
    setMessage(null)

    const ids = all ? [] : selectedIds

    if (!all && ids.length === 0) {
      alert('ابتدا حداقل یک فایل را انتخاب کنید.')
      return
    }

    try {
      const batchId = `zip-${Date.now()}`

      const res = await fetch(
        '/api/admin/backup/storage/download-zip?format=json',
        {
          method: 'POST',
          credentials: 'include',
          headers: authHeaders({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(all ? { all: true } : { ids }),
        }
      )

      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'خطا در ساخت ZIP')
      }

      const zipBase64 = data?.data?.zipBase64
      const fileName = data?.data?.fileName || 'runflare-backups.zip'

      if (!zipBase64) {
        throw new Error('پاسخ سرور شامل zipBase64 نبود.')
      }

      const zipBuffer = base64ToArrayBuffer(zipBase64)
      const blob = new Blob([zipBuffer], { type: 'application/zip' })

      const outcome = await saveBlobToDisk(blob, fileName)

      if (outcome === 'canceled') {
        setMessage({ type: 'error', text: 'ذخیره ZIP لغو شد.' })
        return
      }

      await fetch('/api/admin/backup/storage/downloaded', {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(
          all
            ? { all: true, archiveBatchId: batchId }
            : { ids, archiveBatchId: batchId }
        ),
      }).catch(() => {})

      setMessage({
        type: 'success',
        text: `✅ ZIP دانلود شد: ${fileName}`,
      })

      setDeleteDialog({
        open: true,
        ids: all ? [] : ids,
        all,
      })
      setDeleteConfirm('')

      await loadData()
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: '❌ ' + (err?.message || 'خطای ناشناخته'),
      })
    }
  }

  // ═══════════════════════════════════════════════════════
  // Mark downloaded manually
  // ═══════════════════════════════════════════════════════
  const markDownloaded = async (all: boolean) => {
    const ids = all ? [] : selectedIds

    if (!all && ids.length === 0) {
      alert('ابتدا فایل‌ها را انتخاب کنید.')
      return
    }

    try {
      const res = await fetch('/api/admin/backup/storage/downloaded', {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(
          all
            ? { all: true, archiveBatchId: `manual-${Date.now()}` }
            : { ids, archiveBatchId: `manual-${Date.now()}` }
        ),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'خطا در علامت‌گذاری')
      }

      setMessage({
        type: 'success',
        text: '✅ فایل‌ها به‌عنوان دانلودشده علامت‌گذاری شدند.',
      })
      await loadData()
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: '❌ ' + (err?.message || 'خطای ناشناخته'),
      })
    }
  }

  // ═══════════════════════════════════════════════════════
  // Delete files from storage
  // ═══════════════════════════════════════════════════════
  const openDeleteDialog = (ids: string[], all: boolean) => {
    if (!all && ids.length === 0) {
      alert('ابتدا فایل‌ها را انتخاب کنید.')
      return
    }

    setDeleteDialog({ open: true, ids, all })
    setDeleteConfirm('')
  }

  const closeDeleteDialog = () => {
    if (processingDelete) return
    setDeleteDialog({ open: false, ids: [], all: false })
    setDeleteConfirm('')
  }

  const confirmDelete = async () => {
    if (deleteConfirm.trim() !== 'DELETE') {
      alert('برای تأیید حذف، عبارت DELETE را تایپ کنید.')
      return
    }

    setProcessingDelete(true)
    setMessage(null)

    try {
      const res = await fetch('/api/admin/backup/storage/delete', {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          ids: deleteDialog.all ? [] : deleteDialog.ids,
          all: deleteDialog.all,
          confirmText: 'DELETE',
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'خطا در حذف فایل‌ها')
      }

      const result = data.data

      setMessage({
        type: 'success',
        text: `✅ حذف انجام شد. تعداد حذف‌شده: ${toFaNum(
          result.deletedCount
        )} | فضای آزادشده: ${formatSize(result.freedBytes)}`,
      })

      setSelectedIds([])
      closeDeleteDialog()
      await loadData()
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: '❌ ' + (err?.message || 'خطای ناشناخته'),
      })
    } finally {
      setProcessingDelete(false)
    }
  }

  // ═══════════════════════════════════════════════════════
  // Restore from storage file
  // ═══════════════════════════════════════════════════════
  const openRestoreDialog = (file: StorageFile) => {
    setRestoreDialog(file)
    setRestoreConfirm('')
  }

  const closeRestoreDialog = () => {
    if (restoring) return
    setRestoreDialog(null)
    setRestoreConfirm('')
  }

  const confirmRestore = async () => {
    if (!restoreDialog) return

    if (restoreConfirm.trim() !== 'RESTORE') {
      alert('برای تأیید بازیابی، عبارت RESTORE را تایپ کنید.')
      return
    }

    setRestoring(true)
    setMessage(null)

    try {
      const res = await fetch('/api/admin/backup/storage/restore', {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ id: restoreDialog.id }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'خطا در بازیابی')
      }

      const result = data.data

      alert(
        `✅ بازیابی با موفقیت انجام شد!\n\n` +
          `تعداد رکوردهای بازیابی شده: ${toFaNum(result.restoredCount)}\n` +
          `تعداد جداول: ${toFaNum(result.tablesRestored?.length || 0)}\n` +
          `مدت زمان: ${toFaNum((result.duration / 1000).toFixed(1))} ثانیه\n\n` +
          `⚠️ صفحه رفرش می‌شود...`
      )

      closeRestoreDialog()
      window.location.reload()
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: '❌ ' + (err?.message || 'خطای ناشناخته'),
      })
    } finally {
      setRestoring(false)
    }
  }

  // ═══════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════
  if (loading) {
    return (
      <div
        className="flex items-center justify-center py-16"
        style={{ fontFamily: 'Vazirmatn, IRANSans, Shabnam, Tahoma, sans-serif' }}
      >
        <Loader2 className="w-8 h-8 animate-spin text-[#7C7BEB]" />
      </div>
    )
  }

  return (
    <div
      className="space-y-4"
      style={{
        fontFamily: 'Vazirmatn, IRANSans, Shabnam, Tahoma, sans-serif',
      }}
      dir="rtl"
    >
      {/* ═══════ Message ═══════ */}
      {message && (
        <div
          className={`rounded-xl border p-3 flex items-start gap-3 ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 text-sm font-bold">{message.text}</div>
          <button
            onClick={() => setMessage(null)}
            className={
              message.type === 'success'
                ? 'text-emerald-600 hover:text-emerald-800'
                : 'text-red-600 hover:text-red-800'
            }
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ═══════ Schedule Settings ═══════ */}
      {schedule && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#7C7BEB] to-[#5B5AC7] flex items-center justify-center shadow-md">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-black text-gray-900">
                زمان‌بندی بکاپ خودکار
              </h3>
              <p className="text-[11px] text-gray-600 mt-0.5 leading-relaxed">
                بکاپ‌های خودکار روزانه داخل استورج سرور ساخته می‌شوند و بعداً
                می‌توانید آن‌ها را دانلود/آرشیو/حذف کنید.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Enabled */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(schedule.enabled)}
                  onChange={(e) => updateSchedule({ enabled: e.target.checked })}
                  className="w-4 h-4 accent-[#7C7BEB]"
                />
                <span className="text-xs font-bold text-gray-800">
                  فعال کردن بکاپ خودکار
                </span>
              </label>
            </div>

            {/* Time */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <label className="text-[11px] font-bold text-gray-700 mb-1.5 block">
                ساعت اجرا
              </label>
              <input
                type="time"
                value={schedule.schedule_time}
                onChange={(e) => updateSchedule({ schedule_time: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-mono outline-none focus:border-[#7C7BEB]"
                dir="ltr"
              />
            </div>

            {/* Timezone */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <label className="text-[11px] font-bold text-gray-700 mb-1.5 block">
                منطقه زمانی
              </label>
              <select
                value={schedule.timezone}
                onChange={(e) => updateSchedule({ timezone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-[#7C7BEB]"
              >
                <option value="Asia/Tehran">تهران (Asia/Tehran)</option>
                <option value="UTC">UTC</option>
                <option value="Asia/Dubai">دبی (Asia/Dubai)</option>
                <option value="Europe/Istanbul">استانبول (Europe/Istanbul)</option>
              </select>
            </div>

            {/* Retention */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <label className="text-[11px] font-bold text-gray-700 mb-1.5 block">
                نگهداری روی سرور (روز)
              </label>
              <input
                type="number"
                min={1}
                max={30}
                value={schedule.retention_days}
                onChange={(e) =>
                  updateSchedule({ retention_days: Number(e.target.value) })
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-mono outline-none focus:border-[#7C7BEB]"
                dir="ltr"
              />
            </div>

            {/* Max per tenant */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <label className="text-[11px] font-bold text-gray-700 mb-1.5 block">
                حداکثر بکاپ برای هر فروشگاه
              </label>
              <input
                type="number"
                min={1}
                max={30}
                value={schedule.max_backups_per_tenant}
                onChange={(e) =>
                  updateSchedule({
                    max_backups_per_tenant: Number(e.target.value),
                  })
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-mono outline-none focus:border-[#7C7BEB]"
                dir="ltr"
              />
            </div>

            {/* Max full */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <label className="text-[11px] font-bold text-gray-700 mb-1.5 block">
                حداکثر بکاپ کامل
              </label>
              <input
                type="number"
                min={1}
                max={30}
                value={schedule.max_full_backups}
                onChange={(e) =>
                  updateSchedule({ max_full_backups: Number(e.target.value) })
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-mono outline-none focus:border-[#7C7BEB]"
                dir="ltr"
              />
            </div>
          </div>

          {/* Tenant scope */}
          <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-[11px] font-bold text-gray-700 mb-2">
              دامنه بکاپ خودکار
            </p>

            <div className="flex flex-wrap gap-3 mb-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="scope"
                  checked={Boolean(schedule.backup_all_tenants)}
                  onChange={() =>
                    updateSchedule({
                      backup_all_tenants: true,
                      backup_selected_tenants: false,
                    })
                  }
                  className="w-4 h-4 accent-[#7C7BEB]"
                />
                <span className="text-xs font-bold text-gray-800">
                  همه فروشگاه‌های فعال
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="scope"
                  checked={Boolean(schedule.backup_selected_tenants)}
                  onChange={() =>
                    updateSchedule({
                      backup_all_tenants: false,
                      backup_selected_tenants: true,
                    })
                  }
                  className="w-4 h-4 accent-[#7C7BEB]"
                />
                <span className="text-xs font-bold text-gray-800">
                  فقط فروشگاه‌های انتخابی
                </span>
              </label>
            </div>

            {schedule.backup_selected_tenants && (
              <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg bg-white p-2 space-y-1">
                {tenants.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-3">
                    فروشگاهی وجود ندارد
                  </p>
                ) : (
                  tenants.map((tenant) => {
                    const checked =
                      Array.isArray(schedule.selected_tenant_ids) &&
                      schedule.selected_tenant_ids.includes(tenant.id)

                    return (
                      <label
                        key={tenant.id}
                        className="flex items-center gap-2 p-1.5 hover:bg-gray-50 rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTenantSelection(tenant.id)}
                          className="w-4 h-4 accent-[#7C7BEB]"
                        />
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
                      </label>
                    )
                  })
                )}
              </div>
            )}
          </div>

          {/* Last run */}
          <div className="mt-4 bg-indigo-50 border border-indigo-200 rounded-lg p-3">
            <p className="text-[11px] font-black text-indigo-900 mb-2">
              آخرین وضعیت اجرا
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
              <div>
                <span className="text-gray-500">وضعیت:</span>{' '}
                <span className="font-bold text-gray-900">
                  {statusFa(schedule.last_status)}
                </span>
              </div>
              <div>
                <span className="text-gray-500">تاریخ و ساعت اجرا:</span>{' '}
                <span className="font-bold text-gray-900">
                  {formatPersianDateTime(schedule.last_run_at)}
                </span>
              </div>
              <div>
                <span className="text-gray-500">تاریخ تهران:</span>{' '}
                <span className="font-bold text-gray-900">
                  {formatPersianDate(schedule.last_run_date)}
                </span>
              </div>
              <div>
                <span className="text-gray-500">خطا:</span>{' '}
                <span className="font-bold text-red-700">
                  {schedule.last_error || 'ندارد'}
                </span>
              </div>
            </div>

            {schedule.last_summary && (
              <div className="mt-3 bg-white/70 border border-indigo-200 rounded p-3 text-[11px] text-gray-700">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div>
                    <span className="text-gray-500">تاریخ تهران:</span>{' '}
                    <span className="font-bold">
                      {formatPersianDate(schedule.last_summary.tehranDate)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">ساعت تهران:</span>{' '}
                    <span className="font-bold">
                      {toFaNum(schedule.last_summary.tehranTime || '—')}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">فروشگاه‌ها:</span>{' '}
                    <span className="font-bold">
                      {toFaNum(schedule.last_summary.tenantsTotal || 0)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">موفق:</span>{' '}
                    <span className="font-bold text-emerald-700">
                      {toFaNum(schedule.last_summary.successes || 0)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">ناموفق:</span>{' '}
                    <span className="font-bold text-red-700">
                      {toFaNum(schedule.last_summary.failed || 0)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">حذف منقضی:</span>{' '}
                    <span className="font-bold">
                      {toFaNum(schedule.last_summary.deletedExpired || 0)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">حذف سقف فروشگاه:</span>{' '}
                    <span className="font-bold">
                      {toFaNum(schedule.last_summary.deletedPerTenantLimit || 0)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">حذف سقف کامل:</span>{' '}
                    <span className="font-bold">
                      {toFaNum(schedule.last_summary.deletedFullLimit || 0)}
                    </span>
                  </div>
                </div>

                {Array.isArray(schedule.last_summary.errors) &&
                  schedule.last_summary.errors.length > 0 && (
                    <div className="mt-3 border-t border-indigo-200 pt-2">
                      <p className="font-black text-red-700 mb-1">خطاها:</p>
                      <ul className="space-y-1">
                        {schedule.last_summary.errors.map((err: any, idx: number) => (
                          <li key={idx} className="text-[10px] text-red-800">
                            {err.tenantName || err.tenantId}: {err.error}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={saveSchedule}
              disabled={saving}
              className="px-4 py-2.5 bg-[#7C7BEB] hover:bg-[#5B5AC7] text-white rounded-lg text-xs font-bold flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Database className="w-4 h-4" />
              )}
              ذخیره تنظیمات
            </button>

            <button
              onClick={runNow}
              disabled={running}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-2 disabled:opacity-50"
            >
              {running ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              اجرای دستی همین حالا
            </button>

            <button
              onClick={loadData}
              className="px-4 py-2.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-lg text-xs font-bold flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              تازه‌سازی
            </button>
          </div>
        </div>
      )}

      {/* ═══════ Storage Summary ═══════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#7C7BEB] to-[#5B5AC7] flex items-center justify-center">
              <FileArchive className="w-4 h-4 text-white" />
            </div>
            <p className="text-[10px] text-gray-500 font-medium">
              تعداد فایل‌ها
            </p>
          </div>
          <p className="text-2xl font-black text-gray-900" dir="ltr">
            {toFaNum(summary?.count || 0)}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <HardDrive className="w-4 h-4 text-white" />
            </div>
            <p className="text-[10px] text-gray-500 font-medium">
              حجم فشرده کل
            </p>
          </div>
          <p className="text-2xl font-black text-gray-900" dir="ltr">
            {formatSize(summary?.totalCompressed || 0)}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <Database className="w-4 h-4 text-white" />
            </div>
            <p className="text-[10px] text-gray-500 font-medium">
              حجم اصلی کل
            </p>
          </div>
          <p className="text-2xl font-black text-gray-900" dir="ltr">
            {formatSize(summary?.totalOriginal || 0)}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-white" />
            </div>
            <p className="text-[10px] text-gray-500 font-medium">
              منقضی‌شده
            </p>
          </div>
          <p className="text-2xl font-black text-gray-900" dir="ltr">
            {toFaNum(summary?.expiredCount || 0)}
          </p>
        </div>
      </div>

      {/* ═══════ Storage Files ═══════ */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-3 border-b border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
            <FileArchive className="w-4 h-4 text-gray-500" />
            فایل‌های موجود در استورج سرور
            <span className="text-[10px] font-bold text-[#7C7BEB] bg-purple-50 px-2 py-0.5 rounded-full">
              {toFaNum(files.length)}
            </span>
          </h3>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => downloadZip(false)}
              disabled={selectedIds.length === 0}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1.5 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              دانلود ZIP انتخابی
            </button>

            <button
              onClick={() => downloadZip(true)}
              disabled={files.length === 0}
              className="px-3 py-2 bg-[#7C7BEB] hover:bg-[#5B5AC7] text-white rounded-lg text-[11px] font-bold flex items-center gap-1.5 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              دانلود ZIP همه
            </button>

            <button
              onClick={() => markDownloaded(false)}
              disabled={selectedIds.length === 0}
              className="px-3 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-lg text-[11px] font-bold flex items-center gap-1.5 disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              علامت‌گذاری انتخابی
            </button>

            <button
              onClick={() => openDeleteDialog(selectedIds, false)}
              disabled={selectedIds.length === 0}
              className="px-3 py-2 bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded-lg text-[11px] font-bold flex items-center gap-1.5 disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              حذف انتخابی
            </button>

            <button
              onClick={() => openDeleteDialog([], true)}
              disabled={files.length === 0}
              className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1.5 disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              حذف همه
            </button>
          </div>
        </div>

        <div className="divide-y divide-gray-50">
          {files.length === 0 ? (
            <div className="p-8 text-center">
              <FileArchive className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-xs text-gray-500">
                هنوز فایل بکاپی در استورج سرور وجود ندارد
              </p>
            </div>
          ) : (
            <>
              {/* Header row */}
              <div className="p-3 bg-gray-50/70 flex items-center gap-3 text-[10px] font-bold text-gray-600">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 accent-[#7C7BEB]"
                />
                <div className="flex-1 min-w-0">فایل / فروشگاه</div>
                <div className="w-36 hidden md:block">تاریخ ساخت</div>
                <div className="w-28 hidden md:block">حجم فشرده</div>
                <div className="w-36 hidden md:block">انقضا</div>
                <div className="w-28 hidden md:block">وضعیت</div>
                <div className="w-28 text-left">عملیات</div>
              </div>

              {files.map((file) => {
                const isSelected = selectedIds.includes(file.id)
                const isExpired =
                  file.expires_at && new Date(file.expires_at) < new Date()
                const isDownloaded = Boolean(file.downloaded_at)

                return (
                  <div
                    key={file.id}
                    className="p-3 hover:bg-gray-50/50 transition-colors flex items-center gap-3"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(file.id)}
                      className="w-4 h-4 accent-[#7C7BEB]"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-bold text-gray-800 truncate">
                          {file.tenant_name || 'بدون نام'}
                        </p>

                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                            file.type === 'full_database'
                              ? 'bg-amber-100 text-amber-700 border border-amber-200'
                              : 'bg-purple-100 text-purple-700 border border-purple-200'
                          }`}
                        >
                          {file.type === 'full_database' ? 'کامل' : 'فروشگاه'}
                        </span>

                        {isDownloaded && (
                          <span
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200"
                            title={`دانلود شده در: ${formatPersianDateTime(
                              file.downloaded_at
                            )}`}
                          >
                            دانلود شده
                          </span>
                        )}

                        {isExpired && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">
                            منقضی
                          </span>
                        )}

                        {!file.exists && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200">
                            فایل موجود نیست
                          </span>
                        )}
                      </div>

                      <p
                        className="text-[10px] text-gray-500 font-mono mt-0.5 truncate"
                        dir="ltr"
                      >
                        {file.file_name}
                      </p>

                      <p
                        className="text-[9px] text-gray-400 font-mono mt-0.5 truncate"
                        dir="ltr"
                      >
                        {file.storage_path || '—'}
                      </p>
                    </div>

                    <div className="w-36 hidden md:block text-[10px] text-gray-600">
                      {formatPersianDateTime(file.created_at)}
                    </div>

                    <div className="w-28 hidden md:block text-[10px] text-gray-600" dir="ltr">
                      {formatSize(file.size_compressed || file.file_size)}
                    </div>

                    <div className="w-36 hidden md:block text-[10px] text-gray-600">
                      {formatPersianDateTime(file.expires_at)}
                    </div>

                    <div className="w-28 hidden md:block">
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          file.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-100 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {fileStatusFa(file.status)}
                      </span>
                    </div>

                    <div className="w-28 flex items-center justify-end gap-1 shrink-0">
                      <button
                        onClick={() => downloadSingle(file)}
                        disabled={!file.exists}
                        className="w-8 h-8 rounded-lg text-emerald-600 hover:text-white bg-emerald-50 hover:bg-emerald-600 flex items-center justify-center transition disabled:opacity-40 disabled:cursor-not-allowed"
                        title="دانلود تک‌فایل"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => openRestoreDialog(file)}
                        disabled={!file.exists}
                        className="w-8 h-8 rounded-lg text-amber-600 hover:text-white bg-amber-50 hover:bg-amber-600 flex items-center justify-center transition disabled:opacity-40 disabled:cursor-not-allowed"
                        title="بازیابی از این فایل"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => openDeleteDialog([file.id], false)}
                        className="w-8 h-8 rounded-lg text-red-500 hover:text-white bg-red-50 hover:bg-red-600 flex items-center justify-center transition"
                        title="حذف این فایل"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>
      </div>

      {/* ═══════ Info Box ═══════ */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-[11px] text-blue-900 leading-relaxed">
          <strong className="block mb-1">نکات مهم</strong>
          <ul className="space-y-0.5 text-blue-800">
            <li>
              • بکاپ خودکار روزانه به‌صورت فایل gzip داخل استورج سرور ذخیره می‌شود.
            </li>
            <li>
              • محتوای بکاپ داخل دیتابیس ذخیره نمی‌شود؛ فقط متادیتا در جدول
              admin_backups می‌ماند.
            </li>
            <li>
              • بعد از دانلود ZIP، می‌توانید فایل‌های دانلودشده را از استورج سرور
              حذف کنید تا فضا آزاد شود.
            </li>
            <li>
              • برای بازیابی سریع، می‌توانید مستقیم از فایل موجود در استورج سرور
              restore بگیرید.
            </li>
            <li>
              • در محیط لوکال، دانلود ZIP از مسیر JSON/base64 انجام می‌شود تا با
              Turbopack سازگار باشد.
            </li>
          </ul>
        </div>
      </div>

      {/* ═══════ Delete Dialog ═══════ */}
      {deleteDialog.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={closeDeleteDialog}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            style={{
              fontFamily: 'Vazirmatn, IRANSans, Shabnam, Tahoma, sans-serif',
            }}
            dir="rtl"
          >
            <div className="bg-gradient-to-l from-red-500 to-rose-600 px-4 py-3 text-white">
              <div className="flex items-center gap-2">
                <Trash2 className="w-5 h-5" />
                <h3 className="text-sm font-black">حذف فایل‌های بکاپ از استورج</h3>
              </div>
            </div>

            <div className="p-4 space-y-3">
              <div className="bg-red-50 border-2 border-red-300 rounded-lg p-3">
                <div className="flex gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-red-800 leading-relaxed">
                    <strong className="font-black block mb-1">⚠️ هشدار!</strong>
                    این عمل فایل‌های واقعی بکاپ را از استورج سرور حذف می‌کند.
                    مطمئن شوید فایل‌ها با موفقیت روی سیستم شما ذخیره شده‌اند.
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 text-[11px] text-gray-700">
                <p>
                  <strong>هدف حذف:</strong>{' '}
                  {deleteDialog.all
                    ? 'همه فایل‌های موجود در استورج'
                    : `${toFaNum(deleteDialog.ids.length)} فایل انتخابی`}
                </p>
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-700 mb-1.5 block">
                  برای تأیید، عبارت{' '}
                  <span className="text-red-600">DELETE</span> را تایپ کنید:
                </label>
                <input
                  type="text"
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder="DELETE"
                  disabled={processingDelete}
                  className="w-full px-3 py-2 border-2 border-red-200 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition text-xs font-mono disabled:opacity-50"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="px-4 pb-4 flex gap-2">
              <button
                onClick={closeDeleteDialog}
                disabled={processingDelete}
                className="flex-1 px-3 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-all text-xs font-bold disabled:opacity-50"
              >
                انصراف
              </button>
              <button
                onClick={confirmDelete}
                disabled={processingDelete || deleteConfirm.trim() !== 'DELETE'}
                className="flex-1 px-3 py-2.5 bg-gradient-to-l from-red-600 to-red-700 text-white rounded-lg hover:shadow-lg transition-all text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                {processingDelete ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>در حال حذف...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>بله، حذف کن</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ Restore Dialog ═══════ */}
      {restoreDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={closeRestoreDialog}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            style={{
              fontFamily: 'Vazirmatn, IRANSans, Shabnam, Tahoma, sans-serif',
            }}
            dir="rtl"
          >
            <div className="bg-gradient-to-l from-amber-500 to-orange-600 px-4 py-3 text-white">
              <div className="flex items-center gap-2">
                <RefreshCw className={`w-5 h-5 ${restoring ? 'animate-spin' : ''}`} />
                <h3 className="text-sm font-black">بازیابی از فایل استورج</h3>
              </div>
            </div>

            <div className="p-4 space-y-3">
              <div className="bg-red-50 border-2 border-red-300 rounded-lg p-3">
                <div className="flex gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-red-800 leading-relaxed">
                    <strong className="font-black block mb-1">⚠️ هشدار جدی!</strong>
                    این عمل <strong>غیرقابل بازگشت</strong> است. داده‌های فعلی همان
                    فروشگاه حذف شده و داده‌های این بکاپ جایگزین می‌شوند.
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="text-[10px] text-gray-500 mb-2">فایل بازیابی:</p>
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#7C7BEB] to-[#5B5AC7] flex items-center justify-center text-white shrink-0">
                    <Store className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-900 truncate">
                      {restoreDialog.tenant_name || 'فروشگاه نامشخص'}
                    </p>
                    <p
                      className="text-[10px] text-gray-500 font-mono truncate"
                      dir="ltr"
                    >
                      {restoreDialog.file_name}
                    </p>
                    <p className="text-[10px] text-gray-500 mt-1">
                      تاریخ بکاپ: {formatPersianDateTime(restoreDialog.created_at)}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-700 mb-1.5 block">
                  برای تأیید، عبارت{' '}
                  <span className="text-red-600">RESTORE</span> را تایپ کنید:
                </label>
                <input
                  type="text"
                  value={restoreConfirm}
                  onChange={(e) => setRestoreConfirm(e.target.value)}
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
                onClick={confirmRestore}
                disabled={restoring || restoreConfirm.trim() !== 'RESTORE'}
                className="flex-1 px-3 py-2.5 bg-gradient-to-l from-red-600 to-red-700 text-white rounded-lg hover:shadow-lg transition-all text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                {restoring ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>در حال بازیابی...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
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