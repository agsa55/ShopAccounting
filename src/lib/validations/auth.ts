/**
 * Auth Validations - ShopAccounting v4.0
 *
 * اعتبارسنجی ورود و ثبت‌نام با Zod
 */

import { z } from 'zod';

// ─── لاگین ───────────────────────────────────────────────

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'ایمیل الزامی است.')
    .email('فرمت ایمیل نامعتبر است.'),
  password: z
    .string()
    .min(1, 'رمز عبور الزامی است.')
    .min(6, 'رمز عبور باید حداقل 6 کاراکتر باشد.'),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ─── ثبت‌نام ───────────────────────────────────────────────

export const registerSchema = z.object({
  email: z
    .string()
    .min(1, 'ایمیل الزامی است.')
    .email('فرمت ایمیل نامعتبر است.'),
  password: z
    .string()
    .min(1, 'رمز عبور الزامی است.')
    .min(6, 'رمز عبور باید حداقل 6 کاراکتر باشد.')
    .regex(
      /^(?=.*[a-zA-Z])(?=.*\d)/,
      'رمز عبور باید شامل حروف و عدد باشد.'
    ),
  displayName: z
    .string()
    .min(1, 'نام الزامی است.')
    .min(2, 'نام باید حداقل 2 کاراکتر باشد.')
    .max(100, 'نام نمی‌تواند بیشتر از 100 کاراکتر باشد.'),
  phone: z
    .string()
    .regex(/^09\d{9}$/, 'شماره موبایل باید فرمت 09XXXXXXXXX داشته باشد.')
    .optional()
    .or(z.literal('')),
  tenantId: z.string().min(1, 'شناسه فروشگاه الزامی است.'),
  role: z.enum(['Manager', 'Cashier']).optional().default('Cashier'),
  permissions: z.array(z.string()).optional().default([]),
});

export type RegisterInput = z.infer<typeof registerSchema>;

// ─── تمدید توکن ───────────────────────────────────────────────

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token الزامی است.'),
});

export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
