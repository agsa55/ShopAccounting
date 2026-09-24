'use client'

// ============================================================================
// src/components/products/barcode-scanner.tsx — v7.0 (نهایی قطعی)
// ★ استفاده از Dialog خود shadcn (بدون createPortal، بدون window listener)
// ★ رفع قطعی مشکل قفل شدن صفحه
// ============================================================================

import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { Camera, X, Loader2, AlertCircle, Flashlight, FlashlightOff } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

interface BarcodeScannerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onScan: (barcode: string) => void
}

export function BarcodeScannerDialog({ open, onOpenChange, onScan }: BarcodeScannerDialogProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const hasStartedRef = useRef(false)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(true)
  const [torchOn, setTorchOn] = useState(false)
  const scannedRef = useRef(false)

  // Reset وقتی Dialog باز می‌شود
  useEffect(() => {
    if (open) {
      hasStartedRef.current = false
      scannedRef.current = false
      setError('')
      setStarting(true)
      setTorchOn(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    if (hasStartedRef.current) return
    hasStartedRef.current = true

    let isActive = true
    let scannerInstance: Html5Qrcode | null = null

      const stopScanner = async () => {
      try {
        if (scannerInstance) {
          // stop() اگر اسکنر فعال نباشد خطا می‌دهد که با catch مدیریت می‌شود
          await scannerInstance.stop()
          scannerInstance.clear()
          scannerInstance = null
        }
      } catch {}
    }

    const startScanner = async () => {
      // صبر برای رندر DOM
      await new Promise((r) => setTimeout(r, 200))

      const container = document.getElementById('barcode-scanner-video')
      if (!container || !isActive) return

      try {
        scannerInstance = new Html5Qrcode('barcode-scanner-video', {
          formatsToSupport: undefined as any,
          verbose: false,
        })
        scannerRef.current = scannerInstance

         await scannerInstance.start(
         { facingMode: 'environment' },
          {
            fps: 20,  // ★ سرعت بالاتر برای تشخیص بهتر
            qrbox: { width: 400, height: 250 },  // ★ کادر بزرگ‌تر
            disableFlip: false,
            // ★ حذف videoConstraints برای سازگاری بیشتر با دوربین‌های مختلف
          },
          (decodedText) => {
            if (scannedRef.current || !isActive) return
            scannedRef.current = true
            if (navigator.vibrate) navigator.vibrate(200)
            onScan(decodedText)
            stopScanner()
          },
          () => {}
        )

        if (isActive) setStarting(false)
      } catch (err: any) {
        if (isActive) {
          const message = err?.message || ''
          if (message.includes('Permission') || message.includes('NotAllowed')) {
            setError('دسترسی به دوربین رد شد. لطفاً دسترسی دوربین را فعال کنید.')
          } else if (message.includes('NotFound') || message.includes('DevicesNotFound')) {
            setError('دوربینی یافت نشد. از دستگاهی با دوربین استفاده کنید.')
          } else if (message.includes('NotReadable')) {
            setError('دوربین در حال استفاده توسط برنامه دیگری است.')
          } else if (message.includes('secure') || message.includes('https')) {
            setError('برای استفاده از دوربین، سایت باید با HTTPS باز شود.')
          } else {
            setError('خطا در راه‌اندازی دوربین: ' + message)
          }
          setStarting(false)
        }
      }
    }

    startScanner()

    return () => {
      isActive = false
      hasStartedRef.current = false
      stopScanner()
    }
  }, [open, onScan])

  const toggleTorch = async () => {
    try {
      const videoElement = document.querySelector(
        '#barcode-scanner-video video'
      ) as HTMLVideoElement | null
      if (!videoElement?.srcObject) return

      const tracks = (videoElement.srcObject as MediaStream).getVideoTracks()
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
        // ★ مهم: جلوگیری از بسته شدن با کلیک بیرون
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
              <h3 className="text-sm font-bold">اسکن بارکد با دوربین</h3>
              <p className="text-[10px] text-blue-100">
                EAN-13, Code-128, QR و...
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-4">
          {starting && !error && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-3" />
              <p className="text-sm text-gray-600">در حال راه‌اندازی دوربین...</p>
              <p className="text-[10px] text-gray-400 mt-1">
                لطفاً دسترسی دوربین را تأیید کنید
              </p>
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
                <div id="barcode-scanner-video" className="w-full" />

                                      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-[350px] h-[220px] max-w-[95%] border-2 border-blue-400 rounded-lg relative bg-blue-500/5 overflow-hidden">
                    <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-blue-500 rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-blue-500 rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-blue-500 rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-blue-500 rounded-br-lg" />
                    {/* ★ خط قرمز اسکن با انیمیشن */}
                    <div className="absolute inset-x-0 h-0.5 bg-red-500 shadow-lg shadow-red-500/50 scan-line-animation" />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 mt-4">
                <button
                  type="button"
                  onClick={toggleTorch}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-xs hover:bg-gray-50 cursor-pointer bg-white"
                >
                  {torchOn ? (
                    <FlashlightOff className="w-3.5 h-3.5" />
                  ) : (
                    <Flashlight className="w-3.5 h-3.5" />
                  )}
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

                                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-[11px] text-blue-800 font-bold mb-1.5 text-center">
                  📱 راهنمای اسکن موفق:
                </p>
                <ul className="text-[10px] text-blue-700 space-y-1 pr-4 list-disc">
                  <li>بارکد را <b>۲۰ تا ۳۰ سانتی‌متر</b> از دوربین نگه دارید</li>
                  <li>بارکد را <b>صاف و عمود</b> بر دوربین بگیرید</li>
                  <li><b>نور کافی</b> داشته باشید (کنار پنجره یا زیر چراغ)</li>
                  <li>از <b>لرزش دست</b> جلوگیری کنید</li>
                  <li>بارکد باید <b>کامل و خوانا</b> باشد (پاره یا محو نباشد)</li>
                </ul>
                <div className="mt-2 pt-2 border-t border-blue-200">
                  <p className="text-[10px] text-amber-700 font-medium">
                    💡 <b>نکته:</b> دوربین لپ‌تاپ ممکن است کیفیت کافی برای اسکن بارکدهای کوچک نداشته باشد.
                    اگر بارکد خوانده نشد، از <b>موبایل</b> یا <b>بارکدخوان فیزیکی</b> استفاده کنید.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
            </DialogContent>

      {/* ★ استایل انیمیشن خط اسکن */}
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