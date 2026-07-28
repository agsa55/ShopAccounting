-- ============================================================================
-- fix-inventory-migration.sql — رفع خطای NVARCHAR(1000) + FK
-- ============================================================================
-- مشکل: Tenants.id از نوع NVARCHAR(1000) است، اما migration قبلی NVARCHAR(450) استفاده کرد.
-- راه‌حل: همه جداول جدید را با NVARCHAR(1000) می‌سازیم.
-- ============================================================================

USE ShopAccounting;
GO

-- ═══════════════════════════════════════════════════════════════
--  پاک کردن جداول قبلی (در صورت وجود ناقص)
-- ═══════════════════════════════════════════════════════════════

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PurchaseInvoiceItems')
BEGIN
  DROP TABLE [PurchaseInvoiceItems];
  PRINT 'Dropped: PurchaseInvoiceItems';
END
GO

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PurchaseInvoices')
BEGIN
  DROP TABLE [PurchaseInvoices];
  PRINT 'Dropped: PurchaseInvoices';
END
GO

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'StockMovements')
BEGIN
  DROP TABLE [StockMovements];
  PRINT 'Dropped: StockMovements';
END
GO

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'StockLevels')
BEGIN
  DROP TABLE [StockLevels];
  PRINT 'Dropped: StockLevels';
END
GO

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Suppliers')
BEGIN
  DROP TABLE [Suppliers];
  PRINT 'Dropped: Suppliers';
END
GO

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Warehouses')
BEGIN
  DROP TABLE [Warehouses];
  PRINT 'Dropped: Warehouses';
END
GO

-- ═══════════════════════════════════════════════════════════════
--  ۱. ایجاد جدول Warehouses (با NVARCHAR(1000))
-- ═══════════════════════════════════════════════════════════════

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Warehouses')
BEGIN
  CREATE TABLE [Warehouses] (
    [id]              NVARCHAR(1000) NOT NULL,
    [tenantId]        NVARCHAR(1000) NOT NULL,
    [name]            NVARCHAR(200)  NOT NULL,
    [code]            NVARCHAR(50)   NOT NULL,
    [isDefault]       BIT            NOT NULL DEFAULT 0,
    [isActive]        BIT            NOT NULL DEFAULT 1,
    [branchId]        NVARCHAR(1000) NULL,
    [createdAt]       DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
    [updatedAt]       DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_Warehouses] PRIMARY KEY ([id]),
    CONSTRAINT [FK_Warehouses_Tenants] FOREIGN KEY ([tenantId])
      REFERENCES [Tenants]([id]) ON DELETE CASCADE
  );
  PRINT 'Created table: Warehouses';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Warehouses_tenantId' AND object_id = OBJECT_ID('Warehouses'))
BEGIN
  CREATE INDEX [IX_Warehouses_tenantId] ON [Warehouses] ([tenantId]);
  PRINT 'Created index: IX_Warehouses_tenantId';
END
GO

-- ═══════════════════════════════════════════════════════════════
--  ۲. ایجاد جدول StockLevels
-- ═══════════════════════════════════════════════════════════════

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'StockLevels')
BEGIN
  CREATE TABLE [StockLevels] (
    [id]              NVARCHAR(1000) NOT NULL,
    [tenantId]        NVARCHAR(1000) NOT NULL,
    [warehouseId]     NVARCHAR(1000) NOT NULL,
    [productId]       NVARCHAR(1000) NOT NULL,
    [quantity]        FLOAT          NOT NULL DEFAULT 0,
    [averageCost]     FLOAT          NOT NULL DEFAULT 0,
    [createdAt]       DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
    [updatedAt]       DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_StockLevels] PRIMARY KEY ([id]),
    CONSTRAINT [UQ_StockLevels_warehouse_product] UNIQUE ([warehouseId], [productId]),
    CONSTRAINT [FK_StockLevels_Tenants] FOREIGN KEY ([tenantId])
      REFERENCES [Tenants]([id]) ON DELETE CASCADE,
    CONSTRAINT [FK_StockLevels_Warehouses] FOREIGN KEY ([warehouseId])
      REFERENCES [Warehouses]([id]) ON DELETE CASCADE,
    CONSTRAINT [FK_StockLevels_Products] FOREIGN KEY ([productId])
      REFERENCES [Products]([id])
  );
  PRINT 'Created table: StockLevels';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_StockLevels_tenantId' AND object_id = OBJECT_ID('StockLevels'))
BEGIN
  CREATE INDEX [IX_StockLevels_tenantId] ON [StockLevels] ([tenantId]);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_StockLevels_productId' AND object_id = OBJECT_ID('StockLevels'))
BEGIN
  CREATE INDEX [IX_StockLevels_productId] ON [StockLevels] ([productId]);
END
GO

