-- ============================================================================
-- fix-stocklevels.sql — رفع خطای circular cascade در StockLevels
-- ============================================================================
-- مشکل: FK_StockLevels_Warehouses با CASCADE باعث circular cascade می‌شد
--   چون: Tenant -> Warehouses (CASCADE) -> StockLevels (CASCADE)
--        Tenant -> StockLevels (CASCADE)
--   SQL Server این را不允许 می‌کند.
--
-- راه‌حل: FK_StockLevels_Warehouses را به NO ACTION تغییر می‌دهیم
-- ============================================================================

USE ShopAccounting;
GO

-- ═══════════════════════════════════════════════════════════════
--  ۱. حذف StockLevels در صورت وجود ناقص
-- ═══════════════════════════════════════════════════════════════

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'StockLevels')
BEGIN
  DROP TABLE [StockLevels];
  PRINT 'Dropped: StockLevels';
END
GO

-- ═══════════════════════════════════════════════════════════════
--  ۲. ایجاد StockLevels با FK NO ACTION (نه CASCADE)
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
    -- ★★★ NO ACTION به جای CASCADE برای جلوگیری از circular cascade
    CONSTRAINT [FK_StockLevels_Warehouses] FOREIGN KEY ([warehouseId])
      REFERENCES [Warehouses]([id]) ON DELETE NO ACTION,
    CONSTRAINT [FK_StockLevels_Products] FOREIGN KEY ([productId])
      REFERENCES [Products]([id])
  );
  PRINT 'Created table: StockLevels (with NO ACTION FK)';
END
GO

-- ═══════════════════════════════════════════════════════════════
--  ۳. ایندکس‌های StockLevels
-- ═══════════════════════════════════════════════════════════════

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
--  ۴. انتقال موجودی فعلی محصولات به StockLevels
-- ═══════════════════════════════════════════════════════════════

DECLARE @tenantId NVARCHAR(1000)
DECLARE @warehouseId NVARCHAR(1000)

DECLARE wh_cursor CURSOR FOR
  SELECT tenantId, id FROM Warehouses WHERE isDefault = 1

OPEN wh_cursor
FETCH NEXT FROM wh_cursor INTO @tenantId, @warehouseId

WHILE @@FETCH_STATUS = 0
BEGIN
  IF NOT EXISTS (SELECT 1 FROM StockLevels WHERE tenantId = @tenantId)
  BEGIN
    INSERT INTO StockLevels (id, tenantId, warehouseId, productId, quantity, averageCost, createdAt, updatedAt)
    SELECT NEWID(), p.tenantId, @warehouseId, p.id, p.currentStock, p.purchasePrice, GETUTCDATE(), GETUTCDATE()
    FROM Products p
    WHERE p.tenantId = @tenantId AND p.currentStock > 0

    PRINT 'Migrated stock for tenant: ' + @tenantId
  END

  FETCH NEXT FROM wh_cursor INTO @tenantId, @warehouseId
END

CLOSE wh_cursor
DEALLOCATE wh_cursor
GO

-- ═══════════════════════════════════════════════════════════════
--  ۵. تأیید
-- ═══════════════════════════════════════════════════════════════

SELECT COUNT(*) AS stock_count FROM StockLevels;
PRINT 'Fix completed successfully.';
GO
