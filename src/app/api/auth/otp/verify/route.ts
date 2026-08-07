// ============================================================================
// src/app/api/auth/otp/verify/route.ts — POST /api/auth/otp/verify (v3.38 ★★★)
// ----------------------------------------------------------------------------
// ★★★ v3.38: پشتیبانی کامل از ورود مشتری (Customer) به پورتال
//   ★ ابتدا StoreUser جستجو می‌شود (پرسنل فروشگاه)
//   ★ اگر پیدا نشد، Customer جستجو می‌شود (مشتریان/طرف حساب‌ها)
//   ★ تولید portalToken برای مشتری در صورت نیاز
//   ★ ذخیره portal_token در کوکی برای پرداخت آنلاین
// ★★★ v3.37: پشتیبانی از کد ۶ رقمی (به‌جای ۴ رقمی)
// ============================================================================

import { NextResponse, NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  signTokenPair,
  setTokenCookie,
  setRefreshTokenCookie,
  type DecodedToken,  // ← این خط را اضافه کنید
} from '@/lib/jwt'
import crypto from 'crypto'

const MAX_ATTEMPTS = 5
// ★★★ v3.37: کد ۶ رقمی (به‌جای ۴)
const OTP_LENGTH = 6

// ═══════════════════════════════════════════════════════════════
//  توابع کمکی
// ═══════════════════════════════════════════════════════════════

function parsePermissions(permissions: string | null): string[] {
  if (!permissions) return []
  if (permissions.startsWith('[')) {
    try {
      const parsed = JSON.parse(permissions)
      if (Array.isArray(parsed)) return parsed
    } catch {}
  }
  if (permissions.trim() === 'all') return ['all']
  return permissions.split(',').map((p: string) => p.trim()).filter(Boolean)
}

async function resolvePlanName(masterDb: any, tenantId: string, fallbackPlan: string): Promise<string> {
  try {
    const subscription = await masterDb.subscriptions.findFirst({
      where: { tenantId, status: 'active' },
      include: { Plans: true },
      orderBy: { createdAt: 'desc' },
    })
    if (subscription?.Plans?.nameFa) return subscription.Plans.nameFa
    if (subscription?.Plans?.name) return subscription.Plans.name
  } catch (err: any) {
    console.warn('[OTP Verify] Failed to fetch subscription:', err?.message)
  }
  return fallbackPlan || 'free'
}

