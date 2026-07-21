import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import crypto from 'crypto'

// ─── SMS.ir Configuration (جایگزین کاوه‌نگار) ────────────────
const SMSIR_API_KEY = process.env.SMSIR_API_KEY || ''
const SMSIR_LINE_NUMBER = process.env.SMSIR_LINE_NUMBER || ''
const SMSIR_TEMPLATE_ID = process.env.SMSIR_TEMPLATE_ID || ''
const OTP_LENGTH = 4
const OTP_EXPIRY_MINUTES = 2

// In-memory rate limiting
const otpRequests = new Map<string, { count: number; firstRequestAt: number }>()

// Clean up old entries every 10 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, value] of otpRequests.entries()) {
    if (now - value.firstRequestAt > 10 * 60 * 1000) {
      otpRequests.delete(key)
    }
  }
}, 10 * 60 * 1000)

function generateOTP(length: number): string {
  const digits = '0123456789'
  let otp = ''
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * 10)]
  }
  return otp
}

// ═══════════════════════════════════════════════════════════════
//  ارسال OTP از طریق SMS.ir
// ═══════════════════════════════════════════════════════════════
async function sendOTPViaSmsIr(mobile: string, code: string): Promise<{ success: boolean; message: string }> {
  // ─── Mock Mode: بدون API key کد رو لاگ می‌کنه ───
  if (!SMSIR_API_KEY) {
    console.log(`[OTP Mock Mode] کد تایید برای ${mobile}: ${code}`)
    return { success: true, message: 'mock' }
  }

  try {
    // ─── REST API مستقیم SMS.ir (بدون نیاز به پکیج) ───
    const requestBody: any = {
      mobile,
      parameters: [
        { name: 'Code', value: code },
      ],
    }

    // اگه templateId تنظیم شده، استفاده از الگو
    if (SMSIR_TEMPLATE_ID) {
      requestBody.templateId = parseInt(SMSIR_TEMPLATE_ID)
    }

    const response = await fetch('https://api.sms.ir/v1/send/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': SMSIR_API_KEY,
      },
      body: JSON.stringify(requestBody),
    })

    const data = await response.json()

    if (data.status === 1 || data.succeed === true || response.ok) {
      return { success: true, message: 'sent' }
    }

    console.error('[SMS.ir] API error:', JSON.stringify(data))
    return { success: false, message: data.message || data.errorMessage || 'خطای SMS.ir' }
  } catch (error: any) {
    console.error('[SMS.ir] Error:', error.message)
    return { success: false, message: 'خطا در ارتباط با SMS.ir' }
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { mobile, purpose, tenantId } = body

    if (!mobile) {
      return NextResponse.json(
        { success: false, error: 'شماره موبایل الزامی است' },
        { status: 400 }
      )
    }

    // Validate Iranian mobile format
    if (!/^09[0-9]{9}$/.test(mobile)) {
      return NextResponse.json(
        { success: false, error: 'فرمت شماره موبایل نامعتبر است (مثال: 09121234567)' },
        { status: 400 }
      )
    }

    const otpPurpose = purpose || 'login'
    if (!['Login', 'Register', 'login', 'register'].includes(otpPurpose)) {
      return NextResponse.json(
        { success: false, error: 'نوع درخواست نامعتبر است' },
        { status: 400 }
      )
    }

    // Rate limiting: max 3 per 10 minutes
    const now = Date.now()
    const record = otpRequests.get(mobile)

    if (record) {
      if (now - record.firstRequestAt > 10 * 60 * 1000) {
        otpRequests.set(mobile, { count: 1, firstRequestAt: now })
      } else if (record.count >= 3) {
        return NextResponse.json(
          { success: false, error: 'تعداد درخواست‌ها بیش از حد مجاز است. لطفاً ۱۰ دقیقه دیگر تلاش کنید' },
          { status: 429 }
        )
      } else {
        record.count++
      }
    } else {
      otpRequests.set(mobile, { count: 1, firstRequestAt: now })
    }

    // ★ استفاده از db.master بجای db مستقیم
    // OtpCode در دیتابیس مدیریتی (MasterDB) قرار داره
    const masterDb = db.master

    // تعیین tenantId — اگه از body نیومد، از اولین tenant فعال استفاده میشه
    let effectiveTenantId = tenantId
    if (!effectiveTenantId) {
      const firstTenant = await masterDb.tenant.findFirst({
        where: { status: 'active' },
        select: { id: true },
      })
      effectiveTenantId = firstTenant?.id || 'default'
    }

    // Check if there's a recent unused OTP (prevent spam - 1 minute cooldown)
    const recentOtp = await masterDb.otpCode.findFirst({
      where: {
        mobile,
        purpose: otpPurpose,
        isUsed: false,
        expiresAt: { gt: new Date(Date.now() - 60000) },
      },
      orderBy: { expiresAt: 'desc' },
    })

    if (recentOtp) {
      return NextResponse.json(
        { success: false, error: 'لطفاً یک دقیقه صبر کنید و سپس دوباره تلاش کنید' },
        { status: 429 }
      )
    }

    // Generate 4-digit OTP
    const code = generateOTP(OTP_LENGTH)
    const codeHash = crypto.createHash('sha256').update(code).digest('hex')
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)

    // Invalidate previous OTPs for this mobile/purpose
    await masterDb.otpCode.updateMany({
      where: { mobile, purpose: otpPurpose, isUsed: false },
      data: { isUsed: true },
    })

    // Store OTP in database
    // ★ ساختار مطابق مدل واقعی OtpCode در MasterDB:
    //   id (String), tenantId, mobile, code, purpose, isUsed, expiresAt
    //   + فیلدهای جدید: codeHash, attemptCount, ip
    await masterDb.otpCode.create({
      data: {
        id: `otp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        tenantId: effectiveTenantId,
        mobile,
        code,                                           // کد واقعی (برای backward compatibility)
        codeHash,                                       // هش SHA256 (امنیتی)
        purpose: otpPurpose,
        expiresAt,
        isUsed: false,
        attemptCount: 0,
        ip: request.headers.get('x-forwarded-for') || 'unknown',
      },
    })

    // ★ ارسال OTP از طریق SMS.ir (جایگزین کاوه‌نگار)
    const result = await sendOTPViaSmsIr(mobile, code)

    if (!result.success) {
      console.error('[OTP] Failed to send via SMS.ir:', result.message)
      return NextResponse.json(
        { success: false, error: 'خطا در ارسال پیامک: ' + result.message },
        { status: 500 }
      )
    }

    const responseData: Record<string, string> = {
      message: 'کد تایید ۴ رقمی به شماره موبایل شما ارسال شد',
    }

    // In mock mode (no API key), return the code for testing
    if (!SMSIR_API_KEY) {
      responseData._debugCode = code
    }

    return NextResponse.json({
      success: true,
      data: responseData,
    })
  } catch (error) {
    console.error('OTP request error:', error)
    return NextResponse.json(
      { success: false, error: 'خطای داخلی سرور' },
      { status: 500 }
    )
  }
}
