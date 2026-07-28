-- ═══════════════════════════════════════════════════════════════
-- ShopAccounting v5.0 — Plans & Architecture Setup
-- ═══════════════════════════════════════════════════════════════
-- مدل کسب‌وکار:
--   آزمایشی (رایگان ۱۴ روز) → دیتابیس مشترک → حذف خودکار
--   ساده / حرفه‌ای / سازمانی (۳ ماهه / ۶ ماهه / سالانه) → دیتابیس اختصاصی
--   خرید کامل → تحویل سورس + دیتابیس مستقل
--
-- نکات مقیاس‌پذیری:
--   - Connection Pool حداکثر ۵۰ اتصال
--   - هر دیتابیس اختصاصی حداکثر ۱۰ اتصال
--   - پاکسازی خودکار اتصال‌های بیکار هر ۱ دقیقه
--   - دیتابیس آزمایشی حذف خودکار بعد ۱۴ روز
--
-- فیلدهای جدید v5.0:
--   isTrial, trialDays, requiresIsolatedDb, dbType, autoDeleteOnExpiry, tier
-- ═══════════════════════════════════════════════════════════════

USE [ShopAccounting_Master];
GO

-- ─── حذف داده‌های وابسته قدیمی ─────────────────────────────
DELETE FROM [SubscriptionPayments];
DELETE FROM [Subscriptions];
DELETE FROM [Plans];
PRINT 'Old plans and subscriptions deleted.';
GO

-- ═══════════════════════════════════════════════════════════════
-- ۱. آزمایشی (رایگان - ۱۴ روز)
-- ═══════════════════════════════════════════════════════════════
INSERT INTO [Plans] (id, name, nameFa, price, durationDays, maxUsers, maxProducts, features, isTrial, trialDays, requiresIsolatedDb, dbType, autoDeleteOnExpiry, tier, isActive, createdAt)
VALUES (
    NEWID(),
    'trial',
    N'آزمایشی',
    0,
    14,
    1,
    50,
    N'{"features":["invoices","customers","products","reports"]}',
    1,           -- isTrial = true
    14,          -- trialDays = 14
    0,           -- requiresIsolatedDb = false
    'shared',    -- dbType = shared
    1,           -- autoDeleteOnExpiry = true
    'trial',     -- tier = trial
    1,
    GETDATE()
);

-- ═══════════════════════════════════════════════════════════════
-- ۲. ساده — حسابداری فروشگاهی پایه
-- ═══════════════════════════════════════════════════════════════

-- سه ماهه
INSERT INTO [Plans] (id, name, nameFa, price, durationDays, maxUsers, maxProducts, features, isTrial, trialDays, requiresIsolatedDb, dbType, autoDeleteOnExpiry, tier, isActive, createdAt)
VALUES (
    NEWID(), 'simple_quarterly', N'ساده - سه ماهه', 290000, 90, 3, 500,
    N'{"features":["invoices","customers","products","reports","installments","accounting"]}',
    0, 0, 1, 'isolated', 0, 'simple', 1, GETDATE()
);

-- شش ماهه
INSERT INTO [Plans] (id, name, nameFa, price, durationDays, maxUsers, maxProducts, features, isTrial, trialDays, requiresIsolatedDb, dbType, autoDeleteOnExpiry, tier, isActive, createdAt)
VALUES (
    NEWID(), 'simple_semiannual', N'ساده - شش ماهه', 490000, 180, 3, 500,
    N'{"features":["invoices","customers","products","reports","installments","accounting"]}',
    0, 0, 1, 'isolated', 0, 'simple', 1, GETDATE()
);

-- سالانه
INSERT INTO [Plans] (id, name, nameFa, price, durationDays, maxUsers, maxProducts, features, isTrial, trialDays, requiresIsolatedDb, dbType, autoDeleteOnExpiry, tier, isActive, createdAt)
VALUES (
    NEWID(), 'simple_annual', N'ساده - سالانه', 890000, 365, 3, 500,
    N'{"features":["invoices","customers","products","reports","installments","accounting"]}',
    0, 0, 1, 'isolated', 0, 'simple', 1, GETDATE()
);

-- ═══════════════════════════════════════════════════════════════
-- ۳. حرفه‌ای — حسابداری فروشگاهی پیشرفته
-- ═══════════════════════════════════════════════════════════════

-- سه ماهه
INSERT INTO [Plans] (id, name, nameFa, price, durationDays, maxUsers, maxProducts, features, isTrial, trialDays, requiresIsolatedDb, dbType, autoDeleteOnExpiry, tier, isActive, createdAt)
VALUES (
    NEWID(), 'professional_quarterly', N'حرفه‌ای - سه ماهه', 590000, 90, 10, 5000,
    N'{"features":["invoices","customers","products","reports","installments","accounting","pos","multi_user","export","advanced_reports"]}',
    0, 0, 1, 'isolated', 0, 'professional', 1, GETDATE()
);

