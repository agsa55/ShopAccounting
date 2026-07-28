// ============================================================================
// src/app/api/payments/online/request/route.ts — POST (v8.2 ★★★)
// ShopAccounting — Online Payment Request (Zarinpal تسهیم فردایی)
// ----------------------------------------------------------------------------
// ★★★ v8.2 تغییرات حیاتی:
//   ✓ پشتیبانی کامل از wages array برای تسهیم فردایی
//   ✓ محاسبه خودکار سهم پلتفرم و سهم فروشگاه
//   ✓ ذخیره wagesConfig در OnlinePayment برای ممیزی
//   ✓ استفاده از شبا پلتفرم از env (PLATFORM_IBAN)
//   ✓ اعتبارسنجی شبا با ماژول validateIban
//   ✓ سازگار با پرداخت قسط‌به‌قسط (installmentId)
//   ✓ سازگار با نسخه‌های قبلی Prisma Client (runtime field detection)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getFeaturesByPlanName } from '@/lib/plan-features'
import { db } from '@/lib/db'
import {
  calculateTashim,
  validateIban,
  getZarinpalUrls,
} from '@/lib/zarinpal/tashim'

// ═══════════════════════════════════════════════════════════════
//  POST — درخواست پرداخت آنلاین با تسهیم فردایی
// ═══════════════════════════════════════════════════════════════

