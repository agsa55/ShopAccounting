-- ============================================================================
-- migration-plan-v2.sql — مایگریشن از ساختار قدیم Plan به ساختار جدید
-- ShopAccounting v4.0 — Multi-tenant SaaS Platform
-- ============================================================================
--
-- ترتیب اجرا:
--   ۱. ابتدا این فایل SQL رو اجرا کنید
--   ۲. سپس prisma db push --schema=prisma/master/schema.prisma
--
-- ⚠️ مهم: قبل از اجرا، بکاپ بگیرید!
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════════
-- مرحله ۱: ایجاد جدول PlanTiers
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS PlanTiers (
  id            INT PRIMARY KEY AUTOINCREMENT,
  name          NVARCHAR(100) NOT NULL UNIQUE,
  nameFa        NVARCHAR(100) NOT NULL,
  description   NVARCHAR(500),
  maxUsers      INT NOT NULL DEFAULT 1,
  maxProducts   INT NOT NULL DEFAULT 50,
  maxInvoices   INT NOT NULL DEFAULT 100,
  isTrial       BIT NOT NULL DEFAULT 0,
  trialDays     INT NOT NULL DEFAULT 0,
  dbType        NVARCHAR(20) NOT NULL DEFAULT 'shared',
  isActive      BIT NOT NULL DEFAULT 1,
  sortOrder     INT NOT NULL DEFAULT 0,
  createdAt     DATETIME NOT NULL DEFAULT GETDATE(),
  updatedAt     DATETIME NOT NULL DEFAULT GETDATE()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- مرحله ۲: درج داده‌های پیش‌فرض PlanTiers
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO PlanTiers (name, nameFa, description, maxUsers, maxProducts, maxInvoices, isTrial, trialDays, dbType, sortOrder)
VALUES
  ('free',          N'رایگان',    N'دوره آزمایشی ۱۴ روزه — بدون نیاز به کارت بانکی',    1,     50,     50,      1, 14, 'shared',     0),
  ('simple',        N'ساده',      N'مناسب فروشگاه‌های کوچک و فردی',                     2,    500,   1000,      0,  0, 'shared',     1),
  ('professional',  N'حرفه‌ای',   N'مناسب فروشگاه‌های متوسط و در حال رشد',               5,   5000,  10000,      0,  0, 'shared',     2),
  ('enterprise',    N'سازمانی',   N'مناسب کسب‌وکارهای بزرگ و سازمان‌ها',                999,  99999, 999999,      0,  0, 'isolated',   3);

-- ═══════════════════════════════════════════════════════════════════════════════
-- مرحله ۳: ایجاد جدول PlanPrices
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS PlanPrices (
  id              INT PRIMARY KEY AUTOINCREMENT,
  planTierId      INT NOT NULL,
  billingCycle    NVARCHAR(20) NOT NULL,
  durationDays    INT NOT NULL,
  price           INT NOT NULL DEFAULT 0,
  discountPercent INT NOT NULL DEFAULT 0,
  isActive        BIT NOT NULL DEFAULT 1,
  isPopular       BIT NOT NULL DEFAULT 0,
  createdAt       DATETIME NOT NULL DEFAULT GETDATE(),
  updatedAt       DATETIME NOT NULL DEFAULT GETDATE(),
  
  CONSTRAINT FK_PlanPrices_PlanTier FOREIGN KEY (planTierId) REFERENCES PlanTiers(id) ON DELETE CASCADE,
  CONSTRAINT UQ_PlanTier_BillingCycle UNIQUE (planTierId, billingCycle)
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- مرحله ۴: درج داده‌های پیش‌فرض PlanPrices
-- ═══════════════════════════════════════════════════════════════════════════════
-- قیمت‌ها به ریال هست — قابل تغییر در پنل ادمین

-- ─── پلن ساده ───
INSERT INTO PlanPrices (planTierId, billingCycle, durationDays, price, discountPercent, isPopular)
VALUES
  (2, 'monthly',    30,   150000,  0, 0),
  (2, 'quarterly',  90,   427500,  5, 0),
  (2, 'semiannual', 180,  810000, 10, 0),
  (2, 'annual',     365, 1440000, 20, 1);

-- ─── پلن حرفه‌ای ───
INSERT INTO PlanPrices (planTierId, billingCycle, durationDays, price, discountPercent, isPopular)
VALUES
  (3, 'monthly',    30,   350000,  0, 0),
  (3, 'quarterly',  90,   997500,  5, 0),
  (3, 'semiannual', 180, 1890000, 10, 0),
  (3, 'annual',     365, 3360000, 20, 1);

-- ─── پلن سازمانی ───
INSERT INTO PlanPrices (planTierId, billingCycle, durationDays, price, discountPercent, isPopular)
VALUES
  (4, 'monthly',    30,   700000,  0, 0),
  (4, 'quarterly',  90,  1995000,  5, 0),
  (4, 'semiannual', 180, 3780000, 10, 0),
  (4, 'annual',     365, 6720000, 20, 1);

-- ═══════════════════════════════════════════════════════════════════════════════
-- مرحله ۵: آپدیت جدول Tenants — اضافه کردن فیلدهای جدید
-- ═══════════════════════════════════════════════════════════════════════════════

-- اضافه کردن فیلدهای جدید
ALTER TABLE Tenants ADD planTierId INT NOT NULL DEFAULT 1;
ALTER TABLE Tenants ADD billingCycle NVARCHAR(20) NOT NULL DEFAULT 'monthly';
ALTER TABLE Tenants ADD expiresAt DATETIME NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- مرحله ۶: مایگریشن داده‌های قدیمی به ساختار جدید
-- ═══════════════════════════════════════════════════════════════════════════════

-- آپدیت planTierId بر اساس planName قدیمی
UPDATE Tenants SET planTierId = 1 WHERE planName = 'trial' OR planName = 'free';
UPDATE Tenants SET planTierId = 2 WHERE planName LIKE 'simple%';
UPDATE Tenants SET planTierId = 3 WHERE planName LIKE 'professional%';
UPDATE Tenants SET planTierId = 4 WHERE planName = 'enterprise';
UPDATE Tenants SET billingCycle = 'quarterly' WHERE planName LIKE '%quarterly%';
UPDATE Tenants SET billingCycle = 'semiannual' WHERE planName LIKE '%semiannual%';
UPDATE Tenants SET billingCycle = 'annual' WHERE planName LIKE '%annual%';

-- محاسبه expiresAt بر اساس soldAt و durationDays
-- اگر soldAt وجود داره، expiresAt رو محاسبه کن
UPDATE Tenants SET expiresAt = DATEADD(day, 30, soldAt)
  WHERE soldAt IS NOT NULL AND expiresAt IS NULL AND billingCycle = 'monthly';

UPDATE Tenants SET expiresAt = DATEADD(day, 90, soldAt)
  WHERE soldAt IS NOT NULL AND expiresAt IS NULL AND billingCycle = 'quarterly';

UPDATE Tenants SET expiresAt = DATEADD(day, 180, soldAt)
  WHERE soldAt IS NOT NULL AND expiresAt IS NULL AND billingCycle = 'semiannual';

UPDATE Tenants SET expiresAt = DATEADD(day, 365, soldAt)
  WHERE soldAt IS NOT NULL AND expiresAt IS NULL AND billingCycle = 'annual';

-- برای tenant های آزمایشی
UPDATE Tenants SET expiresAt = DATEADD(day, 14, soldAt)
  WHERE soldAt IS NOT NULL AND expiresAt IS NULL AND planTierId = 1;

-- ═══════════════════════════════════════════════════════════════════════════════
-- مرحله ۷: ایجاد Foreign Key
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE Tenants ADD CONSTRAINT FK_Tenants_PlanTier
  FOREIGN KEY (planTierId) REFERENCES PlanTiers(id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- مرحله ۸: حذف جدول قدیمی Plan (بعد از تایید صحت مایگریشن!)
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ این مرحله رو فقط بعد از تایید اجرا کنید!
-- DROP TABLE IF EXISTS Plans;
-- ALTER TABLE Tenants DROP COLUMN planName;