-- شش ماهه
INSERT INTO [Plans] (id, name, nameFa, price, durationDays, maxUsers, maxProducts, features, isTrial, trialDays, requiresIsolatedDb, dbType, autoDeleteOnExpiry, tier, isActive, createdAt)
VALUES (
    NEWID(), 'professional_semiannual', N'حرفه‌ای - شش ماهه', 990000, 180, 10, 5000,
    N'{"features":["invoices","customers","products","reports","installments","accounting","pos","multi_user","export","advanced_reports"]}',
    0, 0, 1, 'isolated', 0, 'professional', 1, GETDATE()
);

-- سالانه
INSERT INTO [Plans] (id, name, nameFa, price, durationDays, maxUsers, maxProducts, features, isTrial, trialDays, requiresIsolatedDb, dbType, autoDeleteOnExpiry, tier, isActive, createdAt)
VALUES (
    NEWID(), 'professional_annual', N'حرفه‌ای - سالانه', 1790000, 365, 10, 5000,
    N'{"features":["invoices","customers","products","reports","installments","accounting","pos","multi_user","export","advanced_reports"]}',
    0, 0, 1, 'isolated', 0, 'professional', 1, GETDATE()
);

-- ═══════════════════════════════════════════════════════════════
-- ۴. سازمانی — حسابداری سازمانی کامل
-- ═══════════════════════════════════════════════════════════════

-- سه ماهه
INSERT INTO [Plans] (id, name, nameFa, price, durationDays, maxUsers, maxProducts, features, isTrial, trialDays, requiresIsolatedDb, dbType, autoDeleteOnExpiry, tier, isActive, createdAt)
VALUES (
    NEWID(), 'enterprise_quarterly', N'سازمانی - سه ماهه', 1290000, 90, 50, 50000,
    N'{"features":["invoices","customers","products","reports","installments","accounting","pos","multi_user","export","api","custom_integration","priority_support","audit_trail"]}',
    0, 0, 1, 'isolated', 0, 'enterprise', 1, GETDATE()
);

-- شش ماهه
INSERT INTO [Plans] (id, name, nameFa, price, durationDays, maxUsers, maxProducts, features, isTrial, trialDays, requiresIsolatedDb, dbType, autoDeleteOnExpiry, tier, isActive, createdAt)
VALUES (
    NEWID(), 'enterprise_semiannual', N'سازمانی - شش ماهه', 2190000, 180, 50, 50000,
    N'{"features":["invoices","customers","products","reports","installments","accounting","pos","multi_user","export","api","custom_integration","priority_support","audit_trail"]}',
    0, 0, 1, 'isolated', 0, 'enterprise', 1, GETDATE()
);

-- سالانه
INSERT INTO [Plans] (id, name, nameFa, price, durationDays, maxUsers, maxProducts, features, isTrial, trialDays, requiresIsolatedDb, dbType, autoDeleteOnExpiry, tier, isActive, createdAt)
VALUES (
    NEWID(), 'enterprise_annual', N'سازمانی - سالانه', 3890000, 365, 50, 50000,
    N'{"features":["invoices","customers","products","reports","installments","accounting","pos","multi_user","export","api","custom_integration","priority_support","audit_trail"]}',
    0, 0, 1, 'isolated', 0, 'enterprise', 1, GETDATE()
);

-- ═══════════════════════════════════════════════════════════════
-- ۵. خرید کامل (تحویل سورس + دیتابیس)
-- ═══════════════════════════════════════════════════════════════
INSERT INTO [Plans] (id, name, nameFa, price, durationDays, maxUsers, maxProducts, features, isTrial, trialDays, requiresIsolatedDb, dbType, autoDeleteOnExpiry, tier, isActive, createdAt)
VALUES (
    NEWID(), 'full_purchase', N'خرید کامل', 25000000, 36500, 999, 999999,
    N'{"features":["all"],"deliveryType":"source_code","includesDatabase":true,"includesSourceCode":true,"includesSupport":true,"supportMonths":6}',
    0, 0, 1, 'standalone', 0, 'full_purchase', 1, GETDATE()
);

PRINT 'All plans created successfully!';
GO

-- ─── بررسی ──────────────────────────────────────────────
SELECT name, nameFa, price, durationDays, maxUsers, maxProducts, isTrial, trialDays, requiresIsolatedDb, dbType, autoDeleteOnExpiry, tier FROM [Plans] ORDER BY price;
GO