-- ═══════════════════════════════════════════════════════════════
--  ۳. ایجاد جدول StockMovements (بدون FK به Warehouses برای جلوگیری از circular cascade)
-- ═══════════════════════════════════════════════════════════════

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'StockMovements')
BEGIN
  CREATE TABLE [StockMovements] (
    [id]                NVARCHAR(1000) NOT NULL,
    [tenantId]          NVARCHAR(1000) NOT NULL,
    [productId]         NVARCHAR(1000) NOT NULL,
    [fromWarehouseId]   NVARCHAR(1000) NULL,
    [toWarehouseId]     NVARCHAR(1000) NULL,
    [quantity]          FLOAT          NOT NULL,
    [unitCost]          FLOAT          NOT NULL DEFAULT 0,
    [movementType]      NVARCHAR(50)   NOT NULL,
    [referenceType]     NVARCHAR(50)   NULL,
    [referenceId]       NVARCHAR(1000) NULL,
    [description]       NVARCHAR(500)  NULL,
    [createdAt]         DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_StockMovements] PRIMARY KEY ([id]),
    CONSTRAINT [FK_StockMovements_Tenants] FOREIGN KEY ([tenantId])
      REFERENCES [Tenants]([id]) ON DELETE CASCADE,
    CONSTRAINT [FK_StockMovements_Products] FOREIGN KEY ([productId])
      REFERENCES [Products]([id])
    -- ★ بدون FK به Warehouses برای جلوگیری از circular cascade
  );
  PRINT 'Created table: StockMovements';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_StockMovements_tenantId' AND object_id = OBJECT_ID('StockMovements'))
BEGIN
  CREATE INDEX [IX_StockMovements_tenantId] ON [StockMovements] ([tenantId]);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_StockMovements_productId' AND object_id = OBJECT_ID('StockMovements'))
BEGIN
  CREATE INDEX [IX_StockMovements_productId] ON [StockMovements] ([productId]);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_StockMovements_reference' AND object_id = OBJECT_ID('StockMovements'))
BEGIN
  CREATE INDEX [IX_StockMovements_reference] ON [StockMovements] ([referenceType], [referenceId]);
END
GO

-- ═══════════════════════════════════════════════════════════════
--  ۴. ایجاد جدول Suppliers
-- ═══════════════════════════════════════════════════════════════

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Suppliers')
BEGIN
  CREATE TABLE [Suppliers] (
    [id]              NVARCHAR(1000) NOT NULL,
    [tenantId]        NVARCHAR(1000) NOT NULL,
    [code]            NVARCHAR(50)   NOT NULL,
    [name]            NVARCHAR(200)  NOT NULL,
    [mobile]          NVARCHAR(20)   NULL,
    [nationalCode]    NVARCHAR(20)   NULL,
    [address]         NVARCHAR(500)  NULL,
    [creditLimit]     FLOAT          NOT NULL DEFAULT 0,
    [currentBalance]  FLOAT          NOT NULL DEFAULT 0,
    [isActive]        BIT            NOT NULL DEFAULT 1,
    [createdAt]       DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
    [updatedAt]       DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_Suppliers] PRIMARY KEY ([id]),
    CONSTRAINT [FK_Suppliers_Tenants] FOREIGN KEY ([tenantId])
      REFERENCES [Tenants]([id]) ON DELETE CASCADE
  );
  PRINT 'Created table: Suppliers';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Suppliers_tenantId' AND object_id = OBJECT_ID('Suppliers'))
BEGIN
  CREATE INDEX [IX_Suppliers_tenantId] ON [Suppliers] ([tenantId]);
END
GO

-- ═══════════════════════════════════════════════════════════════
--  ۵. ایجاد جدول PurchaseInvoices
-- ═══════════════════════════════════════════════════════════════

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PurchaseInvoices')
BEGIN
  CREATE TABLE [PurchaseInvoices] (
    [id]              NVARCHAR(1000) NOT NULL,
    [tenantId]        NVARCHAR(1000) NOT NULL,
    [supplierId]      NVARCHAR(1000) NULL,
    [number]          NVARCHAR(50)   NOT NULL,
    [invoiceDate]     DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
    [dueDate]         DATETIME2      NULL,
    [status]          NVARCHAR(50)   NOT NULL DEFAULT 'draft',
    [paymentType]     NVARCHAR(50)   NOT NULL DEFAULT 'cash',
    [subTotal]        FLOAT          NOT NULL DEFAULT 0,
    [discountAmount]  FLOAT          NOT NULL DEFAULT 0,
    [taxAmount]       FLOAT          NOT NULL DEFAULT 0,
    [totalAmount]     FLOAT          NOT NULL DEFAULT 0,
    [paidAmount]      FLOAT          NOT NULL DEFAULT 0,
    [remainingAmount] FLOAT          NOT NULL DEFAULT 0,
    [warehouseId]     NVARCHAR(1000) NOT NULL,
    [journalEntryId]  NVARCHAR(1000) NULL,
    [description]     NVARCHAR(500)  NULL,
    [cashierId]       NVARCHAR(1000) NULL,
    [createdAt]       DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
    [updatedAt]       DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_PurchaseInvoices] PRIMARY KEY ([id]),
    CONSTRAINT [FK_PurchaseInvoices_Tenants] FOREIGN KEY ([tenantId])
      REFERENCES [Tenants]([id]) ON DELETE CASCADE,
    CONSTRAINT [FK_PurchaseInvoices_Suppliers] FOREIGN KEY ([supplierId])
      REFERENCES [Suppliers]([id]),
    CONSTRAINT [FK_PurchaseInvoices_Warehouses] FOREIGN KEY ([warehouseId])
      REFERENCES [Warehouses]([id])
    -- ★ بدون FK به JournalEntries برای جلوگیری از circular cascade
  );
  PRINT 'Created table: PurchaseInvoices';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PurchaseInvoices_tenantId' AND object_id = OBJECT_ID('PurchaseInvoices'))
