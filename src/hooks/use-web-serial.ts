'use client'

// ============================================================================
// src/hooks/use-web-serial.ts
// Hook هوشمند اتصال به کارتخوان از طریق Web Serial API
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react'

export interface WebSerialState {
  isSupported: boolean
  isConnected: boolean
  isConnecting: boolean
  deviceInfo: string | null
  error: string | null
}

export interface TransactionResult {
  success: boolean
  referenceNumber?: string
  traceNumber?: string
  cardNumber?: string
  rrn?: string
  message?: string
}

export function useWebSerial() {
  const [state, setState] = useState<WebSerialState>({
    isSupported: false,
    isConnected: false,
    isConnecting: false,
    deviceInfo: null,
    error: null,
  })

  const portRef = useRef<any>(null)
  const readerRef = useRef<any>(null)
  const writerRef = useRef<any>(null)

  // بررسی پشتیبانی مرورگر
  useEffect(() => {
    const supported = 'serial' in navigator
    setState((prev) => ({ ...prev, isSupported: supported }))
    
    if (!supported) {
      console.warn('[WebSerial] مرورگر شما از Web Serial API پشتیبانی نمی‌کند')
    }
  }, [])

  // پاک‌سازی هنگام unmount
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [])

  // ═══════════════════════════════════════════════════════════════
  //  اتصال به کارتخوان
  // ═══════════════════════════════════════════════════════════════
  const connect = useCallback(async () => {
    if (!state.isSupported) {
      setState((prev) => ({ ...prev, error: 'مرورگر شما از Web Serial API پشتیبانی نمی‌کند. لطفاً از Chrome یا Edge استفاده کنید.' }))
      return false
    }

    setState((prev) => ({ ...prev, isConnecting: true, error: null }))

    try {
      // ۱. درخواست دسترسی از کاربر
      const port = await (navigator as any).serial.requestPort()
      portRef.current = port

      // ۲. باز کردن پورت (تنظیمات استاندارد Pax)
      await port.open({
        baudRate: 115200,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none',
      })

      // ۳. ایجاد reader و writer
      const textDecoder = new TextDecoderStream()
      const readableStreamClosed = port.readable.pipeTo(textDecoder.writable)
      readerRef.current = textDecoder.readable.getReader()

      const textEncoder = new TextEncoderStream()
      const writableStreamClosed = textEncoder.readable.pipeTo(port.writable)
      writerRef.current = textEncoder.writable.getWriter()

      // ۴. Handshake - شناسایی دستگاه
      const deviceInfo = await performHandshake()

      setState((prev) => ({
        ...prev,
        isConnected: true,
        isConnecting: false,
        deviceInfo: deviceInfo,
        error: null,
      }))

      console.log('[WebSerial] ✅ اتصال موفق:', deviceInfo)
      return true

    } catch (error: any) {
      console.error('[WebSerial] ❌ خطا در اتصال:', error)
      
      let errorMessage = 'خطا در اتصال به کارتخوان'
      if (error.name === 'NotFoundError') {
        errorMessage = 'هیچ دستگاهی انتخاب نشد'
      } else if (error.name === 'SecurityError') {
        errorMessage = 'دسترسی به دستگاه رد شد'
      } else if (error.message) {
        errorMessage = error.message
      }

      setState((prev) => ({
        ...prev,
        isConnected: false,
        isConnecting: false,
        error: errorMessage,
      }))
      return false
    }
  }, [state.isSupported])

  // ═══════════════════════════════════════════════════════════════
  //  Handshake - شناسایی دستگاه
  // ═══════════════════════════════════════════════════════════════
  const performHandshake = async (): Promise<string> => {
    if (!writerRef.current || !readerRef.current) {
      throw new Error('پورت باز نیست')
    }

    try {
      // ارسال فرمان GET VERSION (پروتکل Pax)
      const cmd = 'A01\r\n'
      await writerRef.current.write(cmd)

      // خواندن پاسخ (با timeout)
      const response = await readResponse(3000)
      
      if (response && response.length > 0) {
        return `Pax ${response.substring(0, 20)}`
      }
      
      return 'Pax (مدل ناشناخته)'
    } catch (error) {
      console.warn('[WebSerial] Handshake failed, assuming connected')
      return 'کارتخوان متصل'
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  خواندن پاسخ از دستگاه (با timeout)
  // ═══════════════════════════════════════════════════════════════
  const readResponse = async (timeoutMs: number = 5000): Promise<string> => {
    if (!readerRef.current) return ''

    const startTime = Date.now()
    let response = ''

    while (Date.now() - startTime < timeoutMs) {
      try {
        const { value, done } = await Promise.race([
          readerRef.current.read(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), timeoutMs)
          ),
        ])

        if (done) break
        if (value) {
          response += value
          // اگر پاسخ کامل است (ends with \r\n)، برگردان
          if (response.includes('\r\n')) {
            break
          }
        }
      } catch (error) {
        break
      }
    }

    return response
  }

  // ═══════════════════════════════════════════════════════════════
  //  ارسال مبلغ به کارتخوان
  // ═══════════════════════════════════════════════════════════════
  const sendAmount = useCallback(async (amount: number): Promise<TransactionResult> => {
    if (!state.isConnected || !writerRef.current) {
      return {
        success: false,
        message: 'کارتخوان متصل نیست',
      }
    }

    try {
      // فرمت مبلغ (تبدیل به ریال - ۱۲ رقم با padding)
      const amountInRials = Math.round(amount)
      const amountStr = String(amountInRials).padStart(12, '0')

      // پروتکل Pax: A02 + مبلغ + \r\n
      const cmd = `A02${amountStr}\r\n`
      
      console.log('[WebSerial] ارسال مبلغ:', amountInRials, 'ریال')
      await writerRef.current.write(cmd)

      // خواندن پاسخ (منتظر تأیید کاربر)
      const response = await readResponse(120000) // ۲ دقیقه timeout (کاربر رمز می‌زند)

      // تحلیل پاسخ
      if (response.includes('00')) {
        // تراکنش موفق
        return {
          success: true,
          referenceNumber: extractField(response, 4, 6),
          traceNumber: extractField(response, 10, 6),
          rrn: extractField(response, 16, 12),
          cardNumber: maskCardNumber(extractField(response, 28, 19)),
          message: 'تراکنش موفق',
        }
      } else {
        // تراکنش ناموفق
        const errorCode = response.substring(0, 2)
        return {
          success: false,
          message: `تراکنش ناموفق (کد خطا: ${errorCode})`,
        }
      }

    } catch (error: any) {
      console.error('[WebSerial] خطا در ارسال مبلغ:', error)
      return {
        success: false,
        message: error.message || 'خطا در ارتباط با کارتخوان',
      }
    }
  }, [state.isConnected])

  // ═══════════════════════════════════════════════════════════════
  //  توابع کمکی
  // ═══════════════════════════════════════════════════════════════
  const extractField = (response: string, start: number, length: number): string => {
    return response.substring(start, start + length).trim()
  }

  const maskCardNumber = (cardNumber: string): string => {
    if (cardNumber.length < 8) return cardNumber
    return cardNumber.substring(0, 6) + '****' + cardNumber.substring(cardNumber.length - 4)
  }

  // ═══════════════════════════════════════════════════════════════
  //  قطع اتصال
  // ═══════════════════════════════════════════════════════════════
  const disconnect = useCallback(async () => {
    try {
      if (readerRef.current) {
        await readerRef.current.cancel()
        readerRef.current = null
      }
      if (writerRef.current) {
        await writerRef.current.close()
        writerRef.current = null
      }
      if (portRef.current) {
        await portRef.current.close()
        portRef.current = null
      }

      setState((prev) => ({
        ...prev,
        isConnected: false,
        deviceInfo: null,
      }))

      console.log('[WebSerial] 🔌 اتصال قطع شد')
    } catch (error) {
      console.error('[WebSerial] خطا در قطع اتصال:', error)
    }
  }, [])

  return {
    ...state,
    connect,
    disconnect,
    sendAmount,
  }
}