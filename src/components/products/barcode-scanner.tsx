'use client'

// ============================================================================
// src/components/products/barcode-scanner.tsx — v10.0 (نهایی قطعی)
// ★ اسکن با Canvas (قابل اعتمادتر از ویدیو مستقیم)
// ★ مودال کوتاه و جمع‌وجور
// ============================================================================

import { useEffect, useRef, useState, useCallback } from 'react'
import { Camera, Loader2, AlertCircle, ScanLine } from 'lucide-react'
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const detectorRef = useRef<any>(null)
  const hasStartedRef = useRef(false)
  const scannedRef = useRef(false)

  const [error, setError] = useState('')
  const [starting, setStarting] = useState(true)
  const [detectorAvailable, setDetectorAvailable] = useState(false)
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    if (open) {
      hasStartedRef.current = false
      scannedRef.current = false
      setError('')
      setStarting(true)
      setScanning(false)
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

  // ★ اسکن با Canvas (قابل اعتمادتر)
  const doScan = useCallback(async () => {
    if (scannedRef.current || !videoRef.current || !detectorRef.current) return
    if (videoRef.current.readyState < 2) return

    try {
      setScanning(true)

      // ساخت یا استفاده از canvas موجود
      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas')
      }
      const canvas = canvasRef.current
      const video = videoRef.current

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      // اسکن روی canvas به جای ویدیو
      const barcodes = await detectorRef.current.detect(canvas)

      if (barcodes.length > 0 && !scannedRef.current) {
        scannedRef.current = true
        const barcode = barcodes[0].rawValue
        if (navigator.vibrate) navigator.vibrate(200)
        stopCamera()
        onScan(barcode)
        return
      }
    } catch {}
    
    setScanning(false)
  }, [onScan, stopCamera])

  useEffect(() => {
    if (!open) return
    if (hasStartedRef.current) return
    hasStartedRef.current = true

    let isActive = true

    const startCamera = async () => {
      await new Promise((r) => setTimeout(r, 150))
      if (!isActive) return

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
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

        const BarcodeDetectorAPI = (window as any).BarcodeDetector

        if (BarcodeDetectorAPI) {
          setDetectorAvailable(true)
          detectorRef.current = new BarcodeDetectorAPI({
            formats: [
              'ean_13', 'ean_8', 'code_128', 'code_39',
              'upc_a', 'upc_e', 'qr_code', 'data_matrix',
              'itf', 'codabar',
            ],
          })

          // اسکن خودکار هر ۴۰۰ میلی‌ثانیه
          intervalRef.current = setInterval(() => {
            doScan()
          }, 400)
        } else {
          setDetectorAvailable(false)
          setError('مرورگر شما از اسکنر بارکد پشتیبانی نمی‌کند. از کروم استفاده کنید.')
        }
      } catch (err: any) {
        if (isActive) {
          const message = err?.message || ''
          if (message.includes('Permission') || message.includes('NotAllowed')) {
            setError('دسترسی به دوربین رد شد.')
          } else if (message.includes('NotFound')) {
            setError('دوربینی یافت نشد.')
          } else {
            setError('خطا: ' + message)
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-sm w-[calc(100%-2rem)] p-0 overflow-hidden border-0 bg-white"
        dir="rtl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Header کوتاه */}
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-l from-blue-600 to-indigo-600 text-white">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4" />
            <h3 className="text-sm font-bold">اسکن بارکد</h3>
          </div>
          {detectorAvailable && scanning && (
            <span className="text-[9px] bg-white/20 px-2 py-0.5 rounded-full">
              در حال اسکن...
            </span>
          )}
        </div>

        {/* Body */}
        <div className="p-3">
          {starting && !error && (
            <div className="flex flex-col items-center justify-center py-10">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-2" />
              <p className="text-xs text-gray-600">در حال راه‌اندازی دوربین...</p>
            </div>
          )}

          {error ? (
            <div className="text-center py-6">
              <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-2" />
              <p className="text-xs text-red-700 mb-3 px-2">{error}</p>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="px-4 py-1.5 rounded-lg border border-gray-300 text-xs hover:bg-gray-50"
              >
                بستن
              </button>
            </div>
          ) : (
            <>
              {/* ویدیو */}
              <div className="relative rounded-lg overflow-hidden bg-black">
                <video
                  ref={videoRef}
                  className="w-full max-h-[300px] object-cover"
                  playsInline
                  muted
                  autoPlay
                />

                {/* کادر اسکن */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-[250px] h-[150px] border-2 border-blue-400 rounded-lg relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-5 h-5 border-t-4 border-l-4 border-blue-500 rounded-tl" />
                    <div className="absolute top-0 right-0 w-5 h-5 border-t-4 border-r-4 border-blue-500 rounded-tr" />
                    <div className="absolute bottom-0 left-0 w-5 h-5 border-b-4 border-l-4 border-blue-500 rounded-bl" />
                    <div className="absolute bottom-0 right-0 w-5 h-5 border-b-4 border-r-4 border-blue-500 rounded-br" />
                    <div className="absolute inset-x-0 h-0.5 bg-red-500 scan-line-animation" />
                  </div>
                </div>
              </div>

              {/* دکمه‌ها */}
              <div className="flex items-center justify-center gap-2 mt-3">
                <button
                  type="button"
                  onClick={doScan}
                  disabled={!detectorAvailable}
                  className="flex items-center gap-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs hover:bg-blue-700 cursor-pointer font-bold disabled:opacity-50"
                >
                  <ScanLine className="w-3.5 h-3.5" />
                  اسکن
                </button>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="px-4 py-2 rounded-lg text-xs hover:bg-gray-100 cursor-pointer border border-gray-300"
                >
                  انصراف
                </button>
              </div>

              {/* راهنمای کوتاه */}
              <p className="text-[10px] text-gray-400 text-center mt-2">
                بارکد را صاف و در فاصله ۲۰ سانتی‌متر نگه دارید
              </p>
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
          animation: scanLine 2s ease-in-out infinite;
        }
      `}</style>
    </Dialog>
  )
}

export default BarcodeScannerDialog