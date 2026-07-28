-- ============================================================================
-- SQL Script — ایجاد جداول InstallmentPlans و InstallmentSchedules
-- ShopAccounting v24.0 — Multi-tenant SaaS Platform
-- ============================================================================
-- ★ این اسکریپت باید روی دیتابیس‌های موجود (اشتراکی و اختصاصی) اجرا بشود
-- ★ دیتابیس‌های جدید: خودکار توسط tenant-provisioning.ts (v24) این جداول رو خواهند داشت
-- ★ تمام دستورات از IF NOT EXISTS استفاده می‌کنند — امن برای اجرای چندباره
-- ★ ساختار جداول دقیقاً مطابق tenant-provisioning.ts و tenant-schema.prisma
-- ★ id از نوع NVARCHAR(450) — سازگار با Prisma @default(uuid())
-- ★ بعد از اجرا: npx prisma generate --schema=prisma/tenant/schema.prisma
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════
--  جدول پلن‌های قسطی
-- ═══════════════════════════════════════════════════════════════

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'InstallmentPlans')
BEGIN
    CREATE TABLE InstallmentPlans (
        id                    NVARCHAR(450)  NOT NULL PRIMARY KEY DEFAULT REPLACE(CAST(NEWID() AS NVARCHAR(36)), '-', ''),
        invoiceId             NVARCHAR(450)  NOT NULL,           -- FK → Invoices
        customerId            NVARCHAR(450)  NULL,               -- FK → Customers
        totalAmount           FLOAT          NOT NULL DEFAULT 0, -- مبلغ کل فاکتور
        downPayment           FLOAT          NOT NULL DEFAULT 0, -- پیش‌پرداخت
        remainingAmount       FLOAT          NOT NULL DEFAULT 0, -- مبلغ باقیمانده
        interestRate          FLOAT          NOT NULL DEFAULT 0, -- درصد سود
        totalWithInterest     FLOAT          NOT NULL DEFAULT 0, -- مبلغ کل با سود
        numberOfInstallments  INT            NOT NULL DEFAULT 1, -- تعداد اقساط
        installmentAmount     FLOAT          NOT NULL DEFAULT 0, -- مبلغ هر قسط
        installmentPeriod     NVARCHAR(20)   NOT NULL DEFAULT N'monthly', -- دوره قسط
        status                NVARCHAR(20)   NOT NULL DEFAULT N'active',  -- وضعیت
        paidInstallments      INT            NOT NULL DEFAULT 0, -- اقساط پرداخت شده
        totalPaidAmount       FLOAT          NOT NULL DEFAULT 0, -- مجموع پرداخت شده
        nextDueDate           DATETIME2      NULL,               -- تاریخ سررسید بعدی
        description           NVARCHAR(500)  NULL,               -- توضیحات
        tenantId              NVARCHAR(450)  NULL,               -- شناسه فروشگاه
        createdAt             DATETIME2      NOT NULL DEFAULT GETDATE(),
        updatedAt             DATETIME2      NOT NULL DEFAULT GETDATE()
    );

    PRINT '✓ Table InstallmentPlans created successfully';
END
ELSE
BEGIN
    PRINT '⊗ Table InstallmentPlans already exists — skipping';
END
GO

-- ایندکس‌های InstallmentPlans
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_InstallmentPlans_invoiceId' AND object_id = OBJECT_ID('InstallmentPlans'))
    CREATE UNIQUE INDEX [IX_InstallmentPlans_invoiceId] ON [InstallmentPlans]([invoiceId]);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_InstallmentPlans_customerId' AND object_id = OBJECT_ID('InstallmentPlans'))
    CREATE INDEX [IX_InstallmentPlans_customerId] ON [InstallmentPlans]([customerId]) WHERE [customerId] IS NOT NULL;
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_InstallmentPlans_status' AND object_id = OBJECT_ID('InstallmentPlans'))
    CREATE INDEX [IX_InstallmentPlans_status] ON [InstallmentPlans]([status]);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_InstallmentPlans_nextDueDate' AND object_id = OBJECT_ID('InstallmentPlans'))
    CREATE INDEX [IX_InstallmentPlans_nextDueDate] ON [InstallmentPlans]([nextDueDate]) WHERE [nextDueDate] IS NOT NULL;
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_InstallmentPlans_tenantId' AND object_id = OBJECT_ID('InstallmentPlans'))
    CREATE INDEX [IX_InstallmentPlans_tenantId] ON [InstallmentPlans]([tenantId]) WHERE [tenantId] IS NOT NULL;
GO

