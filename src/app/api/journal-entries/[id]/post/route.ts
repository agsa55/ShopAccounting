import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ============================================================================
// src/app/api/journal-entries/[id]/post/route.ts
// ثبت نهایی سند حسابداری پیش‌نویس
// ★ v2:
//   - حذف فیلد ناموجود entryNumber
//   - حذف فیلد ناموجود isPosted
//   - استفاده فقط از فیلدهای واقعی مدل JournalEntry
//   - پشتیبانی از status به صورت posted / POSTED
// ============================================================================

export async function POST(
  request: NextRequest,
  context: any
) {
  try {
    const params = await context.params
    const id = params?.id

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'شناسه سند الزامی است' },
        { status: 400 }
      )
    }

    const url = new URL(request.url)
    let tenantId = url.searchParams.get('tenantId')

    if (!tenantId) {
      try {
        const body = await request.json()
        tenantId = body?.tenantId || null
      } catch {
        tenantId = null
      }
    }

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'tenantId الزامی است' },
        { status: 400 }
      )
    }

    const client = (db as any).client

    // ★ فقط فیلدهای واقعی JournalEntry انتخاب می‌شوند
    const entry = await client.JournalEntry.findFirst({
      where: {
        id,
        tenantId,
      },
      select: {
        id: true,
        number: true,
        description: true,
        status: true,
        sourceType: true,
        isCancelled: true,
        totalDebit: true,
        totalCredit: true,
        date: true,
      },
    })

    if (!entry) {
      return NextResponse.json(
        { success: false, error: 'سند حسابداری یافت نشد' },
        { status: 404 }
      )
    }

    const currentStatus = String(entry.status || '').toUpperCase()

    if (entry.isCancelled === true || currentStatus === 'CANCELLED') {
      return NextResponse.json(
        { success: false, error: 'سند لغوشده قابل ثبت نهایی نیست' },
        { status: 400 }
      )
    }

    if (currentStatus === 'POSTED') {
      return NextResponse.json({
        success: true,
        message: 'این سند قبلاً ثبت نهایی شده است',
        data: {
          ...entry,
          status: 'POSTED',
        },
      })
    }

    // ★ تلاش برای ثبت نهایی با مقادیر احتمالی status
    // بعضی پروژه‌ها posted کوچک و بعضی POSTED بزرگ ذخیره می‌کنند
    const statusCandidates = ['posted', 'POSTED']

    let updated: any = null
    let lastError: any = null

    for (const statusValue of statusCandidates) {
      try {
        updated = await client.JournalEntry.update({
          where: { id },
          data: {
            status: statusValue,
            isCancelled: false,
          },
        })

        break
      } catch (err) {
        lastError = err
      }
    }

    if (!updated) {
      console.error('[JournalEntries][Post] ❌ Update failed:', lastError)

      return NextResponse.json(
        {
          success: false,
          error:
            lastError?.message ||
            'خطا در ثبت نهایی سند. ممکن است مقدار status در دیتابیس با posted یا POSTED سازگار نباشد.',
        },
        { status: 500 }
      )
    }

    console.log('[JournalEntries][Post] ✅ Journal entry posted:', {
      id,
      tenantId,
      number: updated?.number,
      status: updated?.status,
    })

    // ★ برای سازگاری با فرانت‌اند، status را POSTED برمی‌گردانیم
    return NextResponse.json({
      success: true,
      message: 'سند با موفقیت ثبت نهایی شد',
      data: {
        ...updated,
        status: 'POSTED',
      },
    })
  } catch (error: any) {
    console.error('[JournalEntries][Post] ❌ Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'خطا در ثبت نهایی سند',
      },
      { status: 500 }
    )
  }
}