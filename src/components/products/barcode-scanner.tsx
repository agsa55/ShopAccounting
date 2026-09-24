'use client'

// ============================================================================
// src/components/products/barcode-scanner.tsx — v8.0 (نهایی قطعی)
// ★ استفاده از BarcodeDetector بومی مرورگر (دقیقاً مثل اسکنر گوشی)
// ★ پشتیبانی از: کروم، سافاری، فایرفاکس، موبایل
// ★ اگر مرورگر پشتیبانی نکرد، به روش قدیمی برمی‌گردد
// ============================================================================

import { useEffect, useRef, useState } from 'react'
import { Camera, Loader2, AlertCircle, Flashlight, FlashlightOff, Barcode } from 'lucide-react'
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
  const animationFrameRef = useRef<number | null>(null)
  const hasStartedRef = useRef(false)
  const scannedRef = useRef(false)

  const [error, setError] = useState('')
  const [starting, setStarting] = useState(true)
  const [torchOn, setTorchOn] = useState(false)
  const [detectorType, setDetectorType] = useState<'native' | 'library' | null>(null)

  useEffect(() => {
    if (open) {
      hasStartedRef.current = false
      scannedRef.current = false
      setError('')
      setStarting(true)
      setTorchOn(false)
      setDetectorType(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    if (hasStartedRef.current) return
    hasStartedRef.current = true

    let isActive = true

    const stopCamera = () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
    }

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

        const BarcodeDetectorAPI = (window as any).BarcodeDetector

        if (BarcodeDetectorAPI) {
          // ✅ اسکنر بومی مرورگر (دقیقاً مثل اسکنر گوشی)
          setDetectorType('native')
          
          const detector = new BarcodeDetectorAPI({
            formats: [
              'ean_13', 'ean_8', 'code_128', 'code_39',
              'upc_a', 'upc_e', 'qr_code', 'data_matrix',
              'itf', 'codabar',
            ],
          })

          const scan = async () => {
            if (!isActive || scannedRef.current) return

            if (
              videoRef.current &&
              videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA
            ) {
              try {
                const barcodes = await detector.detect(videoRef.current)
                if (barcodes.length > 0 && !scannedRef.current) {
                  scannedRef.current = true
                  const barcode = barcodes[0].rawValue
                  if (navigator.vibrate) navigator.vibrate(200)
                  onScan(barcode)
                  stopCamera()
                  return
                }
              } catch {}
            }

            animationFrameRef.current = requestAnimationFrame(scan)
          }

          scan()
        } else {
          // ⚠️ مرورگر پشتیبانی نمی‌کند — استفاده از روش قدیمی
          setDetectorType('library')
          
          try {
            const { Html5Qrcode } = await import('html5-qrcode')
            const scanner = new Html5Qrcode('barcode-scanner-fallback')
            
            await scanner.start(
              { facingMode: 'environment' },
              { fps: 20, qrbox: { width: 300, height: 200 } },
              (decodedText) => {
                if (scannedRef.current || !isActive) return
                scannedRef.current = true
                if (navigator.vibrate) navigator.vibrate(200)
                onScan(decodedText)
                scanner.stop().catch(() => {})
              },
              () => {}
            )
          } catch (err: any) {
            if (isActive) {
              setError('مرورگر شما از اسکنر بارکد پشتیبانی نمی‌کند. لطفاً از کروم استفاده کنید.')
            }
          }
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
  }, [open, onScan])

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
                {detectorType === 'native' ? 'اسکنر بومی (دقت بالا)' : 'اسکنر استاندارد'}
              </p>
            </div>
          </div>
          {detectorType && (
            <span className="text-[9px] bg-white/20 px-2 py-1 rounded-full">
              {detectorType === 'native' ? '✨ پیشرفته' : '⚡ استاندارد'}
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
            </div>
          ) : (
            <>
              <div className="relative rounded-xl overflow-hidden bg-black">
                {/* ویدیو برای اسکنر بومی */}
                <video
                  ref={videoRef}
                  className={`w-full ${detectorType === 'library' ? 'hidden' : ''}`}
                  playsInline
                  muted
                  autoPlay
                />
                
                {/* کانتینر برای اسکنر قدیمی */}
                <div
                  id="barcode-scanner-fallback"
                  className={detectorType === 'library' ? 'w-full' : 'hidden'}
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

              {/* دکمه‌ها */}
              <div className="flex items-center justify-center gap-2 mt-4">
                <button
                  type="button"
                  onClick={toggleTorch}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-xs hover:bg-gray-50 cursor-pointer bg-white"
                >
                  {torchOn ? <FlashlightOff className="w-3.5 h-3.5" /> : <Flashlight className="w-3.5 h-3.5" />}
                  {torchOn ? 'خاموش' : 'چراغ قوه'}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="px-4 py-2 rounded-lg text-xs hover:bg-gray-100 cursor-pointer bg-white border border-gray-300"
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