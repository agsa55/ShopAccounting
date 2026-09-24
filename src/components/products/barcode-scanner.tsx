'use client'

// ============================================================================
// src/components/products/barcode-scanner.tsx — v11.0 (نهایی با ZXing)
// ★ استفاده از ZXing Browser (دقیق‌ترین کتابخانه اسکن بارکد)
// ★ پشتیبانی از همه بارکدها: EAN-13, Code-128, QR و...
// ============================================================================

import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { Camera, Loader2, AlertCircle } from 'lucide-react'
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
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)
  const hasStartedRef = useRef(false)
  const scannedRef = useRef(false)

  const [error, setError] = useState('')
  const [starting, setStarting] = useState(true)

  useEffect(() => {
    if (open) {
      hasStartedRef.current = false
      scannedRef.current = false
      setError('')
      setStarting(true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    if (hasStartedRef.current) return
    hasStartedRef.current = true

    let isActive = true

    const startScanner = async () => {
      await new Promise((r) => setTimeout(r, 150))
      if (!isActive) return

      try {
        const reader = new BrowserMultiFormatReader()
        readerRef.current = reader

        // درخواست دسترسی دوربین
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        })

        if (!isActive) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }

        setStarting(false)

        // شروع اسکن مداوم
        reader.decodeFromVideoDevice(undefined, videoRef.current!, (result, error) => {
          if (!isActive || scannedRef.current) return
          
          if (result) {
            scannedRef.current = true
            const barcode = result.getText()
            if (navigator.vibrate) navigator.vibrate(200)
            
            // توقف اسکنر
            if (readerRef.current) {
              try { readerRef.current.reset() } catch {}
            }
            stream.getTracks().forEach((t) => t.stop())
            
            onScan(barcode)
          }
        })
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

    startScanner()

    return () => {
      isActive = false
      hasStartedRef.current = false
      if (readerRef.current) {
        try { readerRef.current.reset() } catch {}
        readerRef.current = null
      }
    }
  }, [open, onScan])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-sm w-[calc(100%-2rem)] p-0 overflow-hidden border-0 bg-white"
        dir="rtl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-l from-blue-600 to-indigo-600 text-white">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4" />
            <h3 className="text-sm font-bold">اسکن بارکد</h3>
          </div>
          {!starting && !error && (
            <span className="text-[9px] bg-white/20 px-2 py-0.5 rounded-full">
              ZXing
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
              <div className="relative rounded-lg overflow-hidden bg-black">
                <video
                  ref={videoRef}
                  className="w-full max-h-[300px] object-cover"
                  playsInline
                  muted
                  autoPlay
                />

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

              <div className="flex items-center justify-center gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="px-4 py-2 rounded-lg text-xs hover:bg-gray-100 cursor-pointer border border-gray-300"
                >
                  انصراف
                </button>
              </div>

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