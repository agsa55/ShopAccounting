'use client'

// ============================================================================
// src/components/products/barcode-scanner.tsx — v9.0 (نهایی)
// ★ اسکن خودکار هر ۳۰۰ms با BarcodeDetector بومی
// ★ دکمه اسکن دستی برای اطمینان بیشتر
// ★ اگر مرورگر پشتیبانی نکرد، پیام مناسب نمایش می‌دهد
// ============================================================================

import { useEffect, useRef, useState, useCallback } from 'react'
import { Camera, Loader2, AlertCircle, Flashlight, FlashlightOff, ScanLine } from 'lucide-react'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'

interface BarcodeScannerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onScan: (barcode: string) => void
}

export function BarcodeScannerDialog({ open, onOpenChange, onScan }: BarcodeScannerDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const detectorRef = useRef<any>(null)
  const hasStartedRef = useRef(false)
  const scannedRef = useRef(false)

  const [error, setError] = useState('')
  const [starting, setStarting] = useState(true)
  const [torchOn, setTorchOn] = useState(false)
  const [detectorAvailable, setDetectorAvailable] = useState(false)
  const [lastScanAttempt, setLastScanAttempt] = useState('')

  useEffect(() => {
    if (open) {
      hasStartedRef.current = false
      scannedRef.current = false
      setError('')
      setStarting(true)
      setTorchOn(false)
      setLastScanAttempt('')
    }
  }, [open])

  const stopCamera = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  const doScan = useCallback(async () => {
    if (scannedRef.current || !videoRef.current || !detectorRef.current) return
    
    try {
      if (videoRef.current.readyState >= 2) {
        const barcodes = await detectorRef.current.detect(videoRef.current)
        setLastScanAttempt(new Date().toLocaleTimeString('fa-IR'))
        
        if (barcodes.length > 0 && !scannedRef.current) {
          scannedRef.current = true
          const barcode = barcodes[0].rawValue
          if (navigator.vibrate) navigator.vibrate(200)
          stopCamera()
          onScan(barcode)
        }
      }
    } catch {}
  }, [onScan, stopCamera])

  useEffect(() => {
    if (!open) return
    if (hasStartedRef.current) return
    hasStartedRef.current = true

    let isActive = true

    const startCamera = async () => {
      await new Promise((r) => setTimeout(r, 200))
      if (!isActive) return

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        })

        if (!isActive) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }

        setStarting(false)

        // بررسی وجود BarcodeDetector
        const BarcodeDetectorAPI = (window as any).BarcodeDetector

        if (BarcodeDetectorAPI) {
          setDetectorAvailable(true)
          detectorRef.current = new BarcodeDetectorAPI({
            formats: [
              'ean_13', 'ean_8', 'code_128', 'code_39',
              'upc_a', 'upc_e', 'qr_code', 'data_matrix',
              'itf', 'codabar', 'pdf417', 'aztec',
            ],
          })

          // اسکن خودکار هر ۳۰۰ میلی‌ثانیه
          intervalRef.current = setInterval(() => {
            doScan()
          }, 300)
        } else {
          setDetectorAvailable(false)
          setError(
            'مرورگر شما از اسکنر بارکد پشتیبانی نمی‌کند. لطفاً از مرورگر کروم (نسخه ۸۳ به بالا) استفاده کنید.'
          )
        }
      } catch (err: any) {
        if (isActive) {
          const message = err?.message || ''
          if (message.includes('Permission') || message.includes('NotAllowed')) {
            setError('دسترسی به دوربین رد شد. لطفاً دسترسی دوربین را فعال کنید.')
          } else if (message.includes('NotFound')) {
            setError('دوربینی یافت نشد.')
          } else if (message.includes('NotReadable')) {
            setError('دوربین در حال استفاده توسط برنامه دیگری است.')
          } else {
            setError('خطا در راه‌اندازی دوربین: ' + message)
          }
          setStarting(false)
        }
      }
    }

    startCamera()

    return () => {
      isActive = false
      hasStartedRef.current = false
      stopCamera()
    }
  }, [open, doScan, stopCamera])

  const toggleTorch = async () => {
    try {
      if (!streamRef.current) return
      const tracks = streamRef.current.getVideoTracks()
      for (const track of tracks) {
        const capabilities = track.getCapabilities?.() as any
        if (capabilities?.torch) {
          await track.applyConstraints({
            advanced: [{ torch: !torchOn } as any],
          })
          setTorchOn(!torchOn)
        }
      }
    } catch {}
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md w-[calc(100%-2rem)] p-0 overflow-hidden border-0 bg-white"
        dir="rtl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-gradient-to-l from-blue-600 to-indigo-600 text-white">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold">اسکن بارکد</h3>
              <p className="text-[10px] text-blue-100">
                {detectorAvailable ? '✨ اسکنر پیشرفته فعال' : '⚠️ اسکنر در دسترس نیست'}
              </p>
            </div>
          </div>
          {detectorAvailable && (
            <span className="text-[9px] bg-white/20 px-2 py-1 rounded-full animate-pulse">
              در حال اسکن...
            </span>
          )}
        </div>

        {/* Body */}
        <div className="p-4">
          {starting && !error && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-3" />
              <p className="text-sm text-gray-600">در حال راه‌اندازی دوربین...</p>
            </div>
          )}

          {error ? (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
              <p className="text-sm text-red-700 mb-4 px-2">{error}</p>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50"
              >
                بستن
              </button>
            </div>
          ) : (
            <>
              <div className="relative rounded-xl overflow-hidden bg-black">
                <video
                  ref={videoRef}
                  className="w-full"
                  playsInline
                  muted
                  autoPlay
                />

                {/* کادر اسکن */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-[300px] h-[200px] max-w-[95%] border-2 border-blue-400 rounded-lg relative bg-blue-500/5 overflow-hidden">
                    <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-blue-500 rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-blue-500 rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-blue-500 rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-blue-500 rounded-br-lg" />
                    <div className="absolute inset-x-0 h-0.5 bg-red-500 shadow-lg shadow-red-500/50 scan-line-animation" />
                  </div>
                </div>
              </div>

              {/* وضعیت اسکن */}
              {detectorAvailable && (
                <div className="mt-2 text-center">
                  <p className="text-[10px] text-gray-400">
                    {lastScanAttempt ? `آخرین تلاش: ${lastScanAttempt}` : 'در انتظار اسکن...'}
                  </p>
                </div>
              )}

              {/* دکمه‌ها */}
              <div className="flex items-center justify-center gap-2 mt-3">
                {detectorAvailable && (
                  <button
                    type="button"
                    onClick={doScan}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-xs hover:bg-blue-700 cursor-pointer font-bold"
                  >
                    <ScanLine className="w-4 h-4" />
                    اسکن الان
                  </button>
                )}
                <button
                  type="button"
                  onClick={toggleTorch}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-gray-300 text-xs hover:bg-gray-50 cursor-pointer bg-white"
                >
                  {torchOn ? <FlashlightOff className="w-3.5 h-3.5" /> : <Flashlight className="w-3.5 h-3.5" />}
                  {torchOn ? 'خاموش' : 'چراغ'}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="px-4 py-2.5 rounded-lg text-xs hover:bg-gray-100 cursor-pointer bg-white border border-gray-300"
                >
                  انصراف
                </button>
              </div>

              {/* راهنما */}
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-[11px] text-blue-800 font-bold mb-1.5 text-center">
                  📱 راهنمای اسکن:
                </p>
                <ul className="text-[10px] text-blue-700 space-y-1 pr-4 list-disc">
                  <li>بارکد را <b>۲۰ تا ۳۰ سانتی‌متر</b> از دوربین نگه دارید</li>
                  <li>بارکد را <b>صاف</b> جلوی دوربین بگیرید</li>
                  <li><b>نور کافی</b> داشته باشید</li>
                  <li>اگر اسکن خودکار کار نکرد، دکمه <b>"اسکن الان"</b> را بزنید</li>
                </ul>
              </div>
            </>
          )}
        </div>
      </DialogContent>

      <style jsx global>{`
        @keyframes scanLine {
          0%, 100% { top: 5%; }
          50% { top: 95%; }
        }
        .scan-line-animation {
          animation: scanLine 2.5s ease-in-out infinite;
        }
      `}</style>
    </Dialog>
  )
}

export default BarcodeScannerDialog