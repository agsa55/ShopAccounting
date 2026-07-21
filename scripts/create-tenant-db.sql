-- ═══════════════════════════════════════════════════════════════
-- ShopAccounting v4.5 — Manual Tenant Database Creation
-- ═══════════════════════════════════════════════════════════════
-- اگه mssql npm package نصب نیست، این اسکریپت رو دستی اجرا کن
-- بعدش npx prisma db push رو با DATABASE_URL جدید اجرا کن
--
-- استفاده:
--   1. @TenantId رو با شناسه فروشگاه جایگزین کن
--   2. این اسکریپت رو در SSMS اجرا کن
--   3. بعدش دستور زیر رو در terminal اجرا کن:
--      set DATABASE_URL=sqlserver://localhost:1433;database=SA_tenant_XXX;user=sa;password=As@1180;trustServerCertificate=true
--      npx prisma db push --schema=prisma/tenant/schema.prisma
-- ═══════════════════════════════════════════════════════════════

-- ─── تنظیم شناسه فروشگاه ────────────────────────────────
DECLARE @TenantId NVARCHAR(50) = 'REPLACE_WITH_TENANT_ID';
DECLARE @SafeId NVARCHAR(20);
DECLARE @DbName NVARCHAR(128);

-- فقط حروف و اعداد
SET @SafeId = LEFT(
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
            REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
                @TenantId,
            '-',''), ' ',''), '.',''), '@',''), '#',''),
        '$',''), '%',''), '^',''), '&',''), '*',''),
    '(',''), ')',''), '+',''), '=',''), '_',''),
    16);

SET @DbName = 'SA_tenant_' + @SafeId;

PRINT 'Creating database: ' + @DbName;

-- ─── ایجاد دیتابیس ──────────────────────────────────────
DECLARE @Sql NVARCHAR(MAX);

IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = @DbName)
BEGIN
    SET @Sql = N'CREATE DATABASE [' + @DbName + N']';
    EXEC sp_executesql @Sql;
    PRINT '✅ Database ' + @DbName + ' created.';
END
ELSE
BEGIN
    PRINT '⚠️ Database ' + @DbName + ' already exists.';
END
GO

-- ─── تنظیمات دیتابیس ──────────────────────────────────────
-- این بخش رو دستی با نام دیتابیس واقعی اجرا کن
-- ALTER DATABASE [SA_tenant_XXX] SET COMPATIBILITY_LEVEL = 140;
-- ALTER DATABASE [SA_tenant_XXX] SET READ_COMMITTED_SNAPSHOT ON;
-- ALTER DATABASE [SA_tenant_XXX] SET ALLOW_SNAPSHOT_ISOLATION ON;
-- GO

-- ─── بعد از ایجاد دیتابیس ──────────────────────────────
PRINT '';
PRINT '═══════════════════════════════════════════════════';
PRINT '✅ Database created successfully!';
PRINT '';
PRINT 'Next steps:';
PRINT '  1. Run in terminal:';
PRINT '     set DATABASE_URL=sqlserver://localhost:1433;database=SA_tenant_XXX;user=sa;password=YOUR_PASSWORD;trustServerCertificate=true';
PRINT '     npx prisma db push --schema=prisma/tenant/schema.prisma';
PRINT '';
PRINT '  2. Migrate data using the API:';
PRINT '     POST /api/tenants/migrate-data';
PRINT '═══════════════════════════════════════════════════';
