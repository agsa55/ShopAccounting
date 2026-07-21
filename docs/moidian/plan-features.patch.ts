// ============================================================================
// src/lib/plan-features.ts — بخش‌های تغییر یافته برای فعال‌سازی مودیان (v6.0)
// ============================================================================
// ★★★ v6.0: canMoidianIntegration برای پلن حرفه‌ای هم فعال شد
//   (قبلاً فقط enterprise بود؛ حالا professional هم پشتیبانی می‌شود)
// ============================================================================

// ... (بقیه فایل دست‌نخورده می‌ماند — فقط بخش‌های زیر تغییر می‌کنند) ...

const PLAN_FEATURES: Record<PlanTier, PlanFeatureSet> = {
  basic: {
    tier: 'basic', label: 'ساده', labelEn: 'Basic',
    posPaymentTypes: ['cash'],
    canEditTax: false, canDeleteInvoice: false, canPrintInvoice: true,
    canViewSimpleReport: true, canViewJournals: true,
    canViewAccounts: false, canCreateJournal: false, canCreateAccount: false,
    canTrialBalance: false, canGeneralLedger: false, canJournalBook: false,
    canAccessInstallments: false, canAccessCredit: false,
    canMultiBranch: false, canConsolidatedReports: false,
    canCloseFiscalYear: false, canFiscalYearManagement: false,
    canMoidianIntegration: false,  // ★ ساده: مودیان ندارد
    canMultiCashRegister: false,
    canOnlinePayment: false,
  },
  professional: {
    tier: 'professional', label: 'حرفه‌ای', labelEn: 'Professional',
    posPaymentTypes: ['cash', 'card', 'credit', 'installment', 'check'],
    canEditTax: true, canDeleteInvoice: true, canPrintInvoice: true,
    canViewSimpleReport: true, canViewJournals: true,
    canViewAccounts: true, canCreateJournal: true, canCreateAccount: true,
    canTrialBalance: true, canGeneralLedger: true, canJournalBook: true,
    canAccessInstallments: true, canAccessCredit: true,
    canMultiBranch: false, canConsolidatedReports: false,
    canCloseFiscalYear: false, canFiscalYearManagement: false,
    canMoidianIntegration: true,  // ★★★ v6.0: حرفه‌ای هم مودیان دارد
    canMultiCashRegister: false,
    canOnlinePayment: true,
    upgradeMessage: 'این قابلیت در پلن سازمانی در دسترس است',
  },
  enterprise: {
    tier: 'enterprise', label: 'سازمانی', labelEn: 'Enterprise',
    posPaymentTypes: ['cash', 'card', 'credit', 'installment', 'check'],
    canEditTax: true, canDeleteInvoice: true, canPrintInvoice: true,
    canViewSimpleReport: true, canViewJournals: true,
    canViewAccounts: true, canCreateJournal: true, canCreateAccount: true,
    canTrialBalance: true, canGeneralLedger: true, canJournalBook: true,
    canAccessInstallments: true, canAccessCredit: true,
    canMultiBranch: true, canConsolidatedReports: true,
    canCloseFiscalYear: true, canFiscalYearManagement: true,
    canMoidianIntegration: true,  // ★ سازمانی: مودیان دارد
    canMultiCashRegister: true,
    canOnlinePayment: true,
    upgradeMessage: '',
  },
}

// ★★★ v6.0: به‌روزرسانی توضیحات پلن‌ها
export const PLAN_TIERS: { tier: PlanTier; label: string; labelEn: string; description: string }[] = [
  { tier: 'basic', label: 'ساده', labelEn: 'Basic', description: 'تک‌دفتری: فقط درآمد/هزینه، سود و زیان ساده، بدون بهای تمام شده خودکار، بدون مدیریت طلب و بدهی پیشرفته.' },
  { tier: 'professional', label: 'حرفه‌ای', labelEn: 'Professional', description: 'حسابداری دوطرفه کامل، ثبت خودکار بهای تمام شده، مدیریت طلب و بدهی، تراز آزمایشی، دفتر کل و روزنامه، اتصال به سامانه مودیان مالیاتی.' },
  { tier: 'enterprise', label: 'سازمانی', labelEn: 'Enterprise', description: 'تمام موارد حرفه‌ای + حسابداری شعب و انبارهای متعدد، گزارش‌های تلفیقی، بستن خودکار سال مالی.' },
]
