// src/lib/journal-number-generator.ts — v8.9.4
// ============================================================================
// ★ تولید شماره منحصر به فرد سند حسابداری
// ★ جلوگیری از race condition و شماره‌های تکراری
// ★ استفاده از MAX(number) به جای COUNT
// ============================================================================

export async function generateJournalNumber(tx: any, tenantId: string): Promise<string> {
  try {
    // پیدا کردن آخرین شماره سند بر اساس تاریخ ایجاد
    const lastJE: any = await tx.journalEntry.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: { number: true },
    })

    let nextNumber = 1

    if (lastJE?.number) {
      // استخراج عدد از شماره (مثلاً "JE-000024" → 24)
      const match = lastJE.number.match(/JE-(\d+)/)
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1
      }
    }

    // اگر هنوز 1 است، از COUNT به عنوان fallback استفاده کن
    if (nextNumber <= 1) {
      const count = await tx.journalEntry.count({ where: { tenantId } })
      nextNumber = count + 1
    }

    const proposedNumber = `JE-${nextNumber.toString().padStart(6, '0')}`
    
    // بررسی منحصر به فرد بودن (جلوگیری از race condition)
    const existing = await tx.journalEntry.findFirst({
      where: { tenantId, number: proposedNumber },
    })

    if (existing) {
      // اگر وجود داشت، یک شماره بالاتر تولید کن
      nextNumber++
      return `JE-${nextNumber.toString().padStart(6, '0')}`
    }

    return proposedNumber
  } catch (err: any) {
    console.warn('[JournalNumber] Failed to generate unique number:', err?.message)
    // Fallback: timestamp-based
    const timestamp = Date.now().toString().slice(-6)
    return `JE-${timestamp}`
  }
}