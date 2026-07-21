/**
 * Database Index Creation Script (TypeScript)
 * 
 * Creates performance-optimizing indexes on SQL Server.
 * Run after prisma db push to add indexes Prisma doesn't auto-create.
 * 
 * Usage:
 *   npx tsx scripts/create-indexes.ts
 */

import { PrismaClient } from '@/lib/prisma'

const prisma = new PrismaClient()

const indexes = [
  // Products: covering index for product list page
  `CREATE NONCLUSTERED INDEX IX_Product_Tenant_Active_Name
   ON [Product] ([tenantId], [isActive], [name])
   INCLUDE ([code], [salePrice], [currentStock], [categoryId]);`,

  // Products: barcode lookup for POS scanner
  `CREATE NONCLUSTERED INDEX IX_Product_Barcode_Tenant
   ON [Product] ([barcode], [tenantId])
   WHERE [barcode] IS NOT NULL;`,

  // Invoices: covering index for invoice list page
  `CREATE NONCLUSTERED INDEX IX_Invoice_Tenant_Status_Date
   ON [Invoice] ([tenantId], [status], [invoiceDate] DESC)
   INCLUDE ([number], [customerId], [totalAmount], [paymentType]);`,

  // Invoices: overdue detection
  `CREATE NONCLUSTERED INDEX IX_Invoice_Overdue
   ON [Invoice] ([dueDate], [status], [tenantId])
   WHERE [status] IN ('Draft', 'PartiallyPaid') AND [dueDate] IS NOT NULL;`,

  // Customers: search by name
  `CREATE NONCLUSTERED INDEX IX_Customer_Tenant_Name
   ON [Customer] ([tenantId], [firstName], [lastName])
   INCLUDE ([code], [mobile], [currentBalance']);`,

  // Journal Entries: covering for accounting reports
  `CREATE NONCLUSTERED INDEX IX_JournalEntry_Tenant_Date_Status
   ON [JournalEntry] ([tenantId], [entryDate] DESC, [status])
   INCLUDE ([number], [entryType], [totalDebit], [totalCredit']);`,

  // Stock Movements: product movement history
  `CREATE NONCLUSTERED INDEX IX_StockMovement_Product_Date
   ON [StockMovement] ([productId], [at] DESC)
   INCLUDE ([movementType], [quantity], [reference]);`,

  // Notifications: unread count per user
  `CREATE NONCLUSTERED INDEX IX_Notification_User_Unread
   ON [Notification] ([userId], [isRead])
   WHERE [isRead] = 0;`,

  // Installments: due soon detection
  `CREATE NONCLUSTERED INDEX IX_Installment_Due_Pending
   ON [Installment] ([dueDate], [status])
   WHERE [status] = 'Pending';`,
]

async function createIndexes() {
  console.log('🔧 Creating database indexes...\n')

  for (const sql of indexes) {
    try {
      await db.$executeRawUnsafe(sql)
      // Extract index name from SQL
      const match = sql.match(/IX_\w+/)
      const indexName = match ? match[0] : 'Unknown'
      console.log(`  ✅ Created: ${indexName}`)
    } catch (error: unknown) {
      // Index might already exist
      const msg = (error as Error).message || ''
      if (msg.includes('already exists') || msg.includes('already there')) {
        const match = sql.match(/IX_\w+/)
        const indexName = match ? match[0] : 'Unknown'
        console.log(`  ⏭️  Already exists: ${indexName}`)
      } else {
        console.error(`  ❌ Error: ${msg.substring(0, 100)}`)
      }
    }
  }

  console.log('\n✅ Index creation complete!')
  await db.$disconnect()
}

createIndexes().catch((error) => {
  console.error('Failed to create indexes:', error)
  process.exit(1)
})
