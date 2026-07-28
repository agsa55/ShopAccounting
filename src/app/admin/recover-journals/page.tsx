// ============================================================================
// src/app/admin/recover-journals/page.tsx — v8.3 ★★★
// ShopAccounting — Recover Missing Journal Entries (Standalone Page)
// ----------------------------------------------------------------------------
// ★★★ v8.3: این صفحه فقط یک wrapper نازک است که از کامپوننت مشترک استفاده می‌کند.
//
// ★ کامپوننت اصلی در:
//   src/components/accounting/recover-journals-tab.tsx
//
// ★ این صفحه از sidebar قابل دسترسی است (آیتم «بازیابی اسناد» در گروه «سیستم»)
// ★ همان محتوا به‌عنوان یک تب در صفحه حسابداری هم نمایش داده می‌شود.
// ============================================================================

import { RecoverJournalsTab } from '@/components/accounting/recover-journals-tab'

export default function RecoverJournalsPage() {
  // ★ embedded=false → هدر و container اصلی نمایش داده می‌شود
  return <RecoverJournalsTab embedded={false} />
}
