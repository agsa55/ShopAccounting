'use client'

// ============================================================================
// src/components/pos/barcode-scanner-modal.tsx — Camera Barcode Scanner (v3.36)
// ----------------------------------------------------------------------------
// ★ اسکن بارکد با دوربین موبایل/وب‌کم.
// ★ بدون dependency خارجی — از BarcodeDetector API بومی مرورگر استفاده می‌کند.
// ★ پشتیبانی از فرمت‌های رایج: ean_13, ean_8, code_128, code_39, upc_a, upc_e, qr_code
// ★ Fallback: اگر BarcodeDetector در دسترس نباشد، ورودی فایل (عکس از دوربین) + دستی.
// ★ ساختار RTL و کاملاً فارسی.
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Camera,
  CameraOff,
  X,
  ScanLine,
  Loader2,
  Image as ImageIcon,
  Keyboard,
  AlertTriangle,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'

interface BarcodeScannerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDetected: (barcode: string) => void
}

// ★ تایپ برای BarcodeDetector (هنوز در TypeScript DOM lib نیست)
interface BarcodeDetectorResult {
  rawValue: string
  format: string
  boundingBox: DOMRectReadOnly
}
interface BarcodeDetectorClass {
  new (options?: { formats?: string[] }): {
    detect: (source: CanvasImageSource) => Promise<BarcodeDetectorResult[]>
  }
  getSupportedFormats(): Promise<string[]>
}

