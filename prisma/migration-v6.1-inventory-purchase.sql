-- ============================================================================
-- prisma/migration-v6.1-inventory-purchase.sql
-- ShopAccounting v6.1 — انبارداری + فاکتور خرید + تامین‌کنندگان
-- ============================================================================
-- این migration باید روی SQL Server اجرا شود.
-- اجرا: sqlcmd -S localhost -d ShopAccounting -U sa -P "As@1180" -i prisma/migration-v6.1-inventory-purchase.sql
-- ============================================================================

USE ShopAccounting;
GO

-- ═══════════════════════════════════════════════════════════════
--  ۱. افزودن warehouseId به Invoices
-- ═══════════════════════════════════════════════════════════════

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Invoices' AND COLUMN_NAME = 'warehouseId')
BEGIN
  ALTER TABLE [Invoices] ADD [warehouseId] NVARCHAR(450) NULL;
  PRINT 'Added column: Invoices.warehouseId';
END
GO

-- ═══════════════════════════════════════════════════════════════
--  ۲. ایجاد جدول Warehouses
-- ═══════════════════════════════════════════════════════════════

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Warehouses')
BEGIN
  CREATE TABLE [Warehouses] (
    [id]              NVARCHAR(450) NOT NULL,
    [tenantId]        NVARCHAR(450) NOT NULL,
    [name]            NVARCHAR(200) NOT NULL,
    [code]            NVARCHAR(50)  NOT NULL,
    [isDefault]       BIT           NOT NULL DEFAULT 0,
    [isActive]        BIT           NOT NULL DEFAULT 1,
    [branchId]        NVARCHAR(450) NULL,
    [createdAt]       DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    [updatedAt]       DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
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
--  ۳. ایجاد جدول StockLevels (موجودی هر کالا در هر انبار)
-- ═══════════════════════════════════════════════════════════════

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'StockLevels')
BEGIN
  CREATE TABLE [StockLevels] (
    [id]              NVARCHAR(450) NOT NULL,
    [tenantId]        NVARCHAR(450) NOT NULL,
    [warehouseId]     NVARCHAR(450) NOT NULL,
    [productId]       NVARCHAR(450) NOT NULL,
    [quantity]        FLOAT         NOT NULL DEFAULT 0,
    [averageCost]     FLOAT         NOT NULL DEFAULT 0,
    [createdAt]       DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    [updatedAt]       DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
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
  PRINT 'Created index: IX_StockLevels_tenantId';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_StockLevels_productId' AND object_id = OBJECT_ID('StockLevels'))
BEGIN
  CREATE INDEX [IX_StockLevels_productId] ON [StockLevels] ([productId]);
  PRINT 'Created index: IX_StockLevels_productId';
END
GO

-- ═══════════════════════════════════════════════════════════════
--  ۴. ایجاد جدول StockMovements (حرکت کالا)
-- ═══════════════════════════════════════════════════════════════

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'StockMovements')
BEGIN
  CREATE TABLE [StockMovements] (
    [id]                NVARCHAR(450) NOT NULL,
    [tenantId]          NVARCHAR(450) NOT NULL,
    [productId]         NVARCHAR(450) NOT NULL,
    [fromWarehouseId]   NVARCHAR(450) NULL,
    [toWarehouseId]     NVARCHAR(450) NULL,
    [quantity]          FLOAT         NOT NULL,
    [unitCost]          FLOAT         NOT NULL DEFAULT 0,
    [movementType]      NVARCHAR(50)  NOT NULL,
    [referenceType]     NVARCHAR(50)  NULL,
    [referenceId]       NVARCHAR(450) NULL,
    [description]       NVARCHAR(500) NULL,
    [createdAt]         DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_StockMovements] PRIMARY KEY ([id]),
    CONSTRAINT [FK_StockMovements_Tenants] FOREIGN KEY ([tenantId])
      REFERENCES [Tenants]([id]) ON DELETE CASCADE,
    CONSTRAINT [FK_StockMovements_Products] FOREIGN KEY ([productId])
      REFERENCES [Products]([id]),
    CONSTRAINT [FK_StockMovements_Warehouses_From] FOREIGN KEY ([fromWarehouseId])
      REFERENCES [Warehouses]([id]),
    CONSTRAINT [FK_StockMovements_Warehouses_To] FOREIGN KEY ([toWarehouseId])
      REFERENCES [Warehouses]([id])
  );
  PRINT 'Created table: StockMovements';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_StockMovements_tenantId' AND object_id = OBJECT_ID('StockMovements'))
BEGIN
  CREATE INDEX [IX_StockMovements_tenantId] ON [StockMovements] ([tenantId]);
  PRINT 'Created index: IX_StockMovements_tenantId';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_StockMovements_productId' AND object_id = OBJECT_ID('StockMovements'))
BEGIN
  CREATE INDEX [IX_StockMovements_productId] ON [StockMovements] ([productId]);
  PRINT 'Created index: IX_StockMovements_productId';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_StockMovements_reference' AND object_id = OBJECT_ID('StockMovements'))
BEGIN
  CREATE INDEX [IX_StockMovements_reference] ON [StockMovements] ([referenceType], [referenceId]);
  PRINT 'Created index: IX_StockMovements_reference';
END
GO

