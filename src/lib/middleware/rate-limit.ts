/**
 * Rate Limit Middleware - ShopAccounting v4.0
 *
 * محدودیت تعداد درخواست‌ها برای جلوگیری از حملات Brute Force
 * پیاده‌سازی ساده با Map در حافظه
 *
 * در تولید باید با Redis جایگزین شود
 */

import { NextRequest, NextResponse } from 'next/server';

// ─── تایپ‌ها ───────────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface RateLimitOptions {
  limit?: number;       // حداکثر تعداد درخواست
  windowMs?: number;    // بازه زمانی (میلی‌ثانیه)
}

// ─── ذخیره‌سازی در حافظه ───────────────────────────────────────

const rateLimitMap = new Map<string, RateLimitEntry>();

// پاکسازی هر 10 دقیقه
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitMap.entries()) {
      if (now > entry.resetTime) {
        rateLimitMap.delete(key);
      }
    }
  }, 10 * 60 * 1000);
}

// ─── میدلویر ───────────────────────────────────────────────

/**
 * ایجاد میدلویر Rate Limit
 *
 * @param options - تنظیمات محدودیت
 * @returns تابع میدلویر که در صورت تجاوز، پاسخ 429 برمی‌گرداند
 *
 * @example
 * const limiter = rateLimit({ limit: 5, windowMs: 5 * 60 * 1000 });
 * // در route:
 * const blocked = await limiter(request);
 * if (blocked) return blocked;
 */
export function rateLimit(options: RateLimitOptions = {}) {
  const { limit = 10, windowMs = 60 * 1000 } = options;

  return (request: NextRequest): NextResponse | null => {
    // استفاده از IP کلاینت به عنوان کلید
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
    const key = `${ip}:${request.nextUrl.pathname}`;

    const now = Date.now();
    const entry = rateLimitMap.get(key);

    if (!entry || now > entry.resetTime) {
      // بازه جدید
      rateLimitMap.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });
      return null; // مجاز
    }

    if (entry.count >= limit) {
      // تجاوز از حد مجاز
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      return NextResponse.json(
        {
          success: false,
          error: 'تعداد درخواست‌ها بیش از حد مجاز است. لطفاً کمی صبر کنید.',
          errorCode: 'RATE_LIMITED',
          retryAfter,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(limit),
            'X-RateLimit-Remaining': '0',
          },
        }
      );
    }

    // افزایش شمارنده
    entry.count++;
    return null; // مجاز
  };
}