export function BarcodeScannerModal({ open, onOpenChange, onDetected }: BarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const detectorRef = useRef<any>(null)

  const [status, setStatus] = useState<'idle' | 'starting' | 'scanning' | 'denied' | 'unsupported' | 'stopped'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [manualBarcode, setManualBarcode] = useState('')
  const [showManual, setShowManual] = useState(false)
  const { toast } = useToast()

  // ─── پشتیبانی BarcodeDetector ──────────────────────────────────
  const isBarcodeDetectorSupported = useCallback(() => {
    return typeof window !== 'undefined' && 'BarcodeDetector' in window
  }, [])

  // ─── stop camera ────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setStatus('stopped')
  }, [])

  // ─── start camera ───────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setError(null)
    setStatus('starting')

    try {
      // ★ درخواست دوربین پشتی (environment) برای موبایل
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })

      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      // ★ ساخت BarcodeDetector با فرمت‌های رایج
      if (isBarcodeDetectorSupported()) {
        try {
          const Bd = (window as any).BarcodeDetector as BarcodeDetectorClass
          const supportedFormats = await Bd.getSupportedFormats()
          const desiredFormats = [
            'ean_13', 'ean_8', 'code_128', 'code_39',
            'upc_a', 'upc_e', 'qr_code', 'codabar', 'itf',
          ].filter((f) => supportedFormats.includes(f))
          detectorRef.current = new Bd({ formats: desiredFormats.length > 0 ? desiredFormats : undefined })
        } catch (err) {
          console.warn('[BarcodeScanner] BarcodeDetector init failed, fallback to manual:', err)
          detectorRef.current = null
        }
      }

      setStatus('scanning')

      // ★ شروع حلقه تشخیص
      const detectLoop = async () => {
        if (!videoRef.current || !streamRef.current) return
        if (videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
          rafRef.current = requestAnimationFrame(detectLoop)
          return
        }

        try {
          if (detectorRef.current) {
            const results = await detectorRef.current.detect(videoRef.current)
            if (results && results.length > 0) {
              const barcode = results[0].rawValue
              if (barcode) {
                handleDetected(barcode, results[0].format)
                return // متوقف کردن حلقه
              }
            }
          }
        } catch (err) {
          // خطای موقت — ادامه
        }

        rafRef.current = requestAnimationFrame(detectLoop)
      }

      rafRef.current = requestAnimationFrame(detectLoop)
    } catch (err: any) {
      console.error('[BarcodeScanner] Camera error:', err)

      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setStatus('denied')
        setError('دسترسی به دوربین رد شد. لطفاً در تنظیمات مرورگر اجازه دهید.')
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        setStatus('unsupported')
        setError('دوربین یافت نشد. می‌توانید بارکد را دستی وارد کنید.')
        setShowManual(true)
      } else {
        setStatus('unsupported')
        setError(err?.message || 'خطا در راه‌اندازی دوربین')
        setShowManual(true)
      }
    }
  }, [isBarcodeDetectorSupported])

  // ─── handleDetected ─────────────────────────────────────────────
  const handleDetected = useCallback(
    (barcode: string, format?: string) => {
      // ★ ویبره موبایل (در صورت پشتیبانی)
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          ;(navigator as any).vibrate(100)
        } catch {}
      }

      toast({
        title: 'بارکد خوانده شد',
        description: `${barcode}${format ? ` (${format})` : ''}`,
      })

      stopCamera()
      onDetected(barcode)
      onOpenChange(false)
    },
    [onDetected, onOpenChange, stopCamera, toast]
  )

  // ─── هنگام باز/بسته شدن دیالوگ ────────────────────────────────────
  useEffect(() => {
    if (open) {
      setManualBarcode('')
      setShowManual(false)
      setError(null)
      // ★ استارت خودکار دوربین اگر BARCODE_DETECTOR پشتیبانی شود
      if (isBarcodeDetectorSupported() && navigator.mediaDevices?.getUserMedia) {
        // ★ کم‌کردن تأخیر برای فعال‌سازی DOM
        setTimeout(() => startCamera(), 100)
      } else {
        setStatus('unsupported')
        setShowManual(true)
      }
    } else {
      stopCamera()
    }

    return () => {
      stopCamera()
    }
  }, [open])

  // ─── ورودی فایل (fallback) ──────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    try {
      if (detectorRef.current) {
        const img = new Image()
        img.src = URL.createObjectURL(file)
        await new Promise((resolve) => (img.onload = resolve))

        const results = await detectorRef.current.detect(img)
        if (results && results.length > 0 && results[0].rawValue) {
          handleDetected(results[0].rawValue, results[0].format)
          return
        }
      }
      setError('بارکد در تصویر یافت نشد. لطفاً دستی وارد کنید.')
      setShowManual(true)
    } catch (err: any) {
      setError('خطا در پردازش تصویر')
      setShowManual(true)
    }
  }

  // ─── ارسال دستی ─────────────────────────────────────────────────
  const handleManualSubmit = () => {
    const code = manualBarcode.trim()
    if (!code) {
      toast({ title: 'خطا', description: 'بارکد را وارد کنید', variant: 'destructive' })
      return
    }
    handleDetected(code)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) stopCamera() }}>
      <DialogContent className="sm:max-w-[460px]" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ScanLine className="w-4 h-4 text-emerald-600" />
            اسکن بارکد
          </DialogTitle>
          <DialogDescription className="text-xs">
            بارکد محصول را به دوربین نگه دارید
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 space-y-3">
          {/* ★ ویدیو دوربین */}
          <div className="relative bg-black rounded-lg overflow-hidden aspect-[4/3] flex items-center justify-center">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ display: status === 'scanning' ? 'block' : 'none' }}
            />

            {/* ★ فریم اسکن (overlay) */}
            {status === 'scanning' && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-1/3 border-2 border-emerald-400 rounded-lg">
                  <div className="absolute inset-x-0 top-0 h-0.5 bg-emerald-400 animate-pulse" />
                  <div className="absolute inset-x-0 bottom-0 h-0.5 bg-emerald-400 animate-pulse" />
                </div>
                <p className="absolute bottom-2 left-1/2 -translate-x-1/2 text-white text-[10px] bg-black/60 px-2 py-0.5 rounded">
                  بارکد را داخل قاب قرار دهید
                </p>
              </div>
            )}

            {/* ★ loading state */}
            {status === 'starting' && (
              <div className="text-white text-center">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                <p className="text-[11px]">در حال راه‌اندازی دوربین...</p>
              </div>
            )}

            {/* ★ denied state */}
            {status === 'denied' && (
              <div className="text-white text-center px-4">
                <CameraOff className="w-8 h-8 mx-auto mb-2 text-red-400" />
                <p className="text-[11px] mb-2">دسترسی به دوربین رد شد</p>
                <Button size="sm" variant="outline" onClick={startCamera} className="bg-white/10 border-white/30 text-white hover:bg-white/20">
                  تلاش مجدد
                </Button>
              </div>
            )}

            {/* ★ unsupported state */}
            {status === 'unsupported' && (
              <div className="text-white text-center px-4">
                <CameraOff className="w-8 h-8 mx-auto mb-2 text-amber-400" />
                <p className="text-[11px]">دوربین در این مرورگر پشتیبانی نمی‌شود</p>
              </div>
            )}

            {/* ★ stopped state */}
            {status === 'stopped' && status !== 'starting' && (
              <div className="text-white text-center">
                <Camera className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <Button size="sm" variant="outline" onClick={startCamera} className="bg-white/10 border-white/30 text-white hover:bg-white/20">
                  روشن کردن دوربین
                </Button>
              </div>
            )}
          </div>

          {/* ★ پیام خطا */}
          {error && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-700 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* ★ تoggle ورودی دستی */}
          <div className="flex gap-1.5">
            {!showManual && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1 text-[11px]"
                  onClick={() => setShowManual(true)}
                >
                  <Keyboard className="w-3.5 h-3.5" />
                  ورود دستی
                </Button>
                <label className="flex-1">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <span className="flex items-center justify-center gap-1 h-8 px-3 rounded-md border border-slate-200 hover:bg-slate-50 cursor-pointer text-[11px] text-slate-700">
                    <ImageIcon className="w-3.5 h-3.5" />
                    انتخاب عکس
                  </span>
                </label>
              </>
            )}
          </div>

          {/* ★ فرم ورود دستی */}
          {showManual && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-2">
              <p className="text-[11px] text-slate-600">بارکد را دستی وارد کنید:</p>
              <div className="flex gap-1.5">
                <Input
                  type="text"
                  inputMode="numeric"
                  value={manualBarcode}
                  onChange={(e) => setManualBarcode(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleManualSubmit() }}
                  placeholder="مثلاً 6291234567890"
                  dir="ltr"
                  className="text-left font-mono h-8 text-[12px]"
                  autoFocus
                />
                <Button size="sm" onClick={handleManualSubmit} className="bg-emerald-600 hover:bg-emerald-700 h-8 px-3">
                  تأیید
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => { onOpenChange(false); stopCamera() }} className="w-full">
            <X className="w-3.5 h-3.5 ml-1" />
            بستن
          </Button>
        </DialogFooter>

        {/* ★ canvas مخفی برای fallback detection در صورت نیاز */}
        <canvas ref={canvasRef} className="hidden" />
      </DialogContent>
    </Dialog>
  )
}