export const POST = withTenantAndPermission('pos')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    console.log('[OnlinePayment Request v8.2] Handler started, tenantId:', tenant?.tenantId)
    try {
      // ★ بررسی پلن
      const features = getFeaturesByPlanName(tenant.planTierName)
      if (!features.canOnlinePayment) {
        return NextResponse.json(
          { success: false, error: 'درگاه پرداخت آنلاین در پلن شما در دسترس نیست' },
          { status: 403 }
        )
      }

      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId
      const body = await req.json()
      const { invoiceId, installmentId } = body

      if (!invoiceId) {
        return NextResponse.json(
          { success: false, error: 'شناسه فاکتور الزامی است' },
          { status: 400 }
        )
      }

      // ─── ۱. دریافت فاکتور ─────────────────────────────────────
      const invoice = await tenantDb.invoice.findFirst({
        where: { id: invoiceId, tenantId },
        select: {
          id: true,
          number: true,
          totalAmount: true,
          paidAmount: true,
          remainingAmount: true,
          status: true,
          customerId: true,
          paymentType: true,
        },
      })

      if (!invoice) {
        return NextResponse.json(
          { success: false, error: 'فاکتور یافت نشد' },
          { status: 404 }
        )
      }

      // ─── ۱.۲ اعتبارسنجی کاربر پورتال ─────────────────────────
      if (tenant.isPortalUser) {
        const portalCustomerId = tenant.customerId
        if (!portalCustomerId) {
          return NextResponse.json(
            { success: false, error: 'شناسه مشتری در توکن پورتال یافت نشد', code: 'NO_CUSTOMER_ID' },
            { status: 403 }
          )
        }

        if (invoice.customerId !== portalCustomerId) {
          console.warn('[OnlinePayment Request] Portal user tried to pay another customer invoice:', {
            portalCustomerId,
            invoiceCustomerId: invoice.customerId,
            invoiceId,
          })
          return NextResponse.json(
            { success: false, error: 'این فاکتور متعلق به شما نیست', code: 'NOT_YOUR_INVOICE' },
            { status: 403 }
          )
        }

        if (tenant.user?.isBlacklisted) {
          return NextResponse.json(
            { success: false, error: 'حساب شما مسدود شده است. با فروشگاه تماس بگیرید.', code: 'CUSTOMER_BLACKLISTED' },
            { status: 403 }
          )
        }
      }

      // ─── ۱.۵ پرداخت قسط خاص یا کل باقی‌مانده ───────────────────
      let amount = 0
      let installmentSchedule: any = null
      let paymentDescription = `پرداخت فاکتور ${invoice.number}`

      if (installmentId) {
        installmentSchedule = await tenantDb.installmentSchedule.findFirst({
          where: {
            id: installmentId,
            tenantId,
            plan: { invoiceId },
          },
          include: {
            plan: { select: { id: true, numberOfInstallments: true, installmentAmount: true } },
          },
        })

        if (!installmentSchedule) {
          return NextResponse.json(
            { success: false, error: 'قسط یافت نشد یا به این فاکتور تعلق ندارد' },
            { status: 404 }
          )
        }

        const schedStatus = (installmentSchedule.status || '').toLowerCase()
        if (schedStatus === 'paid' || schedStatus === 'completed') {
          return NextResponse.json(
            { success: false, error: 'این قسط قبلاً پرداخت شده است' },
            { status: 400 }
          )
        }

        const fullAmount = Number(installmentSchedule.amount) || 0
        const alreadyPaid = Number(installmentSchedule.paidAmount) || 0
        amount = fullAmount - alreadyPaid

        if (amount <= 0) {
          return NextResponse.json(
            { success: false, error: 'مبلغ باقی‌مانده این قسط صفر است' },
            { status: 400 }
          )
        }

        paymentDescription = `پرداخت قسط ${installmentSchedule.installmentNumber} از فاکتور ${invoice.number}`

        console.log('[OnlinePayment Request] Installment payment:', {
          installmentId,
          installmentNumber: installmentSchedule.installmentNumber,
          fullAmount,
          alreadyPaid,
          amountToPay: amount,
        })
      } else {
        amount = Number(invoice.remainingAmount) || 0

        if (amount <= 0) {
          return NextResponse.json(
            { success: false, error: 'مبلغ باقی‌مانده فاکتور صفر است' },
            { status: 400 }
          )
        }
      }

      // ─── ۲. دریافت تنظیمات فروشگاه (شبا + کارمزد پلتفرم) ─────
      let storeSettings: any = null
      try {
        storeSettings = await tenantDb.storeSetting.findFirst({
          where: { tenantId },
        })
      } catch {
        // ignore
      }

      const bankIban = storeSettings?.bankIban
      const ibanValidation = bankIban ? validateIban(bankIban) : null
      if (!ibanValidation || !ibanValidation.valid) {
        return NextResponse.json(
          {
            success: false,
            error: 'شماره شبا فروشگاه تنظیم نشده یا نامعتبر است. لطفاً در تنظیمات → درگاه پرداخت، شماره شبا را وارد کنید.',
            details: ibanValidation?.error,
          },
          { status: 400 }
        )
      }
      const normalizedMerchantIban = ibanValidation.normalized

      // ─── ۳. دریافت مرچنت کد و شبا پلتفرم از ENV ──────────────
      const merchantId = process.env.ZARINPAL_MERCHANT_ID
      if (!merchantId) {
        return NextResponse.json(
          {
            success: false,
            error: 'درگاه پرداخت پلتفرم تنظیم نشده است. لطفاً با پشتیبانی تماس بگیرید.',
          },
          { status: 500 }
        )
      }

      const platformIban = process.env.PLATFORM_IBAN
      if (!platformIban) {
        console.error('[OnlinePayment Request] PLATFORM_IBAN env var not set')
        return NextResponse.json(
          {
            success: false,
            error: 'تنظیمات تسهیم پلتفرم کامل نیست. لطفاً با پشتیبانی تماس بگیرید.',
          },
          { status: 500 }
        )
      }

      const platformIbanValidation = validateIban(platformIban)
      if (!platformIbanValidation.valid) {
        console.error('[OnlinePayment Request] PLATFORM_IBAN invalid:', platformIbanValidation.error)
        return NextResponse.json(
          { success: false, error: 'تنظیمات شبا پلتفرم نامعتبر است' },
          { status: 500 }
        )
      }

      // ★ تنظیمات کارمزد پلتفرم (از StoreSetting یا پیش‌فرض)
      const platformCommissionRate = Number(storeSettings?.platformCommissionRate) || 1.0
      const platformCommissionFixed = Number(storeSettings?.platformCommissionFixed) || 0

      // ★ تعیین Sandbox یا Production
      const isSandbox = process.env.ZARINPAL_SANDBOX === 'true'
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin
      const zarinpalUrls = getZarinpalUrls(isSandbox)

      // ★ ساخت callback URL
      let callbackUrl = `${baseUrl}/api/payments/online/verify?invoiceId=${invoiceId}&tenantId=${tenantId}`
      if (installmentId) {
        callbackUrl += `&installmentId=${installmentId}`
      }

      // ─── ۴. محاسبه تسهیم فردایی ★★★ ──────────────────────────
      const tashim = calculateTashim({
        amount,
        merchantIban: normalizedMerchantIban,
        platformIban: platformIbanValidation.normalized,
        platformCommissionRate,
        platformCommissionFixed,
        description: paymentDescription,
      })

      console.log('[OnlinePayment Request v8.2] Tashim calculation:', {
        amount,
        platformCommission: tashim.platformCommission,
        merchantWage: tashim.merchantWage,
        estimatedGatewayFee: tashim.estimatedGatewayFee,
        estimatedNetToMerchant: tashim.estimatedNetToMerchant,
        wagesCount: tashim.wages.length,
        sandbox: isSandbox,
        installmentId: installmentId || null,
      })

      // ─── ۵. ارسال درخواست به زرین‌پال با wages array ──────────
      const requestBody: any = {
        merchant_id: merchantId,
        amount: Math.round(amount),
        currency: 'IRR',
        description: paymentDescription,
        callback_url: callbackUrl,
      }

      // ★★★ v8.2: ارسال wages array برای تسهیم فردایی
      //   ★ در sandbox، wages ممکن است پشتیبانی نشود — فقط در production فعال است
      if (!isSandbox && tashim.wages.length > 0) {
        requestBody.wages = tashim.wages
        console.log('[OnlinePayment Request v8.2] Sending wages array:', tashim.wages)
      } else if (isSandbox) {
        console.log('[OnlinePayment Request v8.2] Sandbox mode — wages array skipped (not supported in sandbox)')
      }

      // ★ additional_data برای شبا فروشگاه (در صورت نیاز)
      if (!isSandbox) {
        requestBody.additional_data = JSON.stringify({
          iban: normalizedMerchantIban,
        })
      }

      const zarinpalResponse = await fetch(zarinpalUrls.request, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      const zarinpalData = await zarinpalResponse.json()

      console.log('[OnlinePayment Request v8.2] Zarinpal response:', zarinpalData)

      if (!zarinpalData?.data?.authority) {
        return NextResponse.json(
          {
            success: false,
            error: 'خطا در ارتباط با درگاه زرین‌پال',
            details: zarinpalData?.errors || 'پاسخ نامعتبر از درگاه',
          },
          { status: 500 }
        )
      }

      const authority = zarinpalData.data.authority

      // ─── ۶. ذخیره تراکنش در دیتابیس با wagesConfig ───────────
      const isInstallmentIdSupported = (() => {
        try {
          const fieldsRaw = (tenantDb.onlinePayment as any).fields as unknown
          const fields = (fieldsRaw || {}) as Record<string, unknown>
          return 'installmentId' in fields
        } catch {
          return false
        }
      })()

      const isWagesConfigSupported = (() => {
        try {
          const fieldsRaw = (tenantDb.onlinePayment as any).fields as unknown
          const fields = (fieldsRaw || {}) as Record<string, unknown>
          return 'wagesConfig' in fields
        } catch {
          return false
        }
      })()

      const isPlatformCommissionSupported = (() => {
        try {
          const fieldsRaw = (tenantDb.onlinePayment as any).fields as unknown
          const fields = (fieldsRaw || {}) as Record<string, unknown>
          return 'platformCommission' in fields
        } catch {
          return false
        }
      })()

      const paymentData: any = {
        tenantId,
        invoiceId,
        customerId: invoice.customerId || null,
        amount,
        authority,
        status: 'pending',
        gatewayType: 'zarinpal',
        gatewayUrl: `${zarinpalUrls.startPay}${authority}`,
        description: `${paymentDescription} - شبا: ${normalizedMerchantIban.substring(0, 8)}...`,
      }

      // ★ v8.2: ذخیره فیلدهای تسهیم
      if (isPlatformCommissionSupported) {
        paymentData.platformCommission = tashim.platformCommission
      }

      if (isWagesConfigSupported) {
        paymentData.wagesConfig = JSON.stringify({
          wages: tashim.wages,
          calculation: {
            platformCommission: tashim.platformCommission,
            merchantWage: tashim.merchantWage,
            estimatedGatewayFee: tashim.estimatedGatewayFee,
            estimatedNetToMerchant: tashim.estimatedNetToMerchant,
          },
          platformCommissionRate,
          platformCommissionFixed,
        })
      }

      if (installmentId && isInstallmentIdSupported) {
        paymentData.installmentId = installmentId
      } else if (installmentId && !isInstallmentIdSupported) {
        console.warn('[OnlinePayment Request] installmentId field not in Prisma Client yet. Run: npx prisma generate')
        paymentData.description = `${paymentData.description} [installmentId: ${installmentId}]`
      }

      const payment = await tenantDb.onlinePayment.create({
        data: paymentData,
      })

      // ─── ۷. بازگشت URL پرداخت به کلاینت ───────────────────────
      const paymentUrl = `${zarinpalUrls.startPay}${authority}`

      console.log('[OnlinePayment Request v8.2] Payment URL generated:', paymentUrl)

      return NextResponse.json({
        success: true,
        data: {
          paymentId: payment.id,
          authority,
          paymentUrl,
          installmentId: installmentId || null,
          amount,
          // ★ v8.2: اطلاعات تسهیم برای نمایش به مشتری
          tashim: {
            platformCommission: tashim.platformCommission,
            estimatedGatewayFee: tashim.estimatedGatewayFee,
            estimatedNetToMerchant: tashim.estimatedNetToMerchant,
          },
        },
        message: installmentId
          ? `کاربر به درگاه پرداخت برای قسط ${installmentSchedule?.installmentNumber || ''} هدایت می‌شود`
          : 'کاربر به درگاه پرداخت هدایت می‌شود',
      })
    } catch (error: any) {
      console.error('[OnlinePayment Request v8.2] Error:', error)
      return NextResponse.json(
        {
          success: false,
          error: error?.message || 'خطا در درخواست پرداخت آنلاین',
        },
        { status: 500 }
      )
    }
  }
)
