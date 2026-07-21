-- ═══════════════════════════════════════════════════════════════
-- ShopAccounting v5.0 — Schema Migration (v4.5 → v5.0)
-- ═══════════════════════════════════════════════════════════════
-- این اسکریپت فیلدهای جدید جداول Plans و Tenants را اضافه می‌کند
-- بدون حذف هیچ داده‌ای
--
-- ⚠️ قبل از اجرا حتماً بکاپ بگیرید!
-- ═══════════════════════════════════════════════════════════════

USE [ShopAccounting_Master];
GO

-- ═══════════════════════════════════════════════════════════════
-- ۱. اضافه کردن فیلدهای جدید به جدول Plans
-- ═══════════════════════════════════════════════════════════════

-- isTrial (آیا پلن آزمایشی است؟)
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Plans' AND COLUMN_NAME = 'isTrial')
BEGIN
    ALTER TABLE [Plans] ADD [isTrial] BIT NOT NULL DEFAULT 0;
    PRINT 'Added: Plans.isTrial';
END
GO

-- trialDays (تعداد روزهای آزمایشی)
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Plans' AND COLUMN_NAME = 'trialDays')
BEGIN
    ALTER TABLE [Plans] ADD [trialDays] INT NOT NULL DEFAULT 0;
    PRINT 'Added: Plans.trialDays';
END
GO

-- requiresIsolatedDb (آیا نیاز به دیتابیس اختصاصی دارد؟)
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Plans' AND COLUMN_NAME = 'requiresIsolatedDb')
BEGIN
    ALTER TABLE [Plans] ADD [requiresIsolatedDb] BIT NOT NULL DEFAULT 0;
    PRINT 'Added: Plans.requiresIsolatedDb';
END
GO

-- dbType (نوع دیتابیس: shared | isolated | standalone)
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Plans' AND COLUMN_NAME = 'dbType')
BEGIN
    ALTER TABLE [Plans] ADD [dbType] NVARCHAR(50) NOT NULL DEFAULT 'shared';
    PRINT 'Added: Plans.dbType';
END
GO

-- autoDeleteOnExpiry (آیا بعد از انقضا حذف خودکار شود؟)
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Plans' AND COLUMN_NAME = 'autoDeleteOnExpiry')
BEGIN
    ALTER TABLE [Plans] ADD [autoDeleteOnExpiry] BIT NOT NULL DEFAULT 0;
    PRINT 'Added: Plans.autoDeleteOnExpiry';
END
GO

-- tier (سطح پلن: trial | simple | professional | enterprise | full_purchase)
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Plans' AND COLUMN_NAME = 'tier')
BEGIN
    ALTER TABLE [Plans] ADD [tier] NVARCHAR(50) NOT NULL DEFAULT 'trial';
    PRINT 'Added: Plans.tier';
END
GO

-- ═══════════════════════════════════════════════════════════════
-- ۲. اضافه کردن فیلدهای جدید به جدول Tenants
-- ═══════════════════════════════════════════════════════════════

-- soldAt (تاریخ تحویل به مشتری)
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Tenants' AND COLUMN_NAME = 'soldAt')
BEGIN
    ALTER TABLE [Tenants] ADD [soldAt] DATETIME2 NULL;
    PRINT 'Added: Tenants.soldAt';
END
GO

-- soldTo (نام خریدار)
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Tenants' AND COLUMN_NAME = 'soldTo')
BEGIN
    ALTER TABLE [Tenants] ADD [soldTo] NVARCHAR(500) NULL;
    PRINT 'Added: Tenants.soldTo';
END
GO

-- soldToContact (شماره تماس خریدار)
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Tenants' AND COLUMN_NAME = 'soldToContact')
BEGIN
    ALTER TABLE [Tenants] ADD [soldToContact] NVARCHAR(50) NULL;
    PRINT 'Added: Tenants.soldToContact';
END
GO

-- ═══════════════════════════════════════════════════════════════
-- ۳. بروزرسانی planName پیش‌فرض Tenants
-- ═══════════════════════════════════════════════════════════════

UPDATE [Tenants] SET [planName] = 'trial' WHERE [planName] = 'basic';
PRINT 'Updated: Tenants with planName=basic → trial';
GO

-- ═══════════════════════════════════════════════════════════════
-- ۴. ایجاد ایندکس‌های جدید
-- ═══════════════════════════════════════════════════════════════

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'Plans_isTrial' AND object_id = OBJECT_ID('Plans'))
BEGIN
    CREATE INDEX [Plans_isTrial] ON [Plans]([isTrial]);
    PRINT 'Created index: Plans_isTrial';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'Plans_tier' AND object_id = OBJECT_ID('Plans'))
BEGIN
    CREATE INDEX [Plans_tier] ON [Plans]([tier]);
    PRINT 'Created index: Plans_tier';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'Plans_dbType' AND object_id = OBJECT_ID('Plans'))
BEGIN
    CREATE INDEX [Plans_dbType] ON [Plans]([dbType]);
    PRINT 'Created index: Plans_dbType';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'Tenants_planName' AND object_id = OBJECT_ID('Tenants'))
BEGIN
    CREATE INDEX [Tenants_planName] ON [Tenants]([planName]);
    PRINT 'Created index: Tenants_planName';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'Tenants_isIsolated' AND object_id = OBJECT_ID('Tenants'))
BEGIN
    CREATE INDEX [Tenants_isIsolated] ON [Tenants]([isIsolated]);
    PRINT 'Created index: Tenants_isIsolated';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'Subscriptions_status_endDate' AND object_id = OBJECT_ID('Subscriptions'))
BEGIN
    CREATE INDEX [Subscriptions_status_endDate] ON [Subscriptions]([status], [endDate]);
    PRINT 'Created index: Subscriptions_status_endDate';
END
GO

PRINT 'Schema migration v4.5 to v5.0 completed successfully!';
GO

-- ─── بررسی ساختار جدید ──────────────────────────────────
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'Plans' AND COLUMN_NAME IN ('isTrial', 'trialDays', 'requiresIsolatedDb', 'dbType', 'autoDeleteOnExpiry', 'tier')
ORDER BY ORDINAL_POSITION;

SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'Tenants' AND COLUMN_NAME IN ('soldAt', 'soldTo', 'soldToContact')
ORDER BY ORDINAL_POSITION;
GO
