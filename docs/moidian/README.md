# اتصال سامانه مودیان مالیاتی — ShopAccounting v6.0

این پکیج شامل تمام فایل‌های لازم برای اتصال ShopAccounting به سامانه مودیان مالیاتی (tax.gov.ir) است.

## قابلیت‌ها

- ✅ **پشتیبانی از دو محیط:** تست (sandbox) و تولید (production)
- ✅ **رمزنگاری AES-256-GCM** برای credentials حساس در دیتابیس
- ✅ **امضای RSA (RS256)** برای احراز هویت OAuth2 با مودیان
- ✅ **Cache خودکار access token** با refresh در صورت انقضا
- ✅ **ارسال خودکار فاکتور** هنگام صدور در POS
- ✅ **ارسال دستی / گروهی** فاکتورها
- ✅ **استعلام وضعیت** فاکتورها در مودیان
- ✅ **لغو فاکتور** در مودیان
- ✅ **رابط کاربری فارسی RTL** با تم سبز پروژه
- ✅ **پلن‌بندی:** پلن حرفه‌ای و سازمانی (هر دو)

## فایل‌های موجود

```
moidian-integration/
├── .env.example                                       # نمونه متغیرهای محیطی
├── README.md                                          # این فایل
├── prisma/
│   ├── schema-additions.prisma                        # بخش‌های اضافه‌شده به schema
│   └── migration-v6.0-moidian.sql                     # SQL Migration برای SQL Server
├── lib/
│   ├── plan-features.patch.ts                         # تغییرات plan-features.ts
│   └── moidian/
│       ├── signing.ts                                 # امضای JWT با RSA
│       ├── crypto.ts                                  # رمزنگاری AES-256-GCM
│       ├── client.ts                                  # HTTP Client برای مودیان
│       ├── invoice-mapper.ts                          # تبدیل Invoice → فرمت مودیان
│       └── index.ts                                   # توابع راهنما (Facade)
├── app/api/
│   ├── invoices/route.ts.patch                        # هوک ارسال خودکار
│   └── moidian/
│       ├── route.ts                                   # GET — وضعیت اتصال + آمار
│       ├── setup/route.ts                             # POST/GET/DELETE — credentials
│       ├── submit/[invoiceId]/route.ts                # POST — ارسال یک فاکتور
│       ├── cancel/[invoiceId]/route.ts                # POST — لغو فاکتور
│       ├── query/[referenceId]/route.ts               # GET — استعلام وضعیت
│       └── batch/route.ts                             # POST — ارسال گروهی
└── components/
    ├── settings/moidian-tab.tsx                       # تب تنظیمات در پنل تنظیمات
    └── invoices/moidian-status-badge.tsx              # Badge وضعیت مودیان
```

## مراحل نصب

### ۱. تولید کلید رمزنگاری

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

خروجی (۶۴ کاراکتر hex) را در `.env` کپی کنید:

```env
MOIDIAN_ENCRYPTION_KEY=<hex-string-from-above>
```

### ۲. اعمال تغییرات دیتابیس

دو راه دارید:

**راه A: استفاده از Prisma migrate** (توصیه شده در محیط dev)

تغییرات `prisma/schema-additions.prisma` را به `prisma/schema.prisma` اصلی اضافه کنید:

- به مدل `Tenant` اضافه کنید: `MoidianSettings  MoidianSettings?`
- به مدل `Invoice` فیلدهای `moidianReferenceId`, `moidianStatus`, `moidianSubmittedAt`, `moidianAcceptedAt`, `moidianError`, `moidianRetryCount` را اضافه کنید
- مدل `MoidianSettings` را به انتهای فایل اضافه کنید

سپس:
```bash
npx prisma migrate dev --name moidian-integration
npx prisma generate
```

**راه B: اجرای SQL مستقیم** (برای production)

```bash
sqlcmd -S <server> -d <database> -U <user> -P <pass> -i prisma/migration-v6.0-moidian.sql
```

سپس `prisma generate` را اجرا کنید تا TypeScript types به‌روز شوند.

### ۳. به‌روزرسانی `plan-features.ts`

