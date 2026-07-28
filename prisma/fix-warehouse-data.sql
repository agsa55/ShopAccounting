-- ============================================================================
-- fix-warehouse-data.sql — رفع متن خراب انبار
-- ============================================================================

USE ShopAccounting;
GO

-- ★ نمایش داده‌های فعلی
SELECT id, name, code, isDefault, isActive FROM Warehouses;
GO

-- ★ رفع متن خراب: ط§ظ†ط¨ط§ط± ط§طµظ„غŒ → انبار اصلی
UPDATE Warehouses 
SET name = N'انبار اصلی'
WHERE code = 'WH-MAIN' AND isDefault = 1;
GO

-- ★ تأیید
SELECT id, name, code, isDefault, isActive FROM Warehouses;
GO

PRINT 'Fix completed.';
GO
