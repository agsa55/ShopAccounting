// ============================================================================
// src/app/api/admin/tenants/[id]/delete/route.ts — v11.5
// ★ حذف دستی فروشگاه توسط ادمین
// ★ استفاده از تابع مشترک deleteTenantCompletely
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { deleteTenantCompletely } from '@/lib/tenant-deletion';

export async function DELETE(
  req: NextRequest,
  context: any
) {
  try {
    const resolvedParams = await Promise.resolve(context.params);
    const tenantId = resolvedParams.id;

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'شناسه فروشگاه نامعتبر است' },
        { status: 400 }
      );
    }

    // اجرای حذف کامل با تابع مشترک
    const result = await deleteTenantCompletely(tenantId, 'manual');

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `فروشگاه "${result.companyName}" با موفقیت حذف شد`,
        data: result,
      });
    } else {
      return NextResponse.json(
        { success: false, error: result.error || 'خطا در حذف فروشگاه' },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('[DeleteTenant] ❌ Error:', error.message);
    return NextResponse.json(
      { success: false, error: 'خطای داخلی سرور: ' + error.message },
      { status: 500 }
    );
  }
}