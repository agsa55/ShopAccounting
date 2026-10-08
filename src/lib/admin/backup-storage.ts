// ============================================================================
// src/lib/admin/backup-storage.ts
// ★ ماژول ذخیره‌سازی فایل بکاپ روی استورج دائمی
// ----------------------------------------------------------------------------
// مسئولیت‌ها:
//   - ذخیره بکاپ به‌صورت gzip
//   - ساخت مسیر امن سال/ماه
//   - خواندن فایل بکاپ
//   - حذف فایل بکاپ
//   - محاسبه checksum
//   - جلوگیری از path traversal
//
// مسیر پیش‌فرض:
//   لوکال: ./storage/backups
//   رانفلر: /app/storage/backups
//
// این مسیر از متغیر محیطی BACKUP_STORAGE_PATH خوانده می‌شود.
// ============================================================================

import { mkdir, readFile, stat, unlink, writeFile } from 'fs/promises'
import path from 'path'
import { gzipSync, gunzipSync } from 'zlib'
import crypto from 'crypto'

// ============================================================================
// Types
// ============================================================================

export interface SaveBackupFileInput {
  /**
   * محتوای خام بکاپ، معمولاُ JSON Buffer.
   * اگر قبلاً gzip شده باشد، دوباره gzip نمی‌شود.
   */
  data: Buffer

  /**
   * نام فایل نهایی.
   * مثال: tenant-sadat-2026-10-08-03-00.json.gz
   */
  fileName: string

  /**
   * تاریخ ساخت فایل.
   * اگر داده نشود، از new Date() استفاده می‌شود.
   */
  createdAt?: Date

  /**
   * تعداد روزهای نگهداری.
   * اگر داده شود، expiresAt محاسبه می‌شود.
   */
  retentionDays?: number
}

export interface SavedBackupFile {
  /**
   * مسیر نسبی امن برای ذخیره در دیتابیس.
   * مثال: 2026/10/tenant-sadat-....json.gz
   */
  storagePath: string

  /**
   * مسیر absolute روی سرور.
   * فقط برای استفاده داخلی، نه ذخیره در دیتابیس.
   */
  absolutePath: string

  /**
   * نام امن فایل.
   */
  fileName: string

  /**
   * حجم محتوای اصلی قبل از gzip.
   */
  sizeOriginal: number

  /**
   * حجم فایل gzip شده.
   */
  sizeCompressed: number

  /**
   * SHA-256 فایل فشرده.
   */
  checksum: string

  /**
   * تاریخ ساخت.
   */
  createdAt: Date

  /**
   * تاریخ انقضا.
   */
  expiresAt: Date | null
}

export interface BackupFileStat {
  exists: boolean
  size?: number
  mtime?: Date
}

// ============================================================================
// Helpers
// ============================================================================

function getBackupRoot(): string {
  const envPath = process.env.BACKUP_STORAGE_PATH?.trim()

  if (envPath) {
    return path.resolve(envPath)
  }

  // fallback امن:
  // لوکال: ./storage/backups
  // رانفلر با cwd=/app: /app/storage/backups
  return path.resolve(process.cwd(), 'storage/backups')
}

function padTwo(n: number): string {
  return String(n).padStart(2, '0')
}

function isGzipBuffer(buf: Buffer): boolean {
  return buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b
}

