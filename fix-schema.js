const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, 'prisma', 'schema.prisma');
const backupPath = path.join(__dirname, 'prisma', 'schema.prisma.backup');

console.log('🔄 در حال پردازش فایل schema.prisma...');

try {
  // ۱. ساخت بکاپ خودکار برای اطمینان ۱۰۰٪
  fs.copyFileSync(schemaPath, backupPath);
  console.log('✅ بکاپ امن ساخته شد: prisma/schema.prisma.backup');

  // ۲. خواندن محتوای فایل اصلی شما
  let content = fs.readFileSync(schemaPath, 'utf8');

  // ۳. تغییر provider به postgresql
  content = content.replace(/provider\s*=\s*"sqlserver"/g, 'provider = "postgresql"');

  // ۴. تبدیل @db.NVarChar(عدد) به @db.VarChar(عدد)
  content = content.replace(/@db\.NVarChar\((\d+)\)/g, '@db.VarChar($1)');

  // ۵. تبدیل @db.NVarChar(max) یا @db.NVarChar(Max) به @db.Text
  content = content.replace(/@db\.NVarChar\([mM]ax\)/g, '@db.Text');

  // ۶. ذخیره فایل اصلاح‌شده
  fs.writeFileSync(schemaPath, content, 'utf8');
  
  console.log('🎉 عملیات با موفقیت انجام شد!');
  console.log('✨ تمام NVarCharها به VarChar یا Text تبدیل شدند.');
  console.log('✨ تمام کامنت‌ها و خطوط اصلی دست‌نخورده باقی ماندند.');
  
} catch (error) {
  console.error('❌ خطا در انجام عملیات:', error.message);
}