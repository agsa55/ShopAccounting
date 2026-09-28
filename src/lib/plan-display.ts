// ============================================================================
// src/lib/plan-display.ts
// ★ helper مشترک برای نمایش عنوان و توضیح پلن از محتوای سایت
// ★ باعث می‌شود عنوان پلن در لندینگ، ثبت‌نام، لایوت، موفق، داشبورد و... یکسان باشد
// ============================================================================

const PLAN_ALIASES: Record<string, string> = {
  demo: 'simple',
  free: 'simple',
  trial: 'simple',
  basic: 'simple',
  starter: 'simple',

  pro: 'professional',
  advanced: 'professional',

  business: 'enterprise',
  corporate: 'enterprise',
  organization: 'enterprise',
}

/**
 * کلید داخلی پلن را نرمال می‌کند.
 * مثال:
 * demo -> simple
 * pro -> professional
 * business -> enterprise
 */
export function resolvePlanKey(plan?: string | null): string {
  const raw = String(plan || 'simple').toLowerCase().trim()
  return PLAN_ALIASES[raw] || raw || 'simple'
}

/**
 * عنوان فارسی پلن را از محتوای سایت می‌خواند.
 * اگر پیدا نشد، از fallback استفاده می‌کند.
 */
export function getPlanTitle(
  content: any,
  plan?: string | null,
  fallback = 'پلن پایه'
): string {
  const key = resolvePlanKey(plan)
  const plans: any[] = Array.isArray(content?.plans) ? content.plans : []

  const found =
    plans.find((p) => p?.name === key) ||
    plans.find((p) => p?.id === key) ||
    plans.find((p) => String(p?.nameFa || '').trim() === String(plan || '').trim()) ||
    null

  const title = String(found?.nameFa || '').trim()
  return title || fallback
}

/**
 * توضیح پلن را از محتوای سایت می‌خواند.
 * اختیاری — اگر خواستید توضیح هم همسان‌سازی شود.
 */
export function getPlanDescription(
  content: any,
  plan?: string | null,
  fallback = ''
): string {
  const key = resolvePlanKey(plan)
  const plans: any[] = Array.isArray(content?.plans) ? content.plans : []

  const found =
    plans.find((p) => p?.name === key) ||
    plans.find((p) => p?.id === key) ||
    null

  return String(found?.description || '').trim() || fallback
}