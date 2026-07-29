import { PrismaClient } from '@/generated/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('Admin@123456', 10); // رمز عبور پیش‌فرض

  const admin = await prisma.adminUser.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: hashedPassword,
      role: 'SuperAdmin',
      isActive: true,
    },
  });

  console.log('✅ اولین ادمین با موفقیت ساخته شد:');
  console.log('نام کاربری: admin');
  console.log('رمز عبور: Admin@123456');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });