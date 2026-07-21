/**
 * Database Index Creation Script
 * 
 * Run this script after prisma db push to create additional
 * indexes that Prisma doesn't auto-create.
 * 
 * Usage:
 *   npx tsx scripts/create-indexes.ts
 * 
 * Or run the SQL directly in SQL Server Management Studio.
 */

-- ============================================
-- Tenant-level indexes (for multi-tenant filtering)
-- ============================================

-- Products: covering index for product list page
CREATE NONCLUSTERED INDEX IX_Product_Tenant_Active_Name
ON [Product] ([tenantId], [isActive], [name])
INCLUDE ([code], [salePrice], [currentStock], [categoryId]);

-- Products: barcode lookup for POS scanner
CREATE NONCLUSTERED INDEX IX_Product_Barcode_Tenant
ON [Product] ([barcode], [tenantId])
WHERE [barcode] IS NOT NULL;

-- Invoices: covering index for invoice list page
CREATE NONCLUSTERED INDEX IX_Invoice_Tenant_Status_Date
ON [Invoice] ([tenantId], [status], [invoiceDate] DESC)
INCLUDE ([number], [customerId], [totalAmount], [paymentType]);

-- Invoices: overdue detection
CREATE NONCLUSTERED INDEX IX_Invoice_Overdue
ON [Invoice] ([dueDate], [status], [tenantId])
WHERE [status] IN ('Draft', 'PartiallyPaid') AND [dueDate] IS NOT NULL;

-- Customers: search by name
CREATE NONCLUSTERED INDEX IX_Customer_Tenant_Name
ON [Customer] ([tenantId], [firstName], [lastName])
INCLUDE ([code], [mobile], [currentBalance']);

-- Journal Entries: covering for accounting reports
CREATE NONCLUSTERED INDEX IX_JournalEntry_Tenant_Date_Status
ON [JournalEntry] ([tenantId], [entryDate] DESC, [status])
INCLUDE ([number], [entryType], [totalDebit], [totalCredit]);

-- Stock Movements: product movement history
CREATE NONCLUSTERED INDEX IX_StockMovement_Product_Date
ON [StockMovement] ([productId], [at] DESC)
INCLUDE ([movementType], [quantity], [reference]);

-- Notifications: unread count per user
CREATE NONCLUSTERED INDEX IX_Notification_User_Unread
ON [Notification] ([userId], [isRead])
WHERE [isRead] = 0;

-- Installments: due soon detection
CREATE NONCLUSTERED INDEX IX_Installment_Due_Pending
ON [Installment] ([dueDate], [status])
WHERE [status] = 'Pending';

-- OtpCode: optimized OTP lookup (covering index)
CREATE NONCLUSTERED INDEX IX_OtpCode_Lookup
ON [OtpCode] ([mobile], [purpose], [isUsed], [expiresAt] DESC)
WHERE [isUsed] = 0;

-- ============================================
-- Cleanup: Remove unused indexes
-- ============================================
-- Review and drop any indexes that are no longer used
-- SELECT * FROM sys.dm_db_unused_index_stats
