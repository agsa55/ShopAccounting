-- ═══════════════════════════════════════════════════════════════
-- ShopAccounting v4.5 — Data Migration Script
-- ═══════════════════════════════════════════════════════════════
-- انتقال داده‌های جداول مدیریتی از ShopAccounting به ShopAccounting_Master
--
-- ⚠️ مهم: این اسکریپت باید بعد از اجرای Prisma Migration
--    روی هر دو دیتابیس اجرا شود
--
-- ترتیب اجرا:
--   1. create-master-db.sql
--   2. npx prisma db push --schema=prisma/master/schema.prisma
--   3. این اسکریپت (مهاجرت داده)
--   4. npx prisma db push --schema=prisma/tenant/schema.prisma
--   5. sync-user-lookups.ts
-- ═══════════════════════════════════════════════════════════════

USE [ShopAccounting_Master];
GO

-- ─── مرحله ۱: انتقال Plans ─────────────────────────────────
-- (اول Plans چون Subscription به آن وابسته است)
IF EXISTS (SELECT 1 FROM [ShopAccounting].dbo.Plans)
BEGIN
    SET IDENTITY_INSERT [Plans] ON;

    INSERT INTO [Plans] (id, name, nameFa, price, durationDays, maxUsers, maxProducts, features, isActive, createdAt)
    SELECT id, name, nameFa, price, durationDays, maxUsers, maxProducts, features, isActive, createdAt
    FROM [ShopAccounting].dbo.Plans;

    SET IDENTITY_INSERT [Plans] OFF;
    PRINT '✅ Plans migrated.';
END
ELSE
BEGIN
    PRINT '⚠️ No Plans data to migrate.';
END
GO

-- ─── مرحله ۲: انتقال Tenants ────────────────────────────────
IF EXISTS (SELECT 1 FROM [ShopAccounting].dbo.Tenants)
BEGIN
    INSERT INTO [Tenants] (id, subDomain, companyName, planName, status, dbName, connectionStringEncrypted, isIsolated,
                           ownerName, ownerMobile, ownerEmail, address, registrationNumber, logoUrl, createdAt, updatedAt)
    SELECT id, subDomain, companyName, planName, status, dbName, connectionStringEncrypted, isIsolated,
           ownerName, ownerMobile, ownerEmail, address, registrationNumber, logoUrl, createdAt, updatedAt
    FROM [ShopAccounting].dbo.Tenants;

    PRINT '✅ Tenants migrated.';
END
ELSE
BEGIN
    PRINT '⚠️ No Tenants data to migrate.';
END
GO

-- ─── مرحله ۳: انتقال Subscriptions ─────────────────────────
IF EXISTS (SELECT 1 FROM [ShopAccounting].dbo.Subscriptions)
BEGIN
    INSERT INTO [Subscriptions] (id, tenantId, planId, startDate, endDate, status, autoRenew, createdAt)
    SELECT id, tenantId, planId, startDate, endDate, status, autoRenew, createdAt
    FROM [ShopAccounting].dbo.Subscriptions;

    PRINT '✅ Subscriptions migrated.';
END
GO

-- ─── مرحله ۴: انتقال SubscriptionPayments ───────────────────
IF EXISTS (SELECT 1 FROM [ShopAccounting].dbo.SubscriptionPayments)
BEGIN
    INSERT INTO [SubscriptionPayments] (id, subscriptionId, tenantId, amount, paymentMethod, paymentRef,
                                        isPaid, status, paidAt, createdAt)
    SELECT id, subscriptionId, tenantId, amount, paymentMethod, paymentRef,
           isPaid, status, paidAt, createdAt
    FROM [ShopAccounting].dbo.SubscriptionPayments;

    PRINT '✅ SubscriptionPayments migrated.';
END
GO

-- ─── مرحله ۵: انتقال PortalUsers ────────────────────────────
IF EXISTS (SELECT 1 FROM [ShopAccounting].dbo.PortalUsers)
BEGIN
    INSERT INTO [PortalUsers] (id, tenantId, username, password, mobile, role, permissions, isActive, lastLoginAt, createdAt)
    SELECT id, tenantId, username, password, mobile, role, permissions, isActive, lastLoginAt, createdAt
    FROM [ShopAccounting].dbo.PortalUsers;

    PRINT '✅ PortalUsers migrated.';
END
GO

-- ─── مرحله ۶: انتقال OtpCodes ──────────────────────────────
IF EXISTS (SELECT 1 FROM [ShopAccounting].dbo.OtpCodes)
BEGIN
    INSERT INTO [OtpCodes] (id, tenantId, mobile, code, purpose, isUsed, expiresAt, createdAt)
    SELECT id, tenantId, mobile, code, purpose, isUsed, expiresAt, createdAt
    FROM [ShopAccounting].dbo.OtpCodes;

    PRINT '✅ OtpCodes migrated.';
END
GO

-- ─── مرحله ۷: انتقال AuditLogs ─────────────────────────────
IF EXISTS (SELECT 1 FROM [ShopAccounting].dbo.AuditLogs)
BEGIN
    INSERT INTO [AuditLogs] (id, tenantId, userId, action, entityType, entityId, details, at)
    SELECT id, tenantId, userId, action, entityType, entityId, details, at
    FROM [ShopAccounting].dbo.AuditLogs;

    PRINT '✅ AuditLogs migrated.';
END
GO

-- ─── مرحله ۸: ایجاد UserLookups ─────────────────────────────
-- این مرحله مهم‌ترین بخش مهاجرت است!
-- برای هر StoreUser و PortalUser یک رکورد در UserLookup ایجاد می‌شود

-- ۸-۱: از StoreUsers
INSERT INTO [UserLookups] (id, username, tenantId, userType, isActive, createdAt)
SELECT
    NEWID() as id,
    username,
    tenantId,
    'storeUser' as userType,
    isActive,
    GETDATE() as createdAt
FROM [ShopAccounting].dbo.StoreUsers
WHERE username IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM [UserLookups] ul WHERE ul.username = [ShopAccounting].dbo.StoreUsers.username);

PRINT '✅ UserLookups created from StoreUsers.';
GO

-- ۸-۲: از PortalUsers
INSERT INTO [UserLookups] (id, username, tenantId, userType, isActive, createdAt)
SELECT
    NEWID() as id,
    username,
    tenantId,
    'portalUser' as userType,
    isActive,
    GETDATE() as createdAt
FROM [ShopAccounting].dbo.PortalUsers
WHERE username IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM [UserLookups] ul WHERE ul.username = [ShopAccounting].dbo.PortalUsers.username);

PRINT '✅ UserLookups created from PortalUsers.';
GO

PRINT '═══════════════════════════════════════════════════';
PRINT '✅ Data migration completed successfully!';
PRINT '═══════════════════════════════════════════════════';
GO
