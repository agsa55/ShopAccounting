/**
 * Fix Failed Indexes
 * 
 * Run: npx tsx scripts/fix-indexes.ts
 * 
 * Fixes 2 indexes that failed due to column name issues.
 */

import { PrismaClient } from '@/lib/prisma'

const prisma = new PrismaClient()

const fixIndexes = [
  // Fix: Customer name search (removed extra quote character)
  `CREATE NONCLUSTERED INDEX IX_Customer_Tenant_Name
   ON [Customer] ([tenantId], [firstName], [lastName])
   INCLUDE ([code], [mobile], [currentBalance]);`,

  // Fix: Journal entry covering index (removed extra quote character)
  `CREATE NONCLUSTERED INDEX IX_JournalEntry_Tenant_Date_Status
   ON [JournalEntry] ([tenantId], [entryDate] DESC, [status])
   INCLUDE ([number], [entryType], [totalDebit], [totalCredit]);`,
]

async function createFixIndexes() {
  console.log('🔧 Fixing failed indexes...\n')

  for (const sql of fixIndexes) {
    try {
      await db.$executeRawUnsafe(sql)
      const match = sql.match(/IX_\w+/)
      const indexName = match ? match[0] : 'Unknown'
      console.log(`  ✅ Fixed: ${indexName}`)
    } catch (error: unknown) {
      const msg = (error as Error).message || ''
      if (msg.includes('already exists')) {
        const match = sql.match(/IX_\w+/)
        const indexName = match ? match[0] : 'Unknown'
        console.log(`  ⏭️  Already exists: ${indexName}`)
      } else {
        console.error(`  ❌ Error: ${msg.substring(0, 200)}`)
      }
    }
  }

  console.log('\n✅ Index fix complete!')
  await db.$disconnect()
}

createFixIndexes().catch((error) => {
  console.error('Failed:', error)
  process.exit(1)
})