تغییرات `lib/plan-features.patch.ts` را به `src/lib/plan-features.ts` اعمال کنید. فقط دو تغییر لازم است:

- در `professional` پلن: `canMoidianIntegration: true`
- به‌روزرسانی توضیحات پلن‌ها (اختیاری)

### ۴. کپی فایل‌های کتابخانه مودیان

```bash
cp -r lib/moidian src/lib/moidian
```

### ۵. کپی API routes

```bash
cp -r app/api/moidian src/app/api/moidian
```

### ۶. اعمال هوک ارسال خودکار در `/api/invoices/route.ts`

در فایل `src/app/api/invoices/route.ts`:

۱. در ابتدای فایل اضافه کنید:
```typescript
import { autoSubmitInvoiceIfNeeded } from '@/lib/moidian'
```

۲. در تابع POST، بعد از `createAutoJournalEntry` و قبل از `return NextResponse.json` اضافه کنید:
```typescript
// ★★★ v6.0: ارسال خودکار فاکتور به سامانه مودیان (non-blocking)
try {
  await autoSubmitInvoiceIfNeeded(tenantId, invoice.id)
} catch (moidianErr: any) {
  console.warn('[Invoices] Auto Moidian submission failed (non-blocking):', moidianErr?.message)
}
```

### ۷. اضافه‌کردن تب تنظیمات مودیان

فایل `src/components/settings/moidian-tab.tsx` را کپی کنید.

سپس در `src/components/settings/settings-page.tsx`، تب جدید اضافه کنید:

```tsx
import { MoidianTab } from './moidian-tab'

// در JSX:
<TabsContent value="moidian">
  <MoidianTab />
</TabsContent>

// و در TabsTrigger ها:
<TabsTrigger value="moidian" className="...">
  <Building2 className="w-3 h-3 ml-1" />
  مودیان
</TabsTrigger>
```

**نکته:** این تب فقط در صورتی نمایش داده شود که `features.canMoidianIntegration === true` (یعنی پلن حرفه‌ای یا سازمانی).

### ۸. اضافه‌کردن Badge وضعیت به لیست فاکتورها (اختیاری)

```tsx
import { MoidianStatusBadge } from './moidian-status-badge'

// در جدول فاکتورها:
<MoidianStatusBadge status={inv.moidianStatus} referenceId={inv.moidianReferenceId} />
```

## نحوه استفاده

### برای صاحب فروشگاه

