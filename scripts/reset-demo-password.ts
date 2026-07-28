// ============================================================================
// scripts/reset-demo-password.ts — Reset demo tenant password (v9.2.1 ★★★)
// ----------------------------------------------------------------------------
// این اسکریپت رمز عبور یک tenant دمو را بازنشانی می‌کند.
//
// ★ نحوه اجرا:
//   npx ts-node scripts/reset-demo-password.ts <username-or-mobile> <new-password>
//
// مثال:
//   npx ts-node scripts/reset-demo-password.ts demo_5678_abcd myNewPass123
//   npx ts-node scripts/reset-demo-password.ts 09377498180 myNewPass123
//
// ★★★ این اسکریپت فقط برای tenant های دمو (status='demo' یا 'demo_pending') کار می‌کند.
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PrismaClient } = require('../src/generated/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  const args = process.argv.slice(2)

  if (args.length < 2) {
    console.log('\n❌ استفاده نادرست!')
    console.log('\n✓ نحوه استفاده:')
    console.log('   npx ts-node scripts/reset-demo-password.ts <username-or-mobile> <new-password>')
    console.log('\nمثال:')
    console.log('   npx ts-node scripts/reset-demo-password.ts demo_5678_abcd myNewPass123')
    console.log('   npx ts-node scripts/reset-demo-password.ts 09377498180 myNewPass123\n')
    process.exit(1)
  }

  const identifier = args[0]  // username یا mobile
  const newPassword = args[1]

  // ★ اعتبارسنجی رمز عبور جدید
  if (newPassword.length < 4) {
    console.log('\n❌ رمز عبور باید حداقل ۴ کاراکتر باشد.\n')
    process.exit(1)
  }

  console.log(`\n🔄 جستجوی tenant دمو با شناسه: ${identifier}\n`)

  // ★ پیدا کردن کاربر دمو بر اساس username یا mobile
  //   ابتدا بررسی کنیم که کاربر به tenant دمو متصل است
  const user = await prisma.storeUser.findFirst({
    where: {
      OR: [
        { username: identifier },
        { mobile: identifier },
      ],
    },
    include: {
      tenant: {
        select: {
          id: true,
          subDomain: true,
          companyName: true,
          status: true,
          ownerMobile: true,
          expiresAt: true,
        },
      },
    },
  })

  if (!user) {
    console.log(`❌ کاربری با شناسه "${identifier}" یافت نشد.\n`)
    process.exit(1)
  }

  console.log(`✓ کاربر یافت شد:`)
  console.log(`   👤 نام کاربری:  ${user.username}`)
  console.log(`   📱 موبایل:      ${user.mobile || '—'}`)
  console.log(`   🏪 فروشگاه:    ${user.tenant?.companyName || '—'}`)
  console.log(`   🌐 زیردامنه:   ${user.tenant?.subDomain || '—'}`)
  console.log(`   📊 وضعیت:      ${user.tenant?.status || '—'}`)

  // ★ بررسی اینکه tenant دمو است
  if (user.tenant?.status !== 'demo' && user.tenant?.status !== 'demo_pending') {
    console.log(`\n❌ این کاربر به tenant دمو متصل نیست (وضعیت: ${user.tenant?.status}).`)
    console.log(`   این اسکریپت فقط برای tenant های دمو کار می‌کند.\n`)
    process.exit(1)
  }

  // ★ هش کردن رمز عبور جدید
  console.log(`\n🔄 هش کردن رمز عبور جدید...`)
  const hashedPassword = await bcrypt.hash(newPassword, 10)

  // ★ به‌روزرسانی رمز عبور
  await prisma.storeUser.update({
    where: { id: user.id },
    data: { password: hashedPassword },
  })

  console.log(`\n✅ رمز عبور با موفقیت بازنشانی شد!\n`)
  console.log('═'.repeat(80))
  console.log('\n📋 اطلاعات ورود به دمو:\n')
  console.log(`   🌐 URL ورود:    http://localhost:3000/${user.tenant.subDomain}/login`)
  console.log(`   👤 نام کاربری:  ${user.username}`)
  console.log(`   🔒 رمز عبور:    ${newPassword}`)
  console.log(`   📱 موبایل:      ${user.mobile || user.tenant.ownerMobile || '—'}`)

  if (user.tenant.expiresAt) {
    const expiresAt = new Date(user.tenant.expiresAt)
    const now = new Date()
    const daysRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    console.log(`   ⏰ انقضا:      ${expiresAt.toISOString()}`)
    console.log(`   ⏳ روز باقی:   ${daysRemaining} روز`)
  }
  console.log('\n' + '═'.repeat(80))
  console.log('\n💡 برای ورود:')
  console.log(`   1. به آدرس بالا بروید`)
  console.log(`   2. نام کاربری و رمز عبور بالا را وارد کنید`)
  console.log(`   3. یا به localhost:3000 بروید و روی «ورود» کلیک کنید\n`)
}

main()
  .catch((error) => {
    console.error('❌ خطا:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
