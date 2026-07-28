// ============================================================================
// src/app/api/portal/login/route.ts — POST (v3.39 ★★★)
// ShopAccounting — Customer Portal Login with IPPanel OTP
// ----------------------------------------------------------------------------
// ★★★ v3.39: مهاجرت از SMS.ir به IPPanel (همان سیستم ورود اصلی)
// ★ ارسال کد ۶ رقمی از طریق IPPanel
// ★ fallback به mock mode اگر IPPanel در دسترس نباشد
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import jwt from 'jsonwebtoken'
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

      // ★ ساخت JWT پورتال
      const portalToken = jwt.sign(
        {
          type: 'portal',
          customerId: customer.id,
          tenantId: customer.tenantId,
          mobile: customer.mobile,
        },
        process.env.JWT_SECRET || 'shopaccounting-secret',
        { expiresIn: '24h' }
      )

      return NextResponse.json({
        success: true,
        data: {
          portalToken,
          customer: {
            id: customer.id,
            name: `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
            mobile: customer.mobile,
          },
          store: {
            name: 'فروشگاه',
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