۱. وارد تنظیمات → تب «مودیان» شوید
۲. روی لینک [tax.gov.ir](https://www.tax.gov.ir) کلیک کنید و درخواست ثبت‌نام سامانه مودیان بدهید
۳. پس از تأیید، credentials زیر را از پنل مودیان دریافت کنید:
   - شناسه مالیاتی (۱۱ رقم)
   - کد اقتصادی (۱۲ رقم — اختیاری)
   - Client ID
   - Client Secret
   - Private Key (PEM)
۴. در فرم تنظیمات، این اطلاعات را وارد کنید
۵. محیط را روی «محیط تست» (Sandbox) بگذارید
۶. دکمه «ذخیره و تست اتصال» را بزنید
۷. اگر تست موفق بود، «ارسال خودکار فاکتورها» را فعال کنید

از این پس، هر فاکتوری که در POS ثبت می‌شود، خودکار به مودیان ارسال می‌شود.

### برای تست اولیه (بدون credentials واقعی)

اگر می‌خواهید ابتدا کد را تست کنید:

۱. در `lib/moidian/signing.ts` تابع `generateRSAKeyPair()` را فراخوانی کنید تا یک جفت کلید تولید شود
۲. این کلید را در فرم تنظیمات وارد کنید
۳. تست اتصال انجام می‌شود (البته چون credentials واقعی نیست، مودیان خطا می‌دهد — اما این نشان می‌دهد که کد کار می‌کند)

## API Reference

### `GET /api/moidian`
دریافت وضعیت اتصال و آمار فاکتورهای ارسال‌شده.

### `POST /api/moidian/setup`
ذخیره credentials مودیان. body:
```json
{
  "fiscalId": "14001234567",
  "economicCode": "123456789012",
  "clientId": "...",
  "clientSecret": "...",
  "privateKey": "-----BEGIN PRIVATE KEY-----\n...",
  "environment": "sandbox",
  "autoSubmit": true,
  "testConnection": true
}
```

### `DELETE /api/moidian/setup`
حذف تمام تنظیمات مودیان.

### `POST /api/moidian/submit/[invoiceId]`
ارسال یک فاکتور مشخص به مودیان.

### `POST /api/moidian/cancel/[invoiceId]`
لغو فاکتور در مودیان. body:
```json
{ "reason": "CANCELLED_BY_SELLER" }
```

### `GET /api/moidian/query/[referenceId]`
استعلام وضعیت فاکتور در مودیان.

### `POST /api/moidian/batch`
ارسال گروهی فاکتورها. body:
```json
{ "invoiceIds": ["id1", "id2"], "limit": 50 }
```

## امنیت

### رمزنگاری credentials

- `clientSecret` و `privateKey` هرگز به‌صورت plain text در دیتابیس ذخیره نمی‌شوند
- الگوریتم: AES-256-GCM (Authenticated Encryption)
- کلید: ۳۲ بایت از `MOIDIAN_ENCRYPTION_KEY` (hex)
- IV: ۱۲ بایت رندوم برای هر رمزنگاری
- Auth Tag: ۱۶ بایت برای تأیید یکپارچگی

### access token

- در دیتابیس رمزنگاری می‌شود
- هر ۱ ساعت refresh می‌شود
- اگر `MOIDIAN_ENCRYPTION_KEY` تغییر کند، تمام tokens قبلی غیرقابل استفاده می‌شوند

### permissions

- فقط `Manager`, `Admin`, `Owner` می‌توانند credentials را تنظیم/حذف کنند
- فقط `accounting` permission برای مشاهده وضعیت لازم است
- فقط `pos` permission برای ارسال فاکتور لازم است

## عیب‌یابی

### خطای «کلید رمزنگاری production تنظیم نشده»

`MOIDIAN_ENCRYPTION_KEY` در `.env` تنظیم نشده. برای تولید:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### خطای «دریافت access token از مودیان ناموفق بود»

۱. credentials را بررسی کنید (clientId, clientSecret, privateKey)
۲. محیط (sandbox/production) را بررسی کنید
۳. ارتباط اینترنت را بررسی کنید
۴. لاگ سرور را ببینید — خطای دقیق مودیان چاپ می‌شود

### خطای «کلید خصوصی معتبر نیست»

فرمت PEM کلید را بررسی کنید. باید به این شکل باشد:
```
-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
...
-----END PRIVATE KEY-----
```

اگر کلید با `-----BEGIN RSA PRIVATE KEY-----` شروع می‌شود، آن را به PKCS#8 تبدیل کنید:
```bash
openssl pkcs8 -topk8 -in old_key.pem -out new_key.pem -nocrypt
```

### خطای «شناسه مالیاتی نامعتبر»

شناسه مالیاتی باید دقیقاً ۱۱ رقم باشد.

### خطای «faکتور باید حداقل یک آیتم داشته باشد»

فاکتور بدون آیتم ارسال می‌شود. در `lib/moidian/invoice-mapper.ts` اعتبارسنجی می‌شود.

## محدودیت‌ها

- نرخ ارسال: ۱ درخواست هر ۲۰۰ms (در ارسال گروهی)
- حداکثر فاکتور در ارسال گروهی: ۱۰۰
- مدت اعتبار access token: ۱ ساعت (خودکار refresh می‌شود)
- طول شناسه مالیاتی: ۱۱ رقم
- طول کد اقتصادی: ۱۲ رقم

## نقشه راه آینده

- [ ] Webhook برای دریافت callback خودکار از مودیان (به‌جای polling)
- [ ] پشتیبانی از فاکتورهای برگشتی (نوع ۳)
- [ ] پشتیبانی از فاکتورهای خرید (نوع ۲)
- [ ] گزارش تخصصی مودیان
- [ ] کرون job برای استعلام خودکار وضعیت فاکتورهای SUBMITTED
- [ ] پشتیبانی از چند نرخ مالیات در یک فاکتور
