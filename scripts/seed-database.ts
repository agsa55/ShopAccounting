/**
 * Seed Database v2 — ایجاد داده‌های اولیه
 *
 * شامل: Plan, Tenant, Admin, Cashier, StoreSetting, Categories
 *
 * نحوه اجرا:
 *   npx tsx scripts/seed-database.ts
 *
 * فایل: scripts/seed-database.ts
 */

import { PrismaClient } from '../src/generated/master';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  ShopAccounting v4.3 — Database Seed v2');
  console.log('  ایجاد داده‌های اولیه');
  console.log('═══════════════════════════════════════════════════════════');
  console.log();

  // ─── ۱. ایجاد Plan ─────────────────────────────────────
  console.log('Step 1: Creating default Plan...');
  const plan = await prisma.plan.upsert({
    where: { name: 'basic' },
    update: {},
    create: {
      name: 'basic',
      nameFa: 'پایه',
      price: 0,
      durationDays: 365,
      maxUsers: 5,
      maxProducts: 200,
      features: 'invoices,customers,products,reports,settings',
      isActive: true,
    },
  });
  console.log(`  ✅ Plan: ${plan.name} (${plan.nameFa})`);
  console.log();

  // ─── ۲. ایجاد Tenant ───────────────────────────────────
  console.log('Step 2: Creating default Tenant...');

  // حذف tenant قبلی اگر وجود دارد
  const existingTenant = await prisma.tenant.findFirst({ where: { subDomain: 'demo' } });
  if (existingTenant) {
    // حذف StoreUserهای قدیمی
    await prisma.storeUser.deleteMany({ where: { tenantId: existingTenant.id } });
    await prisma.storeSetting.deleteMany({ where: { tenantId: existingTenant.id } });
    await prisma.productCategory.deleteMany({ where: { tenantId: existingTenant.id } });
    await prisma.auditLog.deleteMany({ where: { tenantId: existingTenant.id } });
    await prisma.tenant.delete({ where: { id: existingTenant.id } });
  }

  const tenant = await prisma.tenant.create({
    data: {
      subDomain: 'demo',
      companyName: 'فروشگاه دمو',
      planName: 'basic',
      status: 'active',
      isIsolated: false,
      ownerName: 'مدیر فروشگاه',
      ownerMobile: '09123456789',
    },
  });
  console.log(`  ✅ Tenant: ${tenant.companyName} (${tenant.subDomain})`);
  console.log(`     ID: ${tenant.id}`);
  console.log();

  // ─── ۳. ایجاد StoreUsers ────────────────────────────────
  console.log('Step 3: Creating StoreUsers...');
  const hashedPassword = await bcrypt.hash('123456', 10);

  // Admin (مدیر)
  const adminUser = await prisma.storeUser.create({
    data: {
      username: 'admin',
      password: hashedPassword,
      mobile: '09123456789',
      role: 'Admin',
      permissions: 'all',
      tenantId: tenant.id,
      storeName: 'فروشگاه دمو',
      isActive: true,
    },
  });
  console.log(`  ✅ Admin: ${adminUser.username}`);

  // Cashier (صندوق‌دار)
  const cashierUser = await prisma.storeUser.create({
    data: {
      username: 'cashier',
      password: hashedPassword,
      mobile: '09123456790',
      role: 'Cashier',
      permissions: 'pos,invoices,customers,products',
      tenantId: tenant.id,
      storeName: 'فروشگاه دمو',
      isActive: true,
    },
  });
  console.log(`  ✅ Cashier: ${cashierUser.username}`);

  // Manager (مدیر فروشگاه)
  const managerUser = await prisma.storeUser.create({
    data: {
      username: 'manager',
      password: hashedPassword,
      mobile: '09123456791',
      role: 'Manager',
      permissions: 'all',
      tenantId: tenant.id,
      storeName: 'فروشگاه دمو',
      isActive: true,
    },
  });
  console.log(`  ✅ Manager: ${managerUser.username}`);
  console.log();

  // ─── ۴. ایجاد StoreSetting ─────────────────────────────
  console.log('Step 4: Creating StoreSetting...');
  await prisma.storeSetting.create({
    data: {
      storeName: 'فروشگاه دمو',
      address: 'تهران، خیابان دمو',
      phone: '02112345678',
      defaultTaxRate: 9,
      tenantId: tenant.id,
    },
  });
  console.log('  ✅ StoreSetting created');
  console.log();

  // ─── ۵. دسته‌بندی‌های پیش‌فرض ──────────────────────────
  console.log('Step 5: Creating categories...');
  const categories = [
    { name: 'لوازم تحریر', tenantId: tenant.id },
    { name: 'خوراکی', tenantId: tenant.id },
    { name: 'نوشیدنی', tenantId: tenant.id },
  ];
  for (const cat of categories) {
    await prisma.productCategory.create({ data: cat });
  }
  console.log(`  ✅ ${categories.length} categories`);
  console.log();

  // ─── خلاصه ─────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  ✅ Seed completed!');
  console.log();
  console.log('  ┌───────────────────────────────────────────┐');
  console.log('  │  Login Credentials:                        │');
  console.log('  │                                            │');
  console.log('  │  مدیر:      admin    / 123456             │');
  console.log('  │  صندوق‌دار:  cashier / 123456             │');
  console.log('  │  مدیر فروش: manager / 123456             │');
  console.log('  │                                            │');
  console.log('  │  Tenant: فروشگاه دمو (demo)               │');
  console.log('  └───────────────────────────────────────────┘');
  console.log('═══════════════════════════════════════════════════════════');

  await prisma.$disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Seed error:', error);
    prisma.$disconnect();
    process.exit(1);
  });