-- ═══════════════════════════════════════════════════════════════
--  ۵. ایجاد جدول Suppliers (تامین‌کنندگان)
-- ═══════════════════════════════════════════════════════════════

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Suppliers')
BEGIN
  CREATE TABLE [Suppliers] (
    [id]              NVARCHAR(450) NOT NULL,
    [tenantId]        NVARCHAR(450) NOT NULL,
    [code]            NVARCHAR(50)  NOT NULL,
    [name]            NVARCHAR(200) NOT NULL,
    [mobile]          NVARCHAR(20)  NULL,
    [nationalCode]    NVARCHAR(20)  NULL,
    [address]         NVARCHAR(500) NULL,
    [creditLimit]     FLOAT         NOT NULL DEFAULT 0,
    [currentBalance]  FLOAT         NOT NULL DEFAULT 0,
    [isActive]        BIT           NOT NULL DEFAULT 1,
    [createdAt]       DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    [updatedAt]       DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
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
  PRINT 'Created index: IX_Suppliers_tenantId';
END
GO

-- ═══════════════════════════════════════════════════════════════
--  ۶. ایجاد جدول PurchaseInvoices (فاکتور خرید)
-- ═══════════════════════════════════════════════════════════════

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PurchaseInvoices')
BEGIN
  CREATE TABLE [PurchaseInvoices] (
    [id]              NVARCHAR(450) NOT NULL,
    [tenantId]        NVARCHAR(450) NOT NULL,
    [supplierId]      NVARCHAR(450) NULL,
    [number]          NVARCHAR(50)  NOT NULL,
    [invoiceDate]     DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    [dueDate]         DATETIME2     NULL,
    [status]          NVARCHAR(50)  NOT NULL DEFAULT 'draft',
    [paymentType]     NVARCHAR(50)  NOT NULL DEFAULT 'cash',
    [subTotal]        FLOAT         NOT NULL DEFAULT 0,
    [discountAmount]  FLOAT         NOT NULL DEFAULT 0,
    [taxAmount]       FLOAT         NOT NULL DEFAULT 0,
    [totalAmount]     FLOAT         NOT NULL DEFAULT 0,
    [paidAmount]      FLOAT         NOT NULL DEFAULT 0,
    [remainingAmount] FLOAT         NOT NULL DEFAULT 0,
    [warehouseId]     NVARCHAR(450) NOT NULL,
    [journalEntryId]  NVARCHAR(450) NULL,
    [description]     NVARCHAR(500) NULL,
    [cashierId]       NVARCHAR(450) NULL,
    [createdAt]       DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    [updatedAt]       DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_PurchaseInvoices] PRIMARY KEY ([id]),
    CONSTRAINT [FK_PurchaseInvoices_Tenants] FOREIGN KEY ([tenantId])
      REFERENCES [Tenants]([id]) ON DELETE CASCADE,
    CONSTRAINT [FK_PurchaseInvoices_Suppliers] FOREIGN KEY ([supplierId])
      REFERENCES [Suppliers]([id]),
    CONSTRAINT [FK_PurchaseInvoices_Warehouses] FOREIGN KEY ([warehouseId])
      REFERENCES [Warehouses]([id]),
    CONSTRAINT [FK_PurchaseInvoices_JournalEntries] FOREIGN KEY ([journalEntryId])
      REFERENCES [JournalEntries]([id])
  );
  PRINT 'Created table: PurchaseInvoices';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PurchaseInvoices_tenantId' AND object_id = OBJECT_ID('PurchaseInvoices'))
BEGIN
  CREATE INDEX [IX_PurchaseInvoices_tenantId] ON [PurchaseInvoices] ([tenantId]);
  PRINT 'Created index: IX_PurchaseInvoices_tenantId';
END
GO

-- ═══════════════════════════════════════════════════════════════
--  ۷. ایجاد جدول PurchaseInvoiceItems
-- ═══════════════════════════════════════════════════════════════

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PurchaseInvoiceItems')
BEGIN
  CREATE TABLE [PurchaseInvoiceItems] (
    [id]                NVARCHAR(450) NOT NULL,
    [purchaseInvoiceId] NVARCHAR(450) NOT NULL,
    [productId]         NVARCHAR(450) NULL,
    [productName]       NVARCHAR(200) NOT NULL,
    [quantity]          FLOAT         NOT NULL DEFAULT 1,
    [unitPrice]         FLOAT         NOT NULL DEFAULT 0,
    [discountAmount]    FLOAT         NOT NULL DEFAULT 0,
    [taxAmount]         FLOAT         NOT NULL DEFAULT 0,
    [lineTotal]         FLOAT         NOT NULL DEFAULT 0,
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
  PRINT 'Created index: IX_PurchaseInvoiceItems_purchaseInvoiceId';
END
GO

-- ═══════════════════════════════════════════════════════════════
--  ۸. ایجاد انبار پیش‌فرض برای tenant های موجود
--     و انتقال موجودی فعلی (currentStock) به StockLevels
-- ═══════════════════════════════════════════════════════════════

-- ★ برای هر tenant که انبار پیش‌فرض ندارد، یکی بساز
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Warehouses')
  OR NOT EXISTS (SELECT 1 FROM Warehouses)
BEGIN
  -- ★ استفاده از cursor برای ایجاد انبار پیش‌فرض برای هر tenant
  DECLARE @tenantId NVARCHAR(450)
  DECLARE @warehouseId NVARCHAR(450) = NEWID()
  
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
      
      -- ★ انتقال موجودی فعلی محصولات به StockLevels
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
END
GO

PRINT 'Migration v6.1-inventory-purchase completed successfully.';
GO
