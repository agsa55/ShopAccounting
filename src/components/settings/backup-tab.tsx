'use client'

// ============================================================================
// src/components/settings/backup-tab.tsx
// ShopAccounting — تب پشتیبان‌گیری
// ★ v11.9.1: لاگ‌های سیستمی اضافه شد
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'
import type { BackupInfo } from '@/lib/tenant-utils'
import { logger } from '@/lib/system-logger'
import {
  Database, FileArchive, Loader2, CheckCircle2, Download, RefreshCw,
  Trash2, AlertTriangle,
} from 'lucide-react'

export function BackupTab() {
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [lastBackupResult, setLastBackupResult] = useState<any>(null)
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false)
  const [selectedBackupId, setSelectedBackupId] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteBackupId, setDeleteBackupId] = useState<string | null>(null)

  const fetchBackups = useCallback(async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/backup', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success && data.data) {
        setBackups(data.data)
      } else {
        setBackups([])
      }
    } catch {
      setBackups([])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchBackups()
  }, [fetchBackups])

  const handleCreateBackup = async () => {
    setCreating(true)
    setLastBackupResult(null)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (data.success) {
        // ★ v11.9.1: لاگ ایجاد پشتیبان جدید
        logger.info('پشتیبان جدید ایجاد شد', {
          backupId: data.data?.id || null,
          fileName: data.data?.fileName || null,
          fileSize: data.data?.fileSize || 0,
          fileSizeFormatted: formatSize(data.data?.fileSize || 0),
          recordCount: data.data?.recordCount || 0,
          duration: data.data?.duration || null,
          totalBackups: backups.length + 1,
        })

        setLastBackupResult(data.data)
        fetchBackups()
      } else {
        // ★ v11.9.1: لاگ خطای ایجاد پشتیبان
        logger.error('خطا در ایجاد پشتیبان', undefined, {
          error: data.error,
        })

        alert(data.error || 'خطا در ایجاد پشتیبان')
      }
    } catch (err: any) {
      // ★ v11.9.1: لاگ خطای شبکه در ایجاد پشتیبان
      logger.error('خطای شبکه در ایجاد پشتیبان', err)

      alert('خطا در ارتباط با سرور')
    }
    setCreating(false)
  }

  const handleDownloadBackup = async (backupId: string, fileName: string) => {
    const backupInfo = backups.find(b => b.id === backupId)
    
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/backup/download?id=${backupId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) {
        // ★ v11.9.1: لاگ خطای دانلود پشتیبان
        logger.error('خطا در دانلود پشتیبان', undefined, {
          backupId: backupId,
          fileName: fileName,
          httpStatus: res.status,
        })

        alert('خطا در دانلود پشتیبان')
        return
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      
      // ★ v11.9.1: لاگ دانلود موفق پشتیبان
      logger.info('فایل پشتیبان دانلود شد', {
        backupId: backupId,
        fileName: fileName,
        fileSize: backupInfo?.fileSize || blob.size,
        fileSizeFormatted: formatSize(backupInfo?.fileSize || blob.size),
        recordCount: backupInfo?.recordCount || null,
        createdAt: backupInfo?.createdAt || null,
      })
    } catch (err: any) {
      // ★ v11.9.1: لاگ خطای شبکه در دانلود
      logger.error('خطای شبکه در دانلود پشتیبان', err, {
        backupId: backupId,
        fileName: fileName,
      })

      alert('خطا در دانلود پشتیبان')
    }
  }

  const handleRestore = async () => {
    if (!selectedBackupId) return
    
    const backupToRestore = backups.find(b => b.id === selectedBackupId)
    
    setRestoring(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ backupId: selectedBackupId }),
      })
      const data = await res.json()
      if (data.success) {
        // ★ v11.9.1: لاگ بازیابی از پشتیبان (عملیات بسیار حساس!)
        logger.info('⚠️ بازیابی از پشتیبان انجام شد', {
          backupId: selectedBackupId,
          fileName: backupToRestore?.fileName || null,
          backupCreatedAt: backupToRestore?.createdAt || null,
          backupFileSize: backupToRestore?.fileSize || null,
          backupRecordCount: backupToRestore?.recordCount || null,
          restoredCount: data.data?.restoredCount || 0,
          operationType: 'full_restore',
          severity: 'critical',
          warning: 'تمام داده‌های قبلی حذف و جایگزین شد',
        })

        alert(`بازیابی موفق! ${data.data.restoredCount} رکورد بازیابی شد. صفحه رفرش می‌شود...`)
        setRestoreDialogOpen(false)
        setSelectedBackupId(null)
        window.location.reload()
      } else {
        // ★ v11.9.1: لاگ خطای بازیابی
        logger.error('خطا در بازیابی از پشتیبان', undefined, {
          backupId: selectedBackupId,
          fileName: backupToRestore?.fileName || null,
          error: data.error,
          severity: 'critical',
        })

        alert(data.error || 'خطا در بازیابی')
      }
    } catch (err: any) {
      // ★ v11.9.1: لاگ خطای شبکه در بازیابی
      logger.error('خطای شبکه در بازیابی از پشتیبان', err, {
        backupId: selectedBackupId,
        fileName: backupToRestore?.fileName || null,
        severity: 'critical',
      })

      alert('خطا در ارتباط با سرور')
    }
    setRestoring(false)
  }

  const handleDeleteBackup = async () => {
    if (!deleteBackupId) return
    
    const backupToDelete = backups.find(b => b.id === deleteBackupId)
    
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/backup?id=${deleteBackupId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) {
        // ★ v11.9.1: لاگ حذف پشتیبان
        logger.info('فایل پشتیبان حذف شد', {
          backupId: deleteBackupId,
          fileName: backupToDelete?.fileName || null,
          fileSize: backupToDelete?.fileSize || null,
          fileSizeFormatted: backupToDelete ? formatSize(backupToDelete.fileSize) : null,
          recordCount: backupToDelete?.recordCount || null,
          createdAt: backupToDelete?.createdAt || null,
          remainingBackupsCount: backups.length - 1,
        })

        fetchBackups()
      } else {
        // ★ v11.9.1: لاگ خطای حذف پشتیبان
        logger.error('خطا در حذف پشتیبان', undefined, {
          backupId: deleteBackupId,
          fileName: backupToDelete?.fileName || null,
          error: data.error,
        })

        alert(data.error || 'خطا در حذف پشتیبان')
      }
    } catch (err: any) {
      // ★ v11.9.1: لاگ خطای شبکه در حذف
      logger.error('خطای شبکه در حذف پشتیبان', err, {
        backupId: deleteBackupId,
        fileName: backupToDelete?.fileName || null,
      })

      alert('خطا در ارتباط با سرور')
    }
    setDeleteDialogOpen(false)
    setDeleteBackupId(null)
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('fa-IR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardContent className="p-3 sm:p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-600" />
              <p className="text-sm font-bold text-emerald-800">ایجاد پشتیبان جدید</p>
            </div>
            <p className="text-[11px] text-emerald-700 leading-relaxed">
              یک نسخه فشرده و امن از تمام داده‌های فروشگاه (فاکتورها، حسابداری، انبار و...) در سرور ذخیره می‌شود.
            </p>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white w-full h-8 text-xs"
              onClick={handleCreateBackup}
              disabled={creating}
            >
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin ml-1" /> : <Database className="w-3.5 h-3.5 ml-1" />}
              {creating ? 'در حال پردازش...' : 'ایجاد پشتیبان'}
            </Button>
          </CardContent>
        </Card>

        {lastBackupResult && (
          <Alert className="border-emerald-200 bg-emerald-50 py-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <AlertDescription className="text-emerald-800 text-xs">
              پشتیبان با موفقیت ایجاد شد.
              <span className="font-bold mr-1">حجم: {formatSize(lastBackupResult.fileSize)}</span>
              <span className="font-bold mr-1">| رکورد: {lastBackupResult.recordCount?.toLocaleString('fa-IR')}</span>
            </AlertDescription>
          </Alert>
        )}
      </div>

      <Card className="border-gray-200">
        <CardHeader className="p-3 sm:p-4 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileArchive className="w-4 h-4 text-emerald-600" />
            پشتیبان‌های ذخیره شده ({backups.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          {loading ? (
            <div className="flex items-center gap-2 py-4 justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
              <span className="text-xs text-gray-500">در حال بارگذاری...</span>
            </div>
          ) : backups.length === 0 ? (
            <p className="text-xs text-gray-400 py-6 text-center">هنوز هیچ پشتیبانی ایجاد نشده است.</p>
          ) : (
            <div className="space-y-2">
              {backups.map((backup) => (
                <div key={backup.id} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-gray-50 rounded-lg border border-gray-100 hover:bg-gray-100/80 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-800 truncate">{backup.fileName}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {formatDate(backup.createdAt)} • {formatSize(backup.fileSize)}
                      {backup.recordCount && ` • ${backup.recordCount.toLocaleString('fa-IR')} رکورد`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50" onClick={() => handleDownloadBackup(backup.id, backup.fileName)} title="دانلود فایل">
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50" onClick={() => { setSelectedBackupId(backup.id); setRestoreDialogOpen(true) }} title="بازیابی (جایگزینی داده‌ها)">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => { setDeleteBackupId(backup.id); setDeleteDialogOpen(true) }} title="حذف دائمی">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Alert className="border-amber-200 bg-amber-50/50 py-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <AlertDescription className="text-amber-800 text-xs leading-relaxed">
          <strong>توجه:</strong> عملیات «بازیابی»، تمام داده‌های فعلی فروشگاه را پاک کرده و داده‌های فایل پشتیبان را جایگزین می‌کند. این عمل <strong>غیرقابل بازگشت</strong> است.
        </AlertDescription>
      </Alert>

      <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              تأیید بازیابی از پشتیبان
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              با تأیید این عمل، <strong>تمام داده‌های فعلی</strong> فروشگاه حذف شده و داده‌های این پشتیبان جایگزین می‌شود.
              <br /><br />
              آیا کاملاً مطمئن هستید؟ این عمل قابل بازگشت نیست.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestore}
              disabled={restoring}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {restoring ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
              بله، بازیابی کن
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف فایل پشتیبان</AlertDialogTitle>
            <AlertDialogDescription>
              آیا از حذف دائمی این فایل پشتیبان مطمئن هستید؟ این عمل فقط فایل بکاپ را پاک می‌کند و تأثیری روی داده‌های فعال فروشگاه ندارد.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteBackup}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              حذف دائمی
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}