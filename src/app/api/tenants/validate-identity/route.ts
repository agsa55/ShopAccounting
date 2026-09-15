// ============================================================================
// src/app/api/tenants/validate-identity/route.ts — v11.5 (Debug Version)
// ★ با logging کامل برای عیب‌یابی
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { 
  verifyShahkar, 
  validateIranianNationalCode, 
  validateIranianMobile 
} from '@/lib/shahkar'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const startTime = Date.now()
  
  try {
    const body = await req.json()
    const { mobile, nationalCode, storeName, username } = body

    console.log('\n╔══════════════════════════════════════════════════════════════╗')
    console.log('║  [ValidateIdentity v11.5] 📥 NEW REQUEST                     ║')
    console.log('╚══════════════════════════════════════════════════════════════╝')
    console.log('[ValidateIdentity] Input:', {
      mobile: mobile?.substring(0, 4) + '****' + mobile?.substring(8),
      nationalCode: nationalCode?.substring(0, 3) + '****' + nationalCode?.substring(7),
      nationalCodeFull: nationalCode, // ★ برای دیباگ - بعداً حذف کنید
      storeName: storeName?.substring(0, 10) + '...',
      username,
    })

    // ─── ۱. بررسی ورودی‌های اجباری ───────────────────────────────────────
    if (!mobile || !nationalCode || !storeName || !username) {
      return NextResponse.json({
        success: false,
        error: 'همه فیلدها اجباری هستند',
        code: 'MISSING_FIELDS',
      }, { status: 400 })
    }

    // ─── ۲. اعتبارسنجی فرمت کد ملی ─────────────────────────────────────
    const codeValidation = validateIranianNationalCode(nationalCode)
    if (!codeValidation.valid) {
      console.log('[ValidateIdentity] ❌ Invalid national code format')
      return NextResponse.json({
        success: false,
        error: codeValidation.message,
        code: 'INVALID_NATIONAL_CODE',
      }, { status: 400 })
    }

    // ─── ۳. اعتبارسنجی فرمت شماره موبایل ──────────────────────────────
    const mobileValidation = validateIranianMobile(mobile)
    if (!mobileValidation.valid) {
      console.log('[ValidateIdentity] ❌ Invalid mobile format')
      return NextResponse.json({
        success: false,
        error: mobileValidation.message,
        code: 'INVALID_MOBILE',
      }, { status: 400 })
    }

    // ═══════════════════════════════════════════════════════════════
    // ★ v11.5: چک IdentityRegistry با debug logging
    // ═══════════════════════════════════════════════════════════════
    console.log('[ValidateIdentity] 🔍 Checking IdentityRegistry...')
    try {
      const existingInRegistry = await db.client.identityRegistry.findUnique({
        where: { nationalCode }
      })
      
  if (existingInRegistry) {
  console.log('[ValidateIdentity] ❌ Found in IdentityRegistry:', existingInRegistry.id)
  return NextResponse.json({
    success: false,
    error: 'این کد ملی قبلاً در سیستم ثبت شده است. هر کد ملی فقط یک بار می‌تواند در رهگشا ثبت‌نام کند. لطفاً از صفحه ورود استفاده کنید.',
    code: 'NATIONAL_CODE_IN_REGISTRY',
  }, { status: 400 })
}
      console.log('[ValidateIdentity] ✓ Not found in IdentityRegistry')
    } catch (err: any) {
      console.error('[ValidateIdentity] ⚠️ IdentityRegistry error:', err.message)
      console.log('[ValidateIdentity] ↪️ Fallback to Tenants check')
    }

    // ═══════════════════════════════════════════════════════════════
    // ★ v11.5: چک Tenants با debug logging
    // ═══════════════════════════════════════════════════════════════
    console.log('[ValidateIdentity] 🔍 Checking Tenants.ownerNationalCode...')
    console.log('[ValidateIdentity] Searching for:', nationalCode)
    
    const existingNationalCode = await db.client.tenant.findFirst({
      where: { 
        ownerNationalCode: nationalCode,
        status: { not: 'deleted' }
      },
      select: { id: true, companyName: true, ownerMobile: true }
    })
    
    if (existingNationalCode) {
      console.log('[ValidateIdentity] ❌ Found in Tenants:', existingNationalCode.id)
      return NextResponse.json({
        success: false,
        error: `این کد ملی قبلاً برای فروشگاه "${existingNationalCode.companyName}" ثبت شده است. هر کد ملی فقط یک بار می‌تواند ثبت‌نام کند.`,
        code: 'NATIONAL_CODE_EXISTS',
      }, { status: 400 })
    }
    console.log('[ValidateIdentity] ✓ Not found in Tenants.ownerNationalCode')

    // ═══════════════════════════════════════════════════════════════
    // ★ v11.5: چک موبایل
    // ═══════════════════════════════════════════════════════════════
    console.log('[ValidateIdentity] 🔍 Checking Tenants.ownerMobile...')
    const existingMobile = await db.client.tenant.findFirst({
      where: { 
        ownerMobile: mobile,
        status: { not: 'deleted' }
      },
      select: { id: true, companyName: true }
    })
    
    if (existingMobile) {
      console.log('[ValidateIdentity] ❌ Mobile already registered:', existingMobile.id)
      return NextResponse.json({
        success: false,
        error: `این شماره موبایل قبلاً برای فروشگاه "${existingMobile.companyName}" ثبت‌نام کرده است.`,
        code: 'MOBILE_ALREADY_EXISTS',
      }, { status: 400 })
    }
    console.log('[ValidateIdentity] ✓ Mobile not found')

    // ─── ۶. بررسی یکتا بودن زیردامنه ───────────────────────────────
    const usernameToSubdomain = (u: string): string => {
      return u.toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 30) || 'shop'
    }
    const autoSubdomain = usernameToSubdomain(username)
    
    const existingSubdomain = await db.client.tenant.findFirst({
      where: { subDomain: autoSubdomain, status: { not: 'deleted' } },
      select: { id: true }
    })
    
    if (existingSubdomain) {
      return NextResponse.json({
        success: false,
        error: 'این نام کاربری قبلاً استفاده شده است. لطفاً نام کاربری دیگری انتخاب کنید.',
        code: 'SUBDOMAIN_EXISTS',
      }, { status: 400 })
    }

    // ─── ۷. بررسی یکتا بودن username در StoreUser ─────────────────
    const existingUsername = await db.client.storeUser.findFirst({
      where: { username },
      select: { id: true }
    })
    
    if (existingUsername) {
      return NextResponse.json({
        success: false,
        error: 'این نام کاربری قبلاً استفاده شده است.',
        code: 'USERNAME_EXISTS',
      }, { status: 400 })
    }

    // ─── ۸. بررسی یکتا بودن نام فروشگاه ───────────────────────────
    const existingStoreName = await db.client.tenant.findFirst({
      where: { companyName: storeName, status: { not: 'deleted' } },
      select: { id: true }
    })
    
    if (existingStoreName) {
      return NextResponse.json({
        success: false,
        error: 'این نام فروشگاه قبلاً استفاده شده است.',
        code: 'STORE_NAME_EXISTS',
      }, { status: 400 })
    }

    // ═══════════════════════════════════════════════════════════════
    // ★ فراخوانی شاهکار (آخرین مرحله - هزینه دارد)
    // ═══════════════════════════════════════════════════════════════
    console.log('[ValidateIdentity] 🔍 Calling Shahkar API...')
    const shahkarResult = await verifyShahkar(nationalCode, mobile)
    
    if (!shahkarResult.success) {
      console.error('[ValidateIdentity] ❌ Shahkar API error')
      return NextResponse.json({
        success: false,
        error: shahkarResult.message || 'خطا در ارتباط با سرویس احراز هویت',
        code: 'SHAHKAR_ERROR',
      }, { status: 503 })
    }

    if (!shahkarResult.valid) {
      console.log('[ValidateIdentity] ❌ Identity mismatch')
      return NextResponse.json({
        success: false,
        error: 'کد ملی با شماره موبایل تطبیق ندارد.',
        code: 'IDENTITY_MISMATCH',
      }, { status: 400 })
    }

    // ─── ۹. همه چیز درست است! ─────────────────────────────────────
    const durationMs = Date.now() - startTime
    console.log(`╔══════════════════════════════════════════════════════════════╗`)
    console.log(`║  [ValidateIdentity] ✅ ALL CHECKS PASSED in ${durationMs}ms`)
    console.log(`╚══════════════════════════════════════════════════════════════╝\n`)
    
    return NextResponse.json({
      success: true,
      message: 'اطلاعات تأیید شد',
      data: {
        identityVerified: true,
        autoSubdomain,
      }
    })

  } catch (error: any) {
    const durationMs = Date.now() - startTime
    console.error(`[ValidateIdentity] ❌ Error after ${durationMs}ms:`, error)
    console.error('[ValidateIdentity] Stack:', error.stack)
    
    return NextResponse.json({
      success: false,
      error: 'خطای غیرمنتظره در اعتبارسنجی: ' + error.message,
      code: 'UNEXPECTED_ERROR',
    }, { status: 500 })
  }
}