// ============================================================================
// src/components/customers/customers-page-portal-patch.tsx (v3.36)
// ----------------------------------------------------------------------------
// ★ این فایل یک "پچ راهنما" است — فایل customers-page.tsx فعلی خودتان را باز
//   کنید و فقط ۳ تغییر کوچک زیر را اعمال کنید.
// ★ این فایل به‌خودی‌خود اجرا نمی‌شود — فقط برای راهنمایی است.
// ============================================================================

import { PortalLinkButton } from '@/components/invoices/portal-link-button'

// ═══════════════════════════════════════════════════════════════
// تغییر ۱) در ابتدای فایل customers-page.tsx، import زیر را اضافه کنید
// ═══════════════════════════════════════════════════════════════

// import { PortalLinkButton } from '@/components/invoices/portal-link-button'

// ═══════════════════════════════════════════════════════════════
// تغییر ۲) در جدول مشتریان، یک ستون جدید «پورتال» اضافه کنید
//   مکان: درون <TableBody> → برای هر مشتری در <TableRow>
// ═══════════════════════════════════════════════════════════════

export function CustomersTableRowPatchExample({ customer }: { customer: any }) {
  return (
    <TableRow>
      {/* ... ستون‌های موجود ... */}

      {/* ★★★ v3.36: ستون جدید لینک پورتال */}
      <TableCell className="text-center">
        <PortalLinkButton
          customerId={customer.id}
          customerName={`${customer.firstName} ${customer.lastName}`}
          portalToken={customer.portalToken}
          variant="ghost"
          size="icon"
          label=""
        />
      </TableCell>
    </TableRow>
  )
}

// ═══════════════════════════════════════════════════════════════
// تغییر ۳) در header جدول، عنوان ستون جدید را اضافه کنید
// ═══════════════════════════════════════════════════════════════

export function CustomersTableHeaderPatchExample() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead>نام</TableHead>
        <TableHead>موبایل</TableHead>
        <TableHead>بدهی</TableHead>
        {/* ★★★ v3.36: ستون جدید */}
        <TableHead className="text-center">پورتال</TableHead>
        <TableHead>عملیات</TableHead>
      </TableRow>
    </TableHeader>
  )
}

// ═══════════════════════════════════════════════════════════════
// تغییر ۴) در مودال جزئیات/ویرایش مشتری، یک بنر «لینک پورتال» اضافه کنید
//   مکان: درون DialogContent مودال ویرایش مشتری، در ابتدای body
// ═══════════════════════════════════════════════════════════════

export function CustomerEditDialogPatchExample({ customer }: { customer: any }) {
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>ویرایش مشتری</DialogTitle>
      </DialogHeader>

      <div className="space-y-3">
        {/* ★★★ v3.36: بنر لینک پورتال */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-emerald-600" />
            <div>
              <p className="text-xs font-bold text-emerald-700">پورتال مشتری</p>
              <p className="text-[10px] text-emerald-600">دسترسی به فاکتورها و پرداخت آنلاین</p>
            </div>
          </div>
          <PortalLinkButton
            customerId={customer.id}
            customerName={`${customer.firstName} ${customer.lastName}`}
            portalToken={customer.portalToken}
            variant="outline"
            size="sm"
          />
        </div>

        {/* ... فیلدهای فرم ویرایش مشتری ... */}
      </div>
    </DialogContent>
  )
}

// import { Link2 } from 'lucide-react'  // در صورت نیاز به آیکون