-- ═══════════════════════════════════════════════════════════════
--  جدول اقساط
-- ═══════════════════════════════════════════════════════════════

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'InstallmentSchedules')
BEGIN
    CREATE TABLE InstallmentSchedules (
        id                 NVARCHAR(450)  NOT NULL PRIMARY KEY DEFAULT REPLACE(CAST(NEWID() AS NVARCHAR(36)), '-', ''),
        planId             NVARCHAR(450)  NOT NULL,           -- FK → InstallmentPlans
        installmentNumber  INT            NOT NULL,           -- شماره قسط
        amount             FLOAT          NOT NULL DEFAULT 0, -- مبلغ قسط
        dueDate            DATETIME2      NOT NULL,           -- تاریخ سررسید
        status             NVARCHAR(20)   NOT NULL DEFAULT N'pending', -- وضعیت
        paidAmount         FLOAT          NOT NULL DEFAULT 0, -- مبلغ پرداخت شده
        paidAt             DATETIME2      NULL,               -- تاریخ پرداخت
        paymentRef         NVARCHAR(100)  NULL,               -- مرجع پرداخت
        notes              NVARCHAR(500)  NULL,               -- یادداشت
        tenantId           NVARCHAR(450)  NULL,               -- شناسه فروشگاه
        createdAt          DATETIME2      NOT NULL DEFAULT GETDATE(),
        updatedAt          DATETIME2      NOT NULL DEFAULT GETDATE()
    );

    PRINT '✓ Table InstallmentSchedules created successfully';
END
ELSE
BEGIN
    PRINT '⊗ Table InstallmentSchedules already exists — skipping';
END
GO

-- ایندکس‌های InstallmentSchedules
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_InstallmentSchedules_planId_number' AND object_id = OBJECT_ID('InstallmentSchedules'))
    CREATE INDEX [IX_InstallmentSchedules_planId_number] ON [InstallmentSchedules]([planId], [installmentNumber]);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_InstallmentSchedules_status' AND object_id = OBJECT_ID('InstallmentSchedules'))
    CREATE INDEX [IX_InstallmentSchedules_status] ON [InstallmentSchedules]([status]);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_InstallmentSchedules_dueDate' AND object_id = OBJECT_ID('InstallmentSchedules'))
    CREATE INDEX [IX_InstallmentSchedules_dueDate] ON [InstallmentSchedules]([dueDate]);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_InstallmentSchedules_tenantId' AND object_id = OBJECT_ID('InstallmentSchedules'))
    CREATE INDEX [IX_InstallmentSchedules_tenantId] ON [InstallmentSchedules]([tenantId]) WHERE [tenantId] IS NOT NULL;
GO

-- ═══════════════════════════════════════════════════════════════
--  بروزرسانی Invoices — اضافه شدن ستون installmentPlanId
-- ═══════════════════════════════════════════════════════════════

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Invoices' AND COLUMN_NAME = 'installmentPlanId')
BEGIN
    ALTER TABLE Invoices ADD installmentPlanId NVARCHAR(450) NULL;
    PRINT '✓ Column installmentPlanId added to Invoices';
END
GO

-- ═══════════════════════════════════════════════════════════════
--  Foreign Keys
-- ═══════════════════════════════════════════════════════════════

-- InstallmentPlans → Invoices
IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_InstallmentPlans_Invoice')
    ALTER TABLE [InstallmentPlans] ADD CONSTRAINT [FK_InstallmentPlans_Invoice]
    FOREIGN KEY ([invoiceId]) REFERENCES [Invoices]([id]) ON DELETE CASCADE;
GO

-- InstallmentPlans → Customers
IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_InstallmentPlans_Customer')
    ALTER TABLE [InstallmentPlans] ADD CONSTRAINT [FK_InstallmentPlans_Customer]
    FOREIGN KEY ([customerId]) REFERENCES [Customers]([id]);
GO

-- InstallmentSchedules → InstallmentPlans
IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_InstallmentSchedules_Plan')
    ALTER TABLE [InstallmentSchedules] ADD CONSTRAINT [FK_InstallmentSchedules_Plan]
    FOREIGN KEY ([planId]) REFERENCES [InstallmentPlans]([id]) ON DELETE CASCADE;
GO

-- Invoices → InstallmentPlans
IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_Invoices_InstallmentPlan')
    ALTER TABLE [Invoices] ADD CONSTRAINT [FK_Invoices_InstallmentPlan]
    FOREIGN KEY ([installmentPlanId]) REFERENCES [InstallmentPlans]([id]);
GO

PRINT '================================================================';
PRINT '  v24 Migration completed successfully!';
PRINT '  New tables: InstallmentPlans, InstallmentSchedules';
PRINT '  New column: Invoices.installmentPlanId';
PRINT '  New FKs: FK_InstallmentPlans_Invoice, FK_InstallmentPlans_Customer,';
PRINT '           FK_InstallmentSchedules_Plan, FK_Invoices_InstallmentPlan';
PRINT '  Run: npx prisma generate --schema=prisma/tenant/schema.prisma';
PRINT '================================================================';
