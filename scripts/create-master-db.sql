-- ═══════════════════════════════════════════════════════════════
-- ShopAccounting v4.5 — Master Database Creation Script
-- ═══════════════════════════════════════════════════════════════
-- این اسکریپت باید روی SQL Server اجرا شود
-- قبل از اجرای Prisma Migration
--
-- ترتیب اجرا:
--   1. این اسکریپت SQL (ایجاد دیتابیس خالی)
--   2. npx prisma db push --schema=prisma/master/schema.prisma
--   3. اسکریپت migrate-data.sql (انتقال داده‌ها)
-- ═══════════════════════════════════════════════════════════════

-- ─── مرحله ۱: ایجاد دیتابیس MasterDB ─────────────────────
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'ShopAccounting_Master')
BEGIN
    CREATE DATABASE [ShopAccounting_Master];
    PRINT '✅ Database ShopAccounting_Master created successfully.';
END
ELSE
BEGIN
    PRINT '⚠️ Database ShopAccounting_Master already exists.';
END
GO

-- ─── مرحله ۲: تنظیمات دیتابیس ───────────────────────────
ALTER DATABASE [ShopAccounting_Master] SET COMPATIBILITY_LEVEL = 140;
ALTER DATABASE [ShopAccounting_Master] SET READ_COMMITTED_SNAPSHOT ON;
ALTER DATABASE [ShopAccounting_Master] SET ALLOW_SNAPSHOT_ISOLATION ON;
GO

PRINT '✅ Database settings applied.';
GO