function sanitizeFileName(fileName: string): string {
  const base = path.basename(String(fileName || '').trim())

  const cleaned = base
    .replace(/[\/\\:*?"<>|\x00-\x1f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')

  return cleaned || `backup-${Date.now()}.json.gz`
}

function ensureGzipSuffix(fileName: string): string {
  const lower = fileName.toLowerCase()

  if (lower.endsWith('.gz')) {
    return fileName
  }

  if (lower.endsWith('.json')) {
    return `${fileName}.gz`
  }

  return `${fileName}.gz`
}

function buildRelativeDir(date: Date): string {
  const year = date.getFullYear()
  const month = padTwo(date.getMonth() + 1)

  return `${year}/${month}`
}

function resolveSafeStoragePath(storagePath: string): {
  root: string
  absolutePath: string
  normalizedRelativePath: string
} {
  const root = path.resolve(getBackupRoot())

  const raw = String(storagePath || '').trim()

  if (!raw) {
    throw new Error('مسیر فایل بکاپ خالی است.')
  }

  if (path.isAbsolute(raw)) {
    throw new Error('مسیر فایل بکاپ نباید absolute باشد.')
  }

  const withoutLeadingSlash = raw.replace(/^\/+/, '')

  const absolutePath = path.resolve(root, withoutLeadingSlash)

  if (
    absolutePath !== root &&
    !absolutePath.startsWith(root + path.sep)
  ) {
    throw new Error('مسیر فایل بکاپ خارج از پوشه مجاز است.')
  }

  const normalizedRelativePath = path
    .relative(root, absolutePath)
    .split(path.sep)
    .join('/')

  return {
    root,
    absolutePath,
    normalizedRelativePath,
  }
}

async function ensureDirectoryExists(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

function calculateSha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}

// ============================================================================
// Core: Save backup file
// ============================================================================

export async function saveBackupFile(
  input: SaveBackupFileInput
): Promise<SavedBackupFile> {
  if (!input.data || input.data.length === 0) {
    throw new Error('محتوای بکاپ خالی است.')
  }

  const createdAt = input.createdAt ?? new Date()

  let fileName = sanitizeFileName(input.fileName)
  fileName = ensureGzipSuffix(fileName)

  const relativeDir = buildRelativeDir(createdAt)
  const root = path.resolve(getBackupRoot())
  const absoluteDir = path.resolve(root, relativeDir)
  const absolutePath = path.join(absoluteDir, fileName)

  await ensureDirectoryExists(absoluteDir)

  const alreadyGzipped = isGzipBuffer(input.data)

  const compressedBuffer = alreadyGzipped
    ? input.data
    : gzipSync(input.data)

  const checksum = calculateSha256(compressedBuffer)

  await writeFile(absolutePath, compressedBuffer)

  const storagePath = path.posix.join(relativeDir, fileName)

  const expiresAt =
    input.retentionDays && input.retentionDays > 0
      ? addDays(createdAt, input.retentionDays)
      : null

  return {
    storagePath,
    absolutePath,
    fileName,
    sizeOriginal: input.data.length,
    sizeCompressed: compressedBuffer.length,
    checksum,
    createdAt,
    expiresAt,
  }
}

// ============================================================================
// Core: Read backup file
// ============================================================================

export async function readBackupFile(storagePath: string): Promise<Buffer> {
  const { absolutePath } = resolveSafeStoragePath(storagePath)

  try {
    return await readFile(absolutePath)
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      throw new Error('فایل بکاپ در استورج سرور یافت نشد.')
    }

    throw new Error(
      `خطا در خواندن فایل بکاپ: ${err?.message || 'خطای ناشناخته'}`
    )
  }
}

export async function readBackupFileMaybeDecompressed(
  storagePath: string
): Promise<Buffer> {
  const raw = await readBackupFile(storagePath)

  if (isGzipBuffer(raw)) {
    try {
      return gunzipSync(raw)
    } catch (err: any) {
      throw new Error(
        `فایل بکاپ gzip خراب است: ${err?.message || 'خطای ناشناخته'}`
      )
    }
  }

  return raw
}

// ============================================================================
// Core: Resolve absolute path safely
// ============================================================================

export function getBackupAbsolutePath(storagePath: string): string {
  return resolveSafeStoragePath(storagePath).absolutePath
}

// ============================================================================
// Core: Delete backup file
// ============================================================================

export async function deleteBackupFile(storagePath: string): Promise<boolean> {
  const { absolutePath } = resolveSafeStoragePath(storagePath)

  try {
    await unlink(absolutePath)
    return true
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      return false
    }

    throw new Error(
      `خطا در حذف فایل بکاپ: ${err?.message || 'خطای ناشناخته'}`
    )
  }
}

// ============================================================================
// Core: Exists / Stat
// ============================================================================

export async function backupFileExists(storagePath: string): Promise<boolean> {
  try {
    const { absolutePath } = resolveSafeStoragePath(storagePath)
    await stat(absolutePath)
    return true
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      return false
    }

    throw new Error(
      `خطا در بررسی وجود فایل بکاپ: ${err?.message || 'خطای ناشناخته'}`
    )
  }
}

export async function getBackupFileStat(
  storagePath: string
): Promise<BackupFileStat> {
  try {
    const { absolutePath } = resolveSafeStoragePath(storagePath)
    const s = await stat(absolutePath)

    return {
      exists: true,
      size: s.size,
      mtime: s.mtime,
    }
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      return { exists: false }
    }

    throw new Error(
      `خطا در دریافت اطلاعات فایل بکاپ: ${err?.message || 'خطای ناشناخته'}`
    )
  }
}

// ============================================================================
// Utility: generate file name
// ============================================================================

export function buildTenantBackupFileName(options: {
  subDomain: string
  tenantId?: string
  date?: Date
}): string {
  const date = options.date ?? new Date()

  const datePart = [
    date.getFullYear(),
    padTwo(date.getMonth() + 1),
    padTwo(date.getDate()),
    '-',
    padTwo(date.getHours()),
    '-',
    padTwo(date.getMinutes()),
  ].join('')

  const safeSubDomain =
    sanitizeFileName(options.subDomain || options.tenantId || 'tenant') ||
    'tenant'

  return `tenant-${safeSubDomain}-${datePart}.json.gz`
}

export function buildFullDatabaseBackupFileName(date?: Date): string {
  const d = date ?? new Date()

  const datePart = [
    d.getFullYear(),
    padTwo(d.getMonth() + 1),
    padTwo(d.getDate()),
    '-',
    padTwo(d.getHours()),
    '-',
    padTwo(d.getMinutes()),
  ].join('')

  return `full-database-${datePart}.json.gz`
}

// ============================================================================
// Utility: get backup root for logs/debug
// ============================================================================

export function getBackupStorageRoot(): string {
  return path.resolve(getBackupRoot())
}