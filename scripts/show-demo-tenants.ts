// ============================================================================
// scripts/show-demo-tenants.ts — List all demo tenants (v9.2.1 ★★★)
// ----------------------------------------------------------------------------
// این اسکریپت تمام tenant های دمو را نمایش می‌دهد:
//   - نام کاربری
//   - زیردامنه
//   - شماره موبایل
//   - وضعیت (demo / demo_pending)
//   - تاریخ انقضا
//   - روزهای باقی‌مانده
//
// ★ نحوه اجرا:
//   npx ts-node scripts/show-demo-tenants.ts
//
// ★★★ توجه: رمز عبور در دیتابیس hash شده و قابل بازیابی نیست.
//   برای بازنشانی رمز عبور، از اسکریپت reset-demo-password.ts استفاده کنید.
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PrismaClient } = require('../src/generated/client')

const prisma = new PrismaClient()

async function main() {
  console.log('\n📋 لیست تمام tenant های دمو:\n')
  console.log('═'.repeat(100))

  // ★ پیدا کردن تمام tenant های دمو
  const demoTenants = await prisma.tenant.findMany({
    where: {
      status: { in: ['demo', 'demo_pending'] },
    },
    include: {
      storeUsers: {
        select: {
          username: true,
          mobile: true,
          role: true,
          isActive: true,
        },
      },
      planTier: {
        select: {
          name: true,
          nameFa: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (demoTenants.length === 0) {
    console.log('\n❌ هیچ tenant دمویی یافت نشد.\n')
    return
  }

  console.log(`\n✓ تعداد tenant های دمو: ${demoTenants.length}\n`)

  const now = new Date()

  for (let i = 0; i < demoTenants.length; i++) {
    const t = demoTenants[i]
    const expiresAt = t.expiresAt ? new Date(t.expiresAt) : null
    const isExpired = expiresAt ? expiresAt < now : false
    const daysRemaining = expiresAt
      ? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : -1

    console.log(`\n${i + 1}. ${t.companyName}`)
    console.log(`   📱 موبایل:     ${t.ownerMobile || '—'}`)
    console.log(`   🌐 زیردامنه:   ${t.subDomain}`)
    console.log(`   📍 URL کامل:   ${t.subDomain}.shopaccounting.ir`)
    console.log(`   📊 وضعیت:      ${t.status} ${isExpired ? '(منقضی شده)' : '(فعال)'}`)
    if (expiresAt) {
      console.log(`   ⏰ انقضا:      ${expiresAt.toISOString()}`)
      console.log(`   ⏳ روز باقی:   ${isExpired ? 0 : daysRemaining} روز`)
    }
    console.log(`   📅 ایجاد:      ${t.createdAt.toISOString()}`)

    if (t.planTier) {
      console.log(`   🎯 پلن:        ${t.planTier.nameFa} (${t.planTier.name})`)
    }

    // ★ نمایش کاربران (نام کاربری)
    if (t.storeUsers && t.storeUsers.length > 0) {
      console.log(`   👥 کاربران:`)
      for (const u of t.storeUsers) {
        console.log(`      • نام کاربری: ${u.username} | نقش: ${u.role} | فعال: ${u.isActive ? 'بله' : 'خیر'}`)
      }
    } else {
      console.log(`   👥 کاربران:    هیچ کاربری یافت نشد`)
    }

    console.log(`   ${'─'.repeat(80)}`)
  }

  console.log('\n💡 برای بازنشانی رمز عبور یک tenant دمو:')
  console.log('   npx ts-node scripts/reset-demo-password.ts <username-or-mobile> <new-password>')
  console.log('\nمثال:')
  console.log('   npx ts-node scripts/reset-demo-password.ts demo_5678_abcd myNewPass123')
  console.log('   npx ts-node scripts/reset-demo-password.ts 09377498180 myNewPass123\n')
}

main()
  .catch((error) => {
    console.error('❌ خطا:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
