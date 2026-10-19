'use client'

// ============================================================================
// src/app/admin/settings/backup-tab.tsx
// ★ v2.1 — بکاپ دستی فایل‌محور + بازیابی از فایل
// ----------------------------------------------------------------------------
// - بکاپ فروشگاه از API /api/admin/backup/create گرفته می‌شود
// - فایل JSON روی سیستم کاربر ذخیره می‌شود
// - فقط متادیتا در admin_backups می‌ماند (storage_type = client)
// - بازیابی از فایل انتخابی از سیستم با /api/admin/backup/restore-upload
// - برای بکاپ‌های client، دکمه بازیابی پنجره انتخاب فایل را باز می‌کند
// - بکاپ کامل/گروهی موقتاً غیرفعال است چون رانفلر بکاپ کامل بانک را دارد
// ============================================================================

import { useState, useEffect, useMemo, useRef, type ChangeEvent } from 'react'
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
  Search,
  XCircle,
  Info,
  RefreshCw,
  Upload,
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
            description: 'Backup JSON File',
            accept: {
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
// Main Component
// ═══════════════════════════════════════════════════════════

export function AdminBackupTab() {
  const [backups, setBackups] = useState<any[]>([])
  const [tenants, setTenants] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<any>(null)

  // ─── Delete Dialog ───
  const [confirmDialog, setConfirmDialog] = useState<{
    type: 'delete'
    item: any
  } | null>(null)
  const [processing, setProcessing] = useState(false)

  // ─── Restore Dialog ───
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false)
  const [restoreBackupId, setRestoreBackupId] = useState<string | null>(null)
  const [restoreConfirmText, setRestoreConfirmText] = useState('')
  const [restoring, setRestoring] = useState(false)

  const restoreFileInputRef = useRef<HTMLInputElement>(null)
  const [restoreFile, setRestoreFile] = useState<File | null>(null)
  const [restoreFileInfo, setRestoreFileInfo] = useState<any>(null)
  const [readingRestoreFile, setReadingRestoreFile] = useState(false)
  const [restoreFileExpectedTenant, setRestoreFileExpectedTenant] = useState<{
    id: string | null
    name: string | null
  } | null>(null)

  // ─── Filters ──
  const [filterType, setFilterType] = useState<'all' | 'tenant' | 'full_database'>('all')
  const [searchTerm, setSearchTerm] = useState('')

  // ═══════════════════════════════════════════════════════
  // Utility: detect client backup
  // ═══════════════════════════════════════════════════════
  const isClientBackupRecord = (backup: any): boolean => {
    if (!backup) return false

    return (
      backup.storage_type === 'client' ||
      backup.storageType === 'client' ||
      backup.data_is_null === true
    )
  }

  // ═══════════════════════════════════════════════════════
  // Load data
  // ═══════════════════════════════════════════════════════
  const loadData = async () => {
    try {
      const [backupRes, tenantRes] = await Promise.all([
        fetch('/api/admin/backup', {
          credentials: 'include',
          headers: authHeaders(),
        }),
        fetch('/api/admin/tenants', {
          credentials: 'include',
          headers: authHeaders(),
        }),
      ])

      const backupData = backupRes.ok
        ? await backupRes.json().catch(() => ({}))
        : { success: false }

      const tenantData = tenantRes.ok
        ? await tenantRes.json().catch(() => ({}))
        : { success: false }

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
  // Create tenant backup as client file
  // ═══════════════════════════════════════════════════════
  const handleCreateTenantBackup = async (tenant: any) => {
    const key = `tenant:${tenant.id}`
    setCreating(key)
    setLastResult(null)

    const startTime = Date.now()

    try {
      const res = await fetch('/api/admin/backup/create', {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          tenantId: tenant.id,
          createdBy: 'admin',
        }),
      })

      if (!res.ok) {
        let message = 'خطا در ساخت بکاپ'

        try {
          const errJson = await res.json()
          message = errJson.error || message
        } catch {
          try {
            message = (await res.text()) || message
          } catch {
            // ignore
          }
        }

        throw new Error(message)
      }

      const contentType = res.headers.get('content-type') || ''
      const contentDisposition = res.headers.get('content-disposition') || ''

      const isFileResponse =
        contentDisposition.includes('attachment') ||
        !!res.headers.get('X-Backup-File-Name') ||
        !!res.headers.get('X-Backup-Record-Count')

      if (contentType.includes('application/json') && !isFileResponse) {
        const text = await res.text()

        let parsed: any = {}
        try {
          parsed = JSON.parse(text)
        } catch {
          // not JSON
        }

        console.error('[Backup API] unexpected JSON response:', res.status, text)

        throw new Error(
          parsed.error ||
            parsed.message ||
            text.slice(0, 300) ||
            'پاسخ غیرمنتظره از سرور'
        )
      }

      const blob = await res.blob()

      let fileName = `tenant-${tenant.subDomain || tenant.id}-${new Date()
        .toISOString()
        .slice(0, 16)
        .replace(/[:T]/g, '-')}.json`

      const headerFileName = res.headers.get('X-Backup-File-Name')
      if (headerFileName) {
        try {
          fileName = decodeURIComponent(headerFileName)
        } catch {
          fileName = headerFileName
        }
      }

      const outcome = await saveBlobToDisk(blob, fileName)

      if (outcome === 'canceled') {
        setLastResult(null)
        return
      }

      setLastResult({
        type: 'tenant',
        tenantName: tenant.companyName,
        fileName,
        fileSize: blob.size,
        recordCount: Number(res.headers.get('X-Backup-Record-Count') || 0),
        duration: Date.now() - startTime,
        storage: 'client',
      })

      await loadData()
    } catch (err: any) {
      alert('خطا: ' + (err?.message || 'نامشخص'))
    } finally {
      setCreating(null)
    }
  }

  // ═══════════════════════════════════════════════════════
  // Restore from selected file
  // ═══════════════════════════════════════════════════════
  const openRestoreFilePicker = () => {
    setRestoreFileExpectedTenant(null)
    restoreFileInputRef.current?.click()
  }

  const openRestoreFilePickerForTenant = (backup: any) => {
    setRestoreFileExpectedTenant({
      id: backup.tenant_id ? String(backup.tenant_id) : null,
      name: backup.tenant_name || null,
    })

    restoreFileInputRef.current?.click()
  }

  const handleDownload = async (id: string, fileName: string) => {
    try {
      const res = await fetch(`/api/admin/backup/download?id=${id}`, {
        credentials: 'include',
        headers: authHeaders(),
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

  const handleRestoreFileSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setReadingRestoreFile(true)

    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const meta = parsed._meta || {}

      if (meta.type !== 'tenant') {
        alert('فعلاً فقط فایل بکاپ تک‌فروشگاهی پشتیبانی می‌شود.')
        return
      }

      if (meta.version !== '2.0' || meta.scoped !== true) {
        alert('این فایل بکاپ قدیمی است و برای بازیابی امن تک‌فروشگاهی قابل استفاده نیست.')
        return
      }

      const fileTenantId = meta.tenantId ? String(meta.tenantId) : null

      if (
        restoreFileExpectedTenant?.id &&
        fileTenantId &&
        fileTenantId !== restoreFileExpectedTenant.id
      ) {
        alert(
          `این فایل مربوط به فروشگاه دیگری است.\n\n` +
            `فروشگاه مورد انتظار: ${restoreFileExpectedTenant.name || restoreFileExpectedTenant.id}\n` +
            `فروشگاه داخل فایل: ${meta.tenantName || fileTenantId}`
        )
        return
      }

      setRestoreFile(file)
      setRestoreFileInfo({
        ...meta,
        expectedTenantName: restoreFileExpectedTenant?.name || meta.tenantName,
      })
      setRestoreBackupId(null)
      setRestoreConfirmText('')
      setRestoreDialogOpen(true)
    } catch (err: any) {
      console.error(err)
      alert('فایل انتخاب شده یک بکاپ JSON معتبر نیست.')
    } finally {
      setReadingRestoreFile(false)

      // reset input so selecting same file again triggers change
      if (restoreFileInputRef.current) {
        restoreFileInputRef.current.value = ''
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  // Delete backup metadata
  // ═══════════════════════════════════════════════════════
  const handleDelete = async () => {
    if (!confirmDialog || confirmDialog.type !== 'delete') return

    setProcessing(true)

    try {
      const res = await fetch(`/api/admin/backup?id=${confirmDialog.item.id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: authHeaders(),
      })

      const data = await res.json().catch(() => ({}))

      if (res.ok && data.success) {
        setConfirmDialog(null)
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
  // Open restore dialog for DB backup only
  // ═══════════════════════════════════════════════════════
  const openRestoreDialog = (backupId: string) => {
    const item = backups.find((b) => b.id === backupId)

    // ★ Safety guard: if this is a client backup, never open DB restore dialog.
    if (item && isClientBackupRecord(item)) {
      openRestoreFilePickerForTenant(item)
      return
    }

    setRestoreBackupId(backupId)
    setRestoreFile(null)
    setRestoreFileInfo(null)
    setRestoreConfirmText('')
    setRestoreDialogOpen(true)
  }

  const closeRestoreDialog = () => {
    if (restoring) return
    setRestoreDialogOpen(false)
    setRestoreBackupId(null)
    setRestoreFile(null)
    setRestoreFileInfo(null)
    setRestoreConfirmText('')
    setRestoreFileExpectedTenant(null)
  }

  // ═══════════════════════════════════════════════════════
  // Restore action
  // ═══════════════════════════════════════════════════════
  const handleRestore = async () => {
    if (!restoreFile && !restoreBackupId) {
      alert('ابتدا فایل بکاپ را انتخاب کنید.')
      return
    }

    if (restoreConfirmText.trim() !== 'RESTORE') {
      alert('لطفاً عبارت RESTORE را به درستی تایپ کنید')
      return
    }

    // ★ Extra safety guard:
    // If user somehow opened DB restore dialog for a client backup,
    // redirect to file picker instead of calling old restore API.
    if (restoreBackupId && !restoreFile) {
      const item = backups.find((b) => b.id === restoreBackupId)

      if (item && isClientBackupRecord(item)) {
        closeRestoreDialog()
        openRestoreFilePickerForTenant(item)
        return
      }
    }

    setRestoring(true)

    try {
      if (restoreFile) {
        const formData = new FormData()
        formData.append('file', restoreFile)

        const res = await fetch('/api/admin/backup/restore-upload', {
          method: 'POST',
          credentials: 'include',
          headers: authHeaders(),
          body: formData,
        })

        const data = await res.json().catch(() => ({}))

        if (!res.ok || !data.success) {
          throw new Error(data.error || 'خطا در بازیابی بکاپ')
        }

        alert(
          `✅ بازیابی با موفقیت انجام شد!\n\n` +
            `تعداد رکوردهای بازیابی شده: ${toFaNum(data.data.restoredCount)}\n` +
            `تعداد جداول: ${toFaNum(data.data.tablesRestored.length)}\n` +
            `مدت زمان: ${toFaNum((data.data.duration / 1000).toFixed(1))} ثانیه\n\n` +
            `⚠️ صفحه رفرش می‌شود...`
        )

        closeRestoreDialog()
        window.location.reload()
        return
      }

      if (restoreBackupId) {
        const res = await fetch('/api/admin/backup', {
          method: 'POST',
          credentials: 'include',
          headers: authHeaders({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            action: 'restore',
            backupId: restoreBackupId,
          }),
        })

        const data = await res.json().catch(() => ({}))

        if (!res.ok || !data.success) {
          throw new Error(data.error || 'خطا در بازیابی بکاپ')
        }

        alert(
          `✅ بازیابی با موفقیت انجام شد!\n\n` +
            `تعداد رکوردهای بازیابی شده: ${toFaNum(data.data.restoredCount)}\n` +
            `تعداد جداول: ${toFaNum(data.data.tablesRestored.length)}\n` +
            `مدت زمان: ${toFaNum((data.data.duration / 1000).toFixed(1))} ثانیه\n\n` +
            `⚠️ صفحه رفرش می‌شود...`
        )

        closeRestoreDialog()
        window.location.reload()
      }
    } catch (err: any) {
      alert('خطا: ' + (err?.message || 'نامشخص'))
    } finally {
      setRestoring(false)
    }
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

  const hasRestoreTarget = !!restoreFile || !!restoreBackupItem

  return (
    <div className="space-y-4">
      {/* ═══════ Success Alert ═══════ */}
      {lastResult && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-emerald-900">
              {lastResult.storage === 'client'
                ? `✅ فایل بکاپ «${lastResult.tenantName}» روی سیستم شما ذخیره شد`
                : `✅ بکاپ فروشگاه «${lastResult.tenantName}» ایجاد شد`}
            </p>
            <p className="text-xs text-emerald-700 mt-0.5">
              حجم: <span className="font-bold">{formatSize(lastResult.fileSize)}</span>
              {' • '}
              رکوردها: <span className="font-bold">{toFaNum(lastResult.recordCount)}</span>
              {' • '}
              مدت: <span className="font-bold">{toFaNum((lastResult.duration / 1000).toFixed(1))} ثانیه</span>
            </p>
            {lastResult.fileName && (
              <p className="text-[10px] text-emerald-700 mt-1 font-mono" dir="ltr">
                {lastResult.fileName}
              </p>
            )}
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
            <p className="text-[10px] text-gray-500 font-medium">کل بکاپ‌ها</p>
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
            <p className="text-[10px] text-gray-500 font-medium">بکاپ فروشگاه</p>
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
            <p className="text-[10px] text-gray-500 font-medium">بکاپ کامل</p>
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

      {/* ═══════ Important Notice ═══════ */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
        <div className="text-[11px] text-indigo-900 leading-relaxed">
          <strong className="block mb-1">حالت جدید بکاپ دستی</strong>
          <ul className="space-y-0.5 text-indigo-800">
            <li>• بکاپ فروشگاه الآن به‌صورت فایل JSON روی سیستم شما ذخیره می‌شود.</li>
            <li>• فقط نام و اطلاعات سبک بکاپ در دیتابیس می‌ماند؛ محتوای بکاپ داخل دیتابیس ذخیره نمی‌شود.</li>
            <li>• برای بازیابی، فایل بکاپ را از سیستم خود انتخاب کنید.</li>
            <li>• بکاپ کامل دیتابیس و بکاپ گروهی موقتاً غیرفعال است، چون رانفلر خودش بکاپ کامل بانک را نگه می‌دارد.</li>
          </ul>
        </div>
      </div>

      {/* ═══════ Two Main Actions ═══════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Restore From File */}
        <div className="bg-white border-2 border-emerald-200 rounded-xl p-4">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md">
              <Upload className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-black text-gray-900">بازیابی از فایل بکاپ</h3>
              <p className="text-[11px] text-gray-600 mt-0.5 leading-relaxed">
                فایل JSON بکاپ فروشگاهی را از سیستم خود انتخاب کنید تا داده‌های همان فروشگاه بازیابی شود.
              </p>
            </div>
          </div>

          <button
            onClick={openRestoreFilePicker}
            disabled={readingRestoreFile}
            className="w-full px-4 py-2.5 bg-gradient-to-l from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-md hover:shadow-lg"
          >
            {readingRestoreFile ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                در حال خواندن فایل...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                انتخاب فایل بکاپ برای بازیابی
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
              <h3 className="text-sm font-black text-gray-900">بکاپ فروشگاه خاص</h3>
              <p className="text-[11px] text-gray-600 mt-0.5 leading-relaxed">
                فایل بکاپ فقط داده‌های یک فروشگاه مشخص را روی سیستم شما ذخیره می‌کند.
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
                      disabled={creating !== null}
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
              <p className="text-xs text-gray-500">هنوز بکاپی ایجاد نشده است</p>
            </div>
          ) : (
            filteredBackups.map((backup) => {
              const isClientBackup = isClientBackupRecord(backup)

              return (
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

                      {isClientBackup && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 border border-sky-200">
                          روی سیستم
                        </span>
                      )}
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
                    {isClientBackup ? (
                      <button
                        disabled
                        title="این بکاپ روی سیستم شما ذخیره شده و محتوایش در دیتابیس نیست"
                        className="w-8 h-8 rounded-lg text-gray-300 bg-gray-50 cursor-not-allowed flex items-center justify-center"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleDownload(backup.id, backup.file_name)}
                        className="w-8 h-8 rounded-lg text-emerald-600 hover:text-white bg-emerald-50 hover:bg-emerald-600 flex items-center justify-center transition"
                        title="دانلود فایل بکاپ"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <button
                      onClick={() => {
                        if (isClientBackup) {
                          openRestoreFilePickerForTenant(backup)
                        } else {
                          openRestoreDialog(backup.id)
                        }
                      }}
                      className="w-8 h-8 rounded-lg text-amber-600 hover:text-white bg-amber-50 hover:bg-amber-600 flex items-center justify-center transition"
                      title={
                        isClientBackup
                          ? 'انتخاب فایل بکاپ این فروشگاه برای بازیابی'
                          : 'بازیابی داده‌ها از این بکاپ'
                      }
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => setConfirmDialog({ type: 'delete', item: backup })}
                      className="w-8 h-8 rounded-lg text-red-500 hover:text-white bg-red-50 hover:bg-red-600 flex items-center justify-center transition"
                      title="حذف رکورد بکاپ"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ═══════ Hidden File Input ═══════ */}
      <input
        ref={restoreFileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleRestoreFileSelected}
      />

      {/* ═══════ Delete Confirmation Dialog ═══════ */}
      {confirmDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => !processing && setConfirmDialog(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-l from-red-500 to-rose-600 px-4 py-3 text-white">
              <div className="flex items-center gap-2">
                <Trash2 className="w-5 h-5" />
                <h3 className="text-sm font-black">حذف رکورد بکاپ</h3>
              </div>
            </div>

            <div className="p-4 space-y-3">
              <p className="text-xs text-gray-700 leading-relaxed">
                آیا از حذف رکورد{' '}
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
                {isClientBackupRecord(confirmDialog.item) && (
                  <p className="text-[10px] text-sky-700 mt-1">
                    این رکورد فقط متادیتا است؛ فایل اصلی روی سیستم شما ذخیره شده است.
                  </p>
                )}
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
                    حذف رکورد
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ Restore Confirmation Dialog ═══════ */}
      {restoreDialogOpen && hasRestoreTarget && (
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
                <RefreshCw className={`w-5 h-5 ${restoring ? 'animate-spin' : ''}`} />
                <h3 className="text-sm font-black">بازیابی از بکاپ</h3>
              </div>
            </div>

            <div className="p-4 space-y-3">
              <div className="bg-red-50 border-2 border-red-300 rounded-lg p-3">
                <div className="flex gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-red-800 leading-relaxed">
                    <strong className="font-black block mb-1">⚠️ هشدار جدی!</strong>
                    این عمل <strong>غیرقابل بازگشت</strong> است. داده‌های فعلی همان فروشگاه حذف شده و داده‌های بکاپ جایگزین می‌شوند.
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="text-[10px] text-gray-500 mb-2">منبع بازیابی:</p>

                {restoreFile ? (
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shrink-0">
                      <Upload className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-900 truncate">
                        {restoreFileInfo?.expectedTenantName || restoreFileInfo?.tenantName || 'فروشگاه نامشخص'}
                      </p>
                      <p className="text-[10px] text-gray-500 font-mono truncate" dir="ltr">
                        {restoreFile.name}
                      </p>
                      {restoreFileInfo?.createdAt && (
                        <p className="text-[10px] text-gray-500 mt-1">
                          تاریخ بکاپ: {formatDate(restoreFileInfo.createdAt)}
                        </p>
                      )}
                    </div>
                  </div>
                ) : restoreBackupItem ? (
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
                        {restoreBackupItem.tenant_name || 'بکاپ کامل دیتابیس'}
                      </p>
                      <p className="text-[10px] text-gray-500 font-mono truncate" dir="ltr">
                        {restoreBackupItem.file_name}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-700 mb-1.5 block">
                  برای تأیید، عبارت <span className="text-red-600">RESTORE</span> را تایپ کنید:
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
                disabled={restoring || restoreConfirmText.trim() !== 'RESTORE'}
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