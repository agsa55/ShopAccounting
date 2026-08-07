// ============================================================================
// src/app/api/portal/login/route.ts — POST (v3.46 ★★★)
// ShopAccounting — Customer Portal Login with IPPanel OTP
// ----------------------------------------------------------------------------
// ★★★ v3.46: اصلاح حالت verify
//   - استفاده از customer.portalToken از دیتابیس (به جای تولید JWT)
//   - تولید portalToken جدید اگر در دیتابیس نبود
//   - دریافت storeName از Tenant یا StoreSetting
// ★★★ v3.39: مهاجرت از SMS.ir به IPPanel (همان سیستم ورود اصلی)
// ★ ارسال کد ۶ رقمی از طریق IPPanel
// ★ fallback به mock mode اگر IPPanel در دسترس نباشد
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import crypto from 'crypto'
import { sendOtpViaIpPanel, generateOtpCode } from '@/lib/sms/ippanel'

// ─── تنظیمات OTP ────────────────────────────────────────────
const OTP_LENGTH = 6
const OTP_EXPIRY_MINUTES = 2
const COOLDOWN_SECONDS = 60

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { token, mobile, action } = body

    // ─── اعتبارسنجی توکن پورتال ─────────────────────────────
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'توکن پورتال الزامی است' },
        { status: 400 }
      )
    }

    // ★ پیدا کردن مشتری با portalToken
    const customer = await db.client.customer.findFirst({
      where: { portalToken: token },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        mobile: true,
        tenantId: true,
        portalToken: true,
      },
    })

    if (!customer) {
      return NextResponse.json(
        { success: false, error: 'لینک پورتال نامعتبر است' },
        { status: 404 }
      )
    }

    // ─── حالت SEND: ارسال کد ─────────────────────────────────
    if (action === 'send') {
      if (!mobile || !/^09[0-9]{9}$/.test(mobile)) {
        return NextResponse.json(
          { success: false, error: 'شماره موبایل نامعتبر است (فرمت: 09123456789)' },
          { status: 400 }
        )
      }

      // ★ بررسی تطابق شماره موبایل
      if (mobile !== customer.mobile) {
        return NextResponse.json(
          { success: false, error: 'شماره موبایل با مشتری مطابقت ندارد' },
          { status: 403 }
        )
      }

      // ★ Cooldown check
      const recentOtp = await db.client.otpCode.findFirst({
        where: {
          mobile,
          purpose: 'portal',
          isUsed: false,
          expiresAt: { gt: new Date(Date.now() - COOLDOWN_SECONDS * 1000) },
        },
        orderBy: { expiresAt: 'desc' },
      })

      if (recentOtp) {
        return NextResponse.json(
          { success: false, error: 'لطفاً یک دقیقه صبر کنید و سپس دوباره تلاش کنید' },
          { status: 429 }
        )
      }

      // ★ تولید کد ۶ رقمی
      const code = generateOtpCode(OTP_LENGTH)
      const codeHash = crypto.createHash('sha256').update(code).digest('hex')
      const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)

      // ★ غیرفعال‌سازی کدهای قبلی
      await db.client.otpCode.updateMany({
        where: { mobile, purpose: 'portal', isUsed: false },
        data: { isUsed: true },
      })

      // ★ ذخیره در دیتابیس
      await db.client.otpCode.create({
        data: {
          id: `otp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          tenantId: customer.tenantId,
          mobile,
          code,
          codeHash,
          purpose: 'portal',
          expiresAt,
          isUsed: false,
          attemptCount: 0,
          ip: req.headers.get('x-forwarded-for') || 'unknown',
        },
      })

      // ★ ارسال از طریق IPPanel
      const result = await sendOtpViaIpPanel(mobile, code)

      if (!result.success) {
        console.error('[Portal Login] Failed to send OTP:', result.message)

        const isDev = process.env.NODE_ENV !== 'production'
        return NextResponse.json({
          success: false,
          error: 'خطا در ارسال پیامک',
          ...(isDev ? { _debugCode: code, _debugMessage: result.message } : {}),
        }, { status: 500 })
      }

      const isDevPreview = result.devPreview === true
      const responseData: Record<string, string> = {
        message: isDevPreview
          ? '[حالت تست] کد در پایین صفحه نمایش داده شد'
          : 'کد تأیید ۶ رقمی به شماره موبایل شما ارسال شد',
      }

      if (isDevPreview) {
        responseData._debugCode = code
        responseData._devPreview = 'true'
      }

      return NextResponse.json({
        success: true,
        data: responseData,
      })
    }

    // ─── حالت VERIFY: تأیید کد ───────────────────────────────
    if (action === 'verify') {
      if (!mobile || !body.code) {
        return NextResponse.json(
          { success: false, error: 'شماره موبایل و کد تأیید الزامی است' },
          { status: 400 }
        )
      }

      if (String(body.code).length !== OTP_LENGTH) {
        return NextResponse.json(
          { success: false, error: `کد تأیید باید ${OTP_LENGTH} رقمی باشد` },
          { status: 400 }
        )
      }

      // ★ پیدا کردن آخرین کد معتبر
      const otpRecord = await db.client.otpCode.findFirst({
        where: {
          mobile,
          purpose: 'portal',
          isUsed: false,
          expiresAt: { gt: new Date() },
        },
        orderBy: { expiresAt: 'desc' },
      })

      if (!otpRecord) {
        return NextResponse.json(
          { success: false, error: 'کد تأیید منقضی شده یا یافت نشد' },
          { status: 401 }
        )
      }

      // ★ بررسی تعداد تلاش
      if (otpRecord.attemptCount >= 5) {
        await db.client.otpCode.update({
          where: { id: otpRecord.id },
          data: { isUsed: true },
        })
        return NextResponse.json(
          { success: false, error: 'تعداد تلاش‌ها بیش از حد مجاز است' },
          { status: 429 }
        )
      }

      await db.client.otpCode.update({
        where: { id: otpRecord.id },
        data: { attemptCount: { increment: 1 } },
      })

      // ★ بررسی صحت کد
      const codeHash = crypto.createHash('sha256').update(String(body.code)).digest('hex')
      const isCodeValid =
        (otpRecord.codeHash && codeHash === otpRecord.codeHash) ||
        String(body.code) === otpRecord.code

      if (!isCodeValid) {
        return NextResponse.json(
          { success: false, error: 'کد تأیید اشتباه است' },
          { status: 401 }
        )
      }

      // ★ علامت‌گذاری به‌عنوان استفاده‌شده
      await db.client.otpCode.update({
        where: { id: otpRecord.id },
        data: { isUsed: true, verifiedAt: new Date() },
      })

      // ═══════════════════════════════════════════════════════════════
      // ★★★ v3.46: استفاده از portalToken از دیتابیس (به جای JWT)
      // ═══════════════════════════════════════════════════════════════
      let portalToken = customer.portalToken

      // اگر portalToken در دیتابیس نبود، یکی جدید تولید و ذخیره کن
      if (!portalToken) {
        portalToken = crypto.randomBytes(32).toString('hex')
        try {
          await db.client.customer.update({
            where: { id: customer.id },
            data: { portalToken },
          })
          console.log('[Portal Login] ✅ Generated new portalToken for customer:', customer.id)
        } catch (err: any) {
          console.error('[Portal Login] ❌ Failed to save portalToken:', err?.message)
        }
      } else {
        console.log('[Portal Login] ✅ Using existing portalToken from database')
      }

      // ═══════════════════════════════════════════════════════════════
      // ★★★ v3.46: دریافت storeName از Tenant یا StoreSetting
      // ═══════════════════════════════════════════════════════════════
      let storeName = 'فروشگاه'
      try {
        const tenant = await db.client.tenant.findUnique({
          where: { id: customer.tenantId },
          select: { companyName: true },
        })
        if (tenant?.companyName) {
          storeName = tenant.companyName
        } else {
          const storeSetting = await db.client.storeSetting.findFirst({
            where: { tenantId: customer.tenantId },
            select: { storeName: true },
          })
          if (storeSetting?.storeName) {
            storeName = storeSetting.storeName
          }
        }
      } catch (err: any) {
        console.warn('[Portal Login] ⚠️ Failed to get store name:', err?.message)
      }

      console.log('[Portal Login] ✅ Verify successful:', {
        customerId: customer.id,
        customerName: `${customer.firstName} ${customer.lastName}`.trim(),
        storeName,
        portalTokenLength: portalToken?.length,
      })

      return NextResponse.json({
        success: true,
        data: {
          portalToken,  // ★★★ v3.46: portalToken از دیتابیس (نه JWT)
          customer: {
            id: customer.id,
            name: `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
            mobile: customer.mobile,
          },
          store: {
            name: storeName,
          },
        },
      })
    }

    return NextResponse.json(
      { success: false, error: 'action نامعتبر است (send یا verify)' },
      { status: 400 }
    )
  } catch (error: any) {
    console.error('[Portal Login] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطای داخلی سرور' },
      { status: 500 }
    )
  }
}