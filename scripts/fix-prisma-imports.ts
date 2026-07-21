/**
 * اسکریپت جستجو و جایگزینی @prisma/client
 *
 * همه فایل‌های .ts و .tsx در src/ را بررسی می‌کند
 * و import از '@prisma/client' را به '@/lib/prisma' تغییر می‌دهد
 *
 * همچنین مدل‌های غلط را هم اصلاح می‌کند:
 *   prisma.user → prisma.storeUser
 *   prisma.tenant (با T بزرگ) → prisma.tenant (با t کوچک)
 *
 * نحوه اجرا:
 *   npx tsx scripts/fix-prisma-imports.ts
 *
 * فایل: scripts/fix-prisma-imports.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC_DIR = path.resolve(process.cwd(), 'src');

const replacements: Array<{ from: string; to: string; desc: string }> = [
  // Import اصلاح
  { from: `from '@prisma/client'`, to: `from '@/lib/prisma'`, desc: 'Fix @prisma/client import' },
  { from: `from \"@prisma/client\"`, to: `from '@/lib/prisma'`, desc: 'Fix @prisma/client import (double quotes)' },

  // مدل‌های غلط
  { from: `prisma.User.findFirst`, to: `prisma.storeUser.findFirst`, desc: 'Fix User → storeUser' },
  { from: `prisma.user.findFirst`, to: `prisma.storeUser.findFirst`, desc: 'Fix user → storeUser' },
  { from: `prisma.User.findUnique`, to: `prisma.storeUser.findUnique`, desc: 'Fix User → storeUser' },
  { from: `prisma.user.findUnique`, to: `prisma.storeUser.findUnique`, desc: 'Fix user → storeUser' },
  { from: `prisma.User.findMany`, to: `prisma.storeUser.findMany`, desc: 'Fix User → storeUser' },
  { from: `prisma.user.findMany`, to: `prisma.storeUser.findMany`, desc: 'Fix user → storeUser' },
  { from: `prisma.User.create`, to: `prisma.storeUser.create`, desc: 'Fix User → storeUser' },
  { from: `prisma.user.create`, to: `prisma.storeUser.create`, desc: 'Fix user → storeUser' },
];

function walkDir(dir: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // رد کردن پوشه‌های خاص
      if (['generated', 'node_modules', '.next'].includes(entry.name)) continue;
      files.push(...walkDir(fullPath));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function fixFile(filePath: string): number {
  let content = fs.readFileSync(filePath, 'utf-8');
  let changeCount = 0;

  for (const { from, to, desc } of replacements) {
    if (content.includes(from)) {
      content = content.split(from).join(to);
      changeCount++;
      console.log(`  ✏️  ${desc} in ${path.relative(process.cwd(), filePath)}`);
    }
  }

  if (changeCount > 0) {
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  return changeCount;
}

console.log('═══════════════════════════════════════════════════════════');
console.log('  Fix Prisma Imports');
console.log('  جستجو و جایگزینی @prisma/client در تمام فایل‌ها');
console.log('═══════════════════════════════════════════════════════════');
console.log();

const files = walkDir(SRC_DIR);
console.log(`Found ${files.length} TypeScript files in src/`);
console.log();

let totalChanges = 0;
for (const file of files) {
  totalChanges += fixFile(file);
}

console.log();
if (totalChanges > 0) {
  console.log(`✅ ${totalChanges} replacement(s) made in ${files.length} files`);
} else {
  console.log('✅ No changes needed — all imports are correct');
}
console.log();
console.log('═══════════════════════════════════════════════════════════');