// ═══════════════════════════════════════════════════════════════
//  POST /api/auth/otp/verify
// ═══════════════════════════════════════════════════════════════
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { mobile, code, purpose } = body

    // ─── اعتبارسنجی ورودی‌ها ─────────────────────────────────
    if (!mobile || !code) {
      return NextResponse.json(
        { success: false, error: 'شماره موبایل و کد تایید الزامی است' },
        { status: 400 }
      )
    }

    // ★★★ v3.37: کد باید ۶ رقمی باشه
    if (String(code).length !== OTP_LENGTH) {
      return NextResponse.json(
        { success: false, error: `کد تایید باید ${OTP_LENGTH} رقمی باشد` },
        { status: 400 }
      )
    }

    const otpPurpose = (purpose || 'login').toLowerCase()

    const masterDb = db.master

    // ─── پیدا کردن آخرین OTP معتبر ───────────────────────────
    const otpRecord = await masterDb.otpCode.findFirst({
      where: {
        mobile,
        purpose: otpPurpose,
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { expiresAt: 'desc' },
    })

    if (!otpRecord) {
      return NextResponse.json(
        {
          success: false,
          error: 'کد تایید منقضی شده یا یافت نشد. لطفاً کد جدید درخواست کنید',
          errorCode: 'OTP_NOT_FOUND'
        },
        { status: 401 }
      )
    }

    // ─── بررسی تعداد تلاش‌ها ────────────────────────────────
    if (otpRecord.attemptCount >= MAX_ATTEMPTS) {
      await masterDb.otpCode.update({
        where: { id: otpRecord.id },
        data: { isUsed: true },
      })
      return NextResponse.json(
        {
          success: false,
          error: 'تعداد تلاش‌ها بیش از حد مجاز است. لطفاً کد جدید درخواست کنید',
          errorCode: 'OTP_MAX_ATTEMPTS'
        },
        { status: 429 }
      )
    }

    await masterDb.otpCode.update({
      where: { id: otpRecord.id },
      data: { attemptCount: { increment: 1 } },
    })

    // ─── بررسی صحت کد ───────────────────────────────────────
    const codeHash = crypto.createHash('sha256').update(String(code)).digest('hex')
    const isCodeValid =
      (otpRecord.codeHash && codeHash === otpRecord.codeHash) ||
      String(code) === otpRecord.code

    if (!isCodeValid) {
      const remainingAttempts = MAX_ATTEMPTS - otpRecord.attemptCount - 1
      return NextResponse.json(
        {
          success: false,
          error: `کد تایید اشتباه است (${remainingAttempts} تلاش باقیمانده)`,
          errorCode: 'OTP_INVALID'
        },
        { status: 401 }
      )
    }

    // ─── علامت‌گذاری OTP به‌عنوان استفاده‌شده ────────────────
    await masterDb.otpCode.update({
      where: { id: otpRecord.id },
      data: {
        isUsed: true,
        verifiedAt: new Date(),
      },
    })

    // ═══════════════════════════════════════════════════════════════
    //  حالت ۱: Login — پیدا کردن کاربر (StoreUser یا Customer)
    // ═══════════════════════════════════════════════════════════════
    if (otpPurpose === 'login') {
      let foundUser: any = null
      let foundCustomer: any = null
      let foundTenant: any = null
      let userType: 'storeUser' | 'portalUser' = 'storeUser'

      console.log('[OTP Verify] Searching user across tenants by mobile:', mobile)

      const tenants = await masterDb.tenant.findMany({
        where: { status: 'active' },
        select: {
          id: true,
          subDomain: true,
          companyName: true,
          status: true,
          planName: true,
          // ★★★ v3.37.5: isIsolated حذف شد (در schema واقعی وجود ندارد)
        },
      })

      // ═══════════════════════════════════════════════════════════
      //  مرحله ۱: جستجوی StoreUser (پرسنل فروشگاه)
      // ═══════════════════════════════════════════════════════════
      for (const t of tenants) {
        try {
          const tenantDb = await db.forTenant(t.id)
          const user = await tenantDb.storeUser.findFirst({
            where: { mobile, isActive: true },
            select: {
              id: true,
              username: true,
              role: true,
              mobile: true,
              permissions: true,
              storeId: true,
              storeName: true,
              tenantId: true,
              isActive: true,
            },
          })

          if (user) {
            foundUser = user
            foundTenant = t
            userType = 'storeUser'
            try {
              await tenantDb.storeUser.update({
                where: { id: user.id },
                data: { lastLoginAt: new Date() },
              })
            } catch {}
            break
          }
        } catch { /* ignore tenant errors */ }
      }

      // ═══════════════════════════════════════════════════════════
      //  مرحله ۲: ★★★ v3.38: اگر StoreUser پیدا نشد، Customer را جستجو کن
      // ═══════════════════════════════════════════════════════════
      if (!foundUser) {
        console.log('[OTP Verify] StoreUser not found, searching Customer...')
        for (const t of tenants) {
          try {
            const tenantDb = await db.forTenant(t.id)
            const customer = await tenantDb.customer.findFirst({
              where: {
                mobile,
                isBlacklisted: false,
              },
              select: {
                id: true,
                code: true,
                firstName: true,
                lastName: true,
                mobile: true,
                nationalCode: true,
                tenantId: true,
                currentBalance: true,
                creditLimit: true,
                portalToken: true,
              },
            })

            if (customer) {
              foundCustomer = customer
              foundTenant = t
              userType = 'portalUser'
              console.log('[OTP Verify] ✅ Customer found:', {
                id: customer.id,
                name: `${customer.firstName} ${customer.lastName}`,
                tenantId: t.id,
              })
              break
            }
          } catch { /* ignore tenant errors */ }
        }
      }

      // ─── بررسی نهایی ────────────────────────────────────────────
      if (!foundUser && !foundCustomer) {
        return NextResponse.json(
          {
            success: false,
            error: 'کاربری با این شماره موبایل یافت نشد. ابتدا ثبت‌نام کنید',
            errorCode: 'USER_NOT_FOUND'
          },
          { status: 401 }
        )
      }

      if (!foundTenant) {
        return NextResponse.json(
          {
            success: false,
            error: 'فروشگاه فعال یافت نشد',
            errorCode: 'TENANT_NOT_FOUND'
          },
          { status: 401 }
        )
      }

      const planName = await resolvePlanName(masterDb, foundTenant.id, foundTenant.planName)

      // ═══════════════════════════════════════════════════════════
      //  حالت A: ساخت توکن برای StoreUser (پرسنل فروشگاه)
      // ═══════════════════════════════════════════════════════════
      if (userType === 'storeUser' && foundUser) {
        const userPermissions = parsePermissions(foundUser.permissions)

        const tokenPayload = {
          userId: foundUser.id,
          tenantId: foundTenant.id,
          username: foundUser.username,
          role: foundUser.role,
          userType,
          permissions: userPermissions,
          storeId: foundUser.storeId || undefined,
          storeName: foundUser.storeName || foundTenant.companyName,
        }

        const tokenPair = signTokenPair(tokenPayload)

        const response = NextResponse.json({
          success: true,
          data: {
            token: tokenPair.accessToken,
            expiresIn: tokenPair.expiresIn,
            refreshToken: tokenPair.refreshToken,
            user: {
              id: foundUser.id,
              username: foundUser.username,
              role: foundUser.role,
              mobile: foundUser.mobile || mobile,
              tenantId: foundTenant.id,
              userType,
              permissions: userPermissions,
              storeId: foundUser.storeId || '',
              storeName: foundUser.storeName || foundTenant.companyName || '',
            },
            tenant: {
              id: foundTenant.id,
              subDomain: foundTenant.subDomain,
              companyName: foundTenant.companyName,
              planName,
              status: foundTenant.status,
              isIsolated: false, // ★★★ v3.37.5: isIsolated حذف شد از schema
            },
          },
        })

        setTokenCookie(response, tokenPair.accessToken)
        setRefreshTokenCookie(response, tokenPair.refreshToken)

        console.log('[OTP Verify] ✅ StoreUser login successful:', {
          userId: foundUser.id,
          tenantId: foundTenant.id,
          username: foundUser.username,
        })

        return response
      }

          // ═══════════════════════════════════════════════════════════
      //  حالت B: ★★★ v3.38: ساخت توکن برای Customer (پورتال مشتری)
      // ═══════════════════════════════════════════════════════════
      if (userType === 'portalUser' && foundCustomer) {
        // ─── تولید یا بازیابی portalToken ──────────────────────
        let portalToken = foundCustomer.portalToken
        if (!portalToken) {
          portalToken = crypto.randomBytes(32).toString('hex')
          try {
            const tenantDb = await db.forTenant(foundTenant.id)
            await tenantDb.customer.update({
              where: { id: foundCustomer.id },
              data: { portalToken },
            })
            console.log('[OTP Verify] Generated new portal token for customer:', foundCustomer.id)
          } catch (err: any) {
            console.warn('[OTP Verify] Failed to save portal token:', err?.message)
          }
        }

        // ─── ساخت Payload توکن برای مشتری ─────────────────────
        // ★★★ v3.38: استفاده از type annotation برای جلوگیری از خطای TypeScript
        const tokenPayload: Omit<DecodedToken, 'iat' | 'exp'> = {
          customerId: foundCustomer.id,
          tenantId: foundTenant.id,
          firstName: foundCustomer.firstName,
          lastName: foundCustomer.lastName,
          mobile: foundCustomer.mobile,
          userType: 'portalUser' as const,  // ← اصلاح شد: اضافه شدن as const
          portalToken,
        }

        const tokenPair = signTokenPair(tokenPayload)

        const response = NextResponse.json({
          success: true,
          data: {
            token: tokenPair.accessToken,
            expiresIn: tokenPair.expiresIn,
            refreshToken: tokenPair.refreshToken,
            // ★★★ v3.38: برای مشتری از فیلد customer استفاده می‌کنیم
            user: {
              id: foundCustomer.id,
              customerId: foundCustomer.id,
              firstName: foundCustomer.firstName,
              lastName: foundCustomer.lastName,
              mobile: foundCustomer.mobile || mobile,
              tenantId: foundTenant.id,
              userType: 'portalUser',
              currentBalance: foundCustomer.currentBalance?.toString() || '0',
              creditLimit: foundCustomer.creditLimit?.toString() || '0',
              portalToken: portalToken,
            },
            tenant: {
              id: foundTenant.id,
              subDomain: foundTenant.subDomain,
              companyName: foundTenant.companyName,
              planName,
              status: foundTenant.status,
              isIsolated: false, // ★★★ v3.37.5: isIsolated حذف شد از schema
            },
          },
        })

        // ★★★ v3.38: ذخیره portal_token در کوکی برای استفاده در پرداخت
        response.cookies.set('portal_token', portalToken, {
          httpOnly: false,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 30, // 30 days
          path: '/',
        })

        setTokenCookie(response, tokenPair.accessToken)
        setRefreshTokenCookie(response, tokenPair.refreshToken)

        console.log('[OTP Verify] ✅ Customer (Portal) login successful:', {
          customerId: foundCustomer.id,
          tenantId: foundTenant.id,
          name: `${foundCustomer.firstName} ${foundCustomer.lastName}`,
          mobile: foundCustomer.mobile,
        })

        return response
      }

      // ─── حالت غیرمنتظره ─────────────────────────────────────────
      return NextResponse.json(
        {
          success: false,
          error: 'خطای غیرمنتظره در احراز هویت',
          errorCode: 'UNEXPECTED_ERROR'
        },
        { status: 500 }
      )
    }

    // ═══════════════════════════════════════════════════════════════
    //  حالت ۲: Register — فقط تأیید کد (بدون ساخت توکن)
    // ═══════════════════════════════════════════════════════════════
    return NextResponse.json({
      success: true,
      data: {
        message: 'کد تایید صحیح است',
        verified: true,
        mobile,
      },
    })
  } catch (error: any) {
    console.error('[OTP Verify] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'خطای داخلی سرور',
        errorCode: 'INTERNAL_ERROR'
      },
      { status: 500 }
    )
  }
}