-- ============================================================================
-- create-missing-tables.sql — ShopAccounting v9.0
-- ============================================================================
-- ★ این اسکریپت رو روی دیتابیس ShopAccounting اجرا کنید
-- ★ جدول‌هایی که در دیتابیس اشتراکی وجود ندارند رو ایجاد می‌کند
-- ★ اجرا: sqlcmd -S localhost -U sa -P "As@1180" -d ShopAccounting -i create-missing-tables.sql
-- ============================================================================

-- ─── جدول دسته‌بندی‌ها ─────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Categories')
BEGIN
  CREATE TABLE Categories (
    id        NVARCHAR(450) NOT NULL PRIMARY KEY DEFAULT NEWID(),
    name      NVARCHAR(200) NOT NULL,
    parentId  NVARCHAR(450) NULL,
    isActive  BIT NOT NULL DEFAULT 1,
    sortOrder INT NOT NULL DEFAULT 0,
    tenantId  NVARCHAR(450) NULL,
    createdAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  PRINT '✅ Categories table created';
END
ELSE
  PRINT '⏭️ Categories table already exists';

-- ─── جدول درگاه‌های پرداخت ─────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PaymentGateways')
BEGIN
  CREATE TABLE PaymentGateways (
    id         NVARCHAR(450) NOT NULL PRIMARY KEY DEFAULT NEWID(),
    name       NVARCHAR(200) NOT NULL,
    type       NVARCHAR(50)  NOT NULL DEFAULT 'zarinpal',
    apiKey     NVARCHAR(500) NULL,
    merchantId NVARCHAR(200) NULL,
    isActive   BIT NOT NULL DEFAULT 0,
    sandbox    BIT NOT NULL DEFAULT 1,
    tenantId   NVARCHAR(450) NULL,
    createdAt  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updatedAt  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  PRINT '✅ PaymentGateways table created';
END
ELSE
  PRINT '⏭️ PaymentGateways table already exists';

-- ─── جدول کارتخوان‌ها ──────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PosDevices')
BEGIN
  CREATE TABLE PosDevices (
    id         NVARCHAR(450) NOT NULL PRIMARY KEY DEFAULT NEWID(),
    name       NVARCHAR(200) NOT NULL,
    terminalId NVARCHAR(100) NULL,
    isActive   BIT NOT NULL DEFAULT 1,
    tenantId   NVARCHAR(450) NULL,
    createdAt  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updatedAt  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  PRINT '✅ PosDevices table created';
END
ELSE
  PRINT '⏭️ PosDevices table already exists';

-- ─── جدول پشتیبان‌گیری ─────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Backups')
BEGIN
  CREATE TABLE Backups (
    id          NVARCHAR(450) NOT NULL PRIMARY KEY DEFAULT NEWID(),
    fileName    NVARCHAR(500) NOT NULL,
    fileSize    INT NOT NULL DEFAULT 0,
    recordCount INT NULL,
    data        NVARCHAR(MAX) NULL,
    createdAt   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    tenantId    NVARCHAR(450) NULL
  );
  PRINT '✅ Backups table created';
END
ELSE
  PRINT '⏭️ Backups table already exists';

PRINT '========================================';
PRINT '✅ All missing tables created successfully';
PRINT '========================================';