BEGIN
  CREATE INDEX [IX_PurchaseInvoices_tenantId] ON [PurchaseInvoices] ([tenantId]);
END
GO

-- ═══════════════════════════════════════════════════════════════
--  ۶. ایجاد جدول PurchaseInvoiceItems
-- ═══════════════════════════════════════════════════════════════

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PurchaseInvoiceItems')
BEGIN
  CREATE TABLE [PurchaseInvoiceItems] (
    [id]                NVARCHAR(1000) NOT NULL,
    [purchaseInvoiceId] NVARCHAR(1000) NOT NULL,
    [productId]         NVARCHAR(1000) NULL,
    [productName]       NVARCHAR(200)  NOT NULL,
    [quantity]          FLOAT          NOT NULL DEFAULT 1,
    [unitPrice]         FLOAT          NOT NULL DEFAULT 0,
    [discountAmount]    FLOAT          NOT NULL DEFAULT 0,
    [taxAmount]         FLOAT          NOT NULL DEFAULT 0,
    [lineTotal]         FLOAT          NOT NULL DEFAULT 0,
    CONSTRAINT [PK_PurchaseInvoiceItems] PRIMARY KEY ([id]),
    CONSTRAINT [FK_PurchaseInvoiceItems_PurchaseInvoices] FOREIGN KEY ([purchaseInvoiceId])
      REFERENCES [PurchaseInvoices]([id]) ON DELETE CASCADE,
    CONSTRAINT [FK_PurchaseInvoiceItems_Products] FOREIGN KEY ([productId])
      REFERENCES [Products]([id])
  );
  PRINT 'Created table: PurchaseInvoiceItems';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PurchaseInvoiceItems_purchaseInvoiceId' AND object_id = OBJECT_ID('PurchaseInvoiceItems'))
BEGIN
  CREATE INDEX [IX_PurchaseInvoiceItems_purchaseInvoiceId] ON [PurchaseInvoiceItems] ([purchaseInvoiceId]);
END
GO

-- ═══════════════════════════════════════════════════════════════
--  ۷. ایجاد انبار پیش‌فرض + انتقال موجودی
-- ═══════════════════════════════════════════════════════════════

DECLARE @tenantId NVARCHAR(1000)
DECLARE @warehouseId NVARCHAR(1000)

DECLARE tenant_cursor CURSOR FOR
  SELECT DISTINCT id FROM Tenants WHERE status = 'active'

OPEN tenant_cursor
FETCH NEXT FROM tenant_cursor INTO @tenantId

WHILE @@FETCH_STATUS = 0
BEGIN
  IF NOT EXISTS (SELECT 1 FROM Warehouses WHERE tenantId = @tenantId)
  BEGIN
    SET @warehouseId = NEWID()
    INSERT INTO Warehouses (id, tenantId, name, code, isDefault, isActive, createdAt, updatedAt)
    VALUES (@warehouseId, @tenantId, N'انبار اصلی', 'WH-MAIN', 1, 1, GETUTCDATE(), GETUTCDATE())
    PRINT 'Created default warehouse for tenant: ' + @tenantId

    -- ★ انتقال موجودی فعلی
    INSERT INTO StockLevels (id, tenantId, warehouseId, productId, quantity, averageCost, createdAt, updatedAt)
    SELECT NEWID(), p.tenantId, @warehouseId, p.id, p.currentStock, p.purchasePrice, GETUTCDATE(), GETUTCDATE()
    FROM Products p
    WHERE p.tenantId = @tenantId AND p.currentStock > 0

    PRINT 'Migrated stock for tenant: ' + @tenantId
  END

  FETCH NEXT FROM tenant_cursor INTO @tenantId
END

CLOSE tenant_cursor
DEALLOCATE tenant_cursor
GO

PRINT 'Fix migration completed successfully.';
GO
