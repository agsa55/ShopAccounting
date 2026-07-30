-- CreateTable
CREATE TABLE "Tenants" (
    "id" VARCHAR(1000) NOT NULL,
    "subDomain" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "planName" TEXT NOT NULL DEFAULT 'simple',
    "status" TEXT NOT NULL DEFAULT 'active',
    "ownerName" TEXT,
    "ownerMobile" TEXT,
    "ownerEmail" TEXT,
    "address" TEXT,
    "registrationNumber" TEXT,
    "logoUrl" TEXT,
    "planTierId" INTEGER,
    "billingCycle" TEXT NOT NULL DEFAULT 'annual',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "soldAt" TIMESTAMP(3),
    "soldTo" TEXT,
    "soldToContact" TEXT,

    CONSTRAINT "Tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpCodes" (
    "id" VARCHAR(450) NOT NULL,
    "tenantId" VARCHAR(1000) NOT NULL,
    "mobile" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL DEFAULT '',
    "purpose" TEXT NOT NULL DEFAULT 'login',
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLogs" (
    "id" VARCHAR(450) NOT NULL,
    "tenantId" VARCHAR(1000) NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "details" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plans" (
    "id" VARCHAR(450) NOT NULL,
    "name" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "maxUsers" INTEGER NOT NULL DEFAULT 2,
    "maxProducts" INTEGER NOT NULL DEFAULT 100,
    "features" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isTrial" BOOLEAN NOT NULL DEFAULT false,
    "trialDays" INTEGER NOT NULL DEFAULT 0,
    "requiresIsolatedDb" BOOLEAN NOT NULL DEFAULT false,
    "dbType" TEXT NOT NULL DEFAULT 'shared',
    "autoDeleteOnExpiry" BOOLEAN NOT NULL DEFAULT false,
    "tier" TEXT NOT NULL DEFAULT 'basic',
    "maxInvoices" INTEGER NOT NULL DEFAULT 100,

    CONSTRAINT "Plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalUsers" (
    "id" VARCHAR(450) NOT NULL,
    "tenantId" VARCHAR(1000) NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "mobile" TEXT,
    "role" TEXT NOT NULL DEFAULT 'Manager',
    "permissions" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalUsers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPayments" (
    "id" VARCHAR(450) NOT NULL,
    "subscriptionId" VARCHAR(450) NOT NULL,
    "tenantId" VARCHAR(1000) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paymentMethod" TEXT,
    "paymentRef" TEXT,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionPayments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscriptions" (
    "id" VARCHAR(450) NOT NULL,
    "tenantId" VARCHAR(1000) NOT NULL,
    "planId" VARCHAR(450) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserLookups" (
    "id" VARCHAR(450) NOT NULL,
    "username" TEXT NOT NULL,
    "tenantId" VARCHAR(1000) NOT NULL,
    "userType" TEXT NOT NULL DEFAULT 'storeUser',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserLookups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanTiers" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL,
    "description" TEXT,
    "maxUsers" INTEGER NOT NULL DEFAULT 2,
    "maxProducts" INTEGER NOT NULL DEFAULT 200,
    "maxInvoices" INTEGER NOT NULL DEFAULT 500,
    "isTrial" BOOLEAN NOT NULL DEFAULT false,
    "trialDays" INTEGER NOT NULL DEFAULT 0,
    "dbType" TEXT NOT NULL DEFAULT 'shared',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanTiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanPrices" (
    "id" SERIAL NOT NULL,
    "planTierId" INTEGER NOT NULL,
    "billingCycle" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "discountPercent" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPopular" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanPrices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreUsers" (
    "id" VARCHAR(450) NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "mobile" TEXT,
    "role" TEXT NOT NULL DEFAULT 'Cashier',
    "permissions" TEXT,
    "tenantId" VARCHAR(1000) NOT NULL,
    "storeId" VARCHAR(1000),
    "storeName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockoutEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreUsers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Products" (
    "id" VARCHAR(450) NOT NULL,
    "code" TEXT NOT NULL,
    "barcode" VARCHAR(50),
    "name" VARCHAR(500) NOT NULL,
    "categoryId" VARCHAR(450),
    "unitId" VARCHAR(450),
    "unitLabel" VARCHAR(50) NOT NULL DEFAULT 'عدد',
    "purchasePrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salePrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCategories" (
    "id" VARCHAR(450) NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" VARCHAR(450),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCategories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Units" (
    "id" VARCHAR(450) NOT NULL,
    "name" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL,
    "symbol" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "tenantId" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customers" (
    "id" VARCHAR(450) NOT NULL,
    "code" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "mobile" TEXT,
    "nationalCode" TEXT,
    "address" TEXT,
    "creditLimit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isBlacklisted" BOOLEAN NOT NULL DEFAULT false,
    "tenantId" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastPurchaseAt" TIMESTAMP(3),
    "portalToken" TEXT,
    "personType" VARCHAR(10) NOT NULL DEFAULT 'person',
    "economicCode" VARCHAR(20),
    "companyName" VARCHAR(200),
    "legalForm" VARCHAR(100),

    CONSTRAINT "Customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Accounts" (
    "id" VARCHAR(450) NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'cash',
    "level" INTEGER NOT NULL DEFAULT 1,
    "parentId" VARCHAR(450),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoices" (
    "id" VARCHAR(450) NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" VARCHAR(450),
    "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "paymentType" TEXT NOT NULL DEFAULT 'cash',
    "subTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remainingAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cogsAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cashierId" VARCHAR(450),
    "description" TEXT,
    "tenantId" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "invoiceType" VARCHAR(30) NOT NULL DEFAULT 'sale',
    "originalInvoiceId" VARCHAR(450),
    "serviceDevice" VARCHAR(500),
    "serviceWarranty" BOOLEAN NOT NULL DEFAULT false,
    "moidianReferenceId" VARCHAR(100),
    "moidianStatus" VARCHAR(50),
    "moidianSubmittedAt" TIMESTAMP(3),
    "moidianAcceptedAt" TIMESTAMP(3),
    "moidianError" VARCHAR(500),
    "moidianRetryCount" INTEGER NOT NULL DEFAULT 0,
    "warehouseId" VARCHAR(450),

    CONSTRAINT "Invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItems" (
    "id" VARCHAR(450) NOT NULL,
    "invoiceId" VARCHAR(450) NOT NULL,
    "productId" VARCHAR(450),
    "productName" VARCHAR(500) NOT NULL,
    "unitLabel" VARCHAR(50) NOT NULL DEFAULT 'عدد',
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lineTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "description" VARCHAR(500),

    CONSTRAINT "InvoiceItems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoicePayments" (
    "id" VARCHAR(450) NOT NULL,
    "invoiceId" VARCHAR(450) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paymentType" TEXT NOT NULL DEFAULT 'cash',
    "paymentRef" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" VARCHAR(1000) NOT NULL,

    CONSTRAINT "InvoicePayments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallmentPlans" (
    "id" VARCHAR(450) NOT NULL,
    "invoiceId" VARCHAR(450) NOT NULL,
    "customerId" TEXT,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "downPayment" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remainingAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "interestRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalWithInterest" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "numberOfInstallments" INTEGER NOT NULL DEFAULT 1,
    "installmentAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "installmentPeriod" TEXT NOT NULL DEFAULT 'monthly',
    "status" TEXT NOT NULL DEFAULT 'active',
    "paidInstallments" INTEGER NOT NULL DEFAULT 0,
    "totalPaidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nextDueDate" TIMESTAMP(3),
    "description" TEXT,
    "tenantId" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstallmentPlans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallmentSchedules" (
    "id" VARCHAR(450) NOT NULL,
    "planId" VARCHAR(450) NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "paymentRef" TEXT,
    "paymentType" TEXT,
    "notes" TEXT,
    "tenantId" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstallmentSchedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntries" (
    "id" VARCHAR(450) NOT NULL,
    "number" TEXT NOT NULL DEFAULT 'JE-000000',
    "fiscalYearId" VARCHAR(450),
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sourceType" TEXT,
    "sourceId" VARCHAR(450),
    "totalDebit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCredit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdBy" VARCHAR(450),
    "tenantId" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "cancelReason" TEXT,

    CONSTRAINT "JournalEntries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntryLines" (
    "id" VARCHAR(450) NOT NULL,
    "journalEntryId" VARCHAR(450) NOT NULL,
    "accountId" VARCHAR(450),
    "description" TEXT,
    "debit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "credit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntryLines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreSettings" (
    "id" VARCHAR(450) NOT NULL,
    "storeName" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "registrationNumber" TEXT,
    "defaultTaxRate" DOUBLE PRECISION NOT NULL DEFAULT 9,
    "logoUrl" TEXT,
    "tenantId" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "bankIban" TEXT,
    "bankName" TEXT,

    CONSTRAINT "StoreSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentGateways" (
    "id" VARCHAR(450) NOT NULL,
    "name" TEXT NOT NULL,
    "type" VARCHAR(30) NOT NULL DEFAULT 'zarinpal',
    "merchantId" VARCHAR(200),
    "apiKey" VARCHAR(500),
    "terminalCode" VARCHAR(200),
    "callbackUrl" VARCHAR(500),
    "bankIban" VARCHAR(50),
    "bankName" VARCHAR(200),
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "sandbox" BOOLEAN NOT NULL DEFAULT false,
    "tenantId" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentGateways_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosDevices" (
    "id" VARCHAR(450) NOT NULL,
    "name" TEXT NOT NULL,
    "terminalId" VARCHAR(100),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "terminalType" VARCHAR(50) NOT NULL DEFAULT 'manual',
    "brand" VARCHAR(50),
    "bankName" VARCHAR(100),
    "merchantId" VARCHAR(50),
    "acceptorCode" VARCHAR(50),
    "terminalSerial" VARCHAR(100),
    "ipAddress" VARCHAR(50),
    "port" INTEGER,
    "serialPort" VARCHAR(100),
    "baudRate" INTEGER NOT NULL DEFAULT 115200,
    "apiBaseUrl" VARCHAR(500),
    "apiKey" VARCHAR(500),
    "config" TEXT,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "lastConnectedAt" TIMESTAMP(3),
    "lastError" VARCHAR(500),
    "tenantId" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosDevices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardPayments" (
    "id" VARCHAR(450) NOT NULL,
    "invoiceId" VARCHAR(450),
    "amount" DOUBLE PRECISION NOT NULL,
    "referenceNumber" VARCHAR(50),
    "referenceType" VARCHAR(20),
    "traceNumber" VARCHAR(50),
    "cardNumber" VARCHAR(4),
    "cardType" VARCHAR(20),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "posDeviceId" VARCHAR(450),
    "shaparakVerified" BOOLEAN NOT NULL DEFAULT false,
    "shaparakVerifyError" VARCHAR(500),
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "tenantId" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardPayments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Backups" (
    "id" VARCHAR(450) NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "recordCount" INTEGER,
    "data" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" VARCHAR(1000) NOT NULL,

    CONSTRAINT "Backups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Checks" (
    "id" VARCHAR(450) NOT NULL,
    "tenantId" VARCHAR(1000) NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'receivable',
    "checkNumber" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "branchName" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "customerId" VARCHAR(450),
    "payeeName" TEXT,
    "description" TEXT,
    "journalEntryId" VARCHAR(450),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalYears" (
    "id" VARCHAR(450) NOT NULL,
    "tenantId" VARCHAR(1000) NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalYears_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnlinePayments" (
    "id" VARCHAR(450) NOT NULL,
    "tenantId" VARCHAR(1000) NOT NULL,
    "invoiceId" VARCHAR(450) NOT NULL,
    "customerId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "authority" TEXT,
    "refId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "gatewayType" VARCHAR(30) NOT NULL DEFAULT 'zarinpal',
    "gatewayId" VARCHAR(450),
    "gatewayUrl" TEXT,
    "description" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "installmentId" TEXT,

    CONSTRAINT "OnlinePayments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsSettings" (
    "id" VARCHAR(450) NOT NULL,
    "tenantId" VARCHAR(1000) NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "daysBeforeDue" INTEGER NOT NULL DEFAULT 1,
    "sendOnDueDate" BOOLEAN NOT NULL DEFAULT true,
    "daysAfterDue" INTEGER NOT NULL DEFAULT 3,
    "sendHour" INTEGER NOT NULL DEFAULT 9,
    "sendMinute" INTEGER NOT NULL DEFAULT 30,
    "customMessageTemplate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsLogs" (
    "id" VARCHAR(450) NOT NULL,
    "tenantId" VARCHAR(1000) NOT NULL,
    "type" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "messageId" TEXT,
    "errorMessage" TEXT,
    "mockMode" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsLogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringJournals" (
    "id" VARCHAR(450) NOT NULL,
    "tenantId" VARCHAR(1000) NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "frequency" TEXT NOT NULL,
    "dayOfMonth" INTEGER,
    "dayOfWeek" INTEGER,
    "monthOfYear" INTEGER,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "nextExecutionDate" TIMESTAMP(3) NOT NULL,
    "lastExecutedAt" TIMESTAMP(3),
    "journalLines" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "autoPost" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringJournals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoidianSettings" (
    "id" VARCHAR(450) NOT NULL,
    "tenantId" VARCHAR(1000) NOT NULL,
    "fiscalId" VARCHAR(50),
    "economicCode" VARCHAR(50),
    "clientId" VARCHAR(200),
    "clientSecretEnc" VARCHAR(1000),
    "privateKeyEnc" VARCHAR(4000),
    "accessTokenEnc" VARCHAR(2000),
    "refreshTokenEnc" VARCHAR(2000),
    "tokenExpiresAt" TIMESTAMP(3),
    "environment" VARCHAR(20) NOT NULL DEFAULT 'sandbox',
    "isInitialized" BOOLEAN NOT NULL DEFAULT false,
    "autoSubmit" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "totalSubmitted" INTEGER NOT NULL DEFAULT 0,
    "totalAccepted" INTEGER NOT NULL DEFAULT 0,
    "totalRejected" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoidianSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouses" (
    "id" VARCHAR(450) NOT NULL,
    "tenantId" VARCHAR(1000) NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "branchId" VARCHAR(450),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLevels" (
    "id" VARCHAR(450) NOT NULL,
    "tenantId" VARCHAR(1000) NOT NULL,
    "warehouseId" VARCHAR(450) NOT NULL,
    "productId" VARCHAR(450) NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitLabel" VARCHAR(50) NOT NULL DEFAULT 'عدد',
    "averageCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockLevels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovements" (
    "id" VARCHAR(450) NOT NULL,
    "tenantId" VARCHAR(1000) NOT NULL,
    "productId" VARCHAR(450) NOT NULL,
    "fromWarehouseId" VARCHAR(450),
    "toWarehouseId" VARCHAR(450),
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitLabel" VARCHAR(50) NOT NULL DEFAULT 'عدد',
    "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "movementType" VARCHAR(50) NOT NULL,
    "referenceType" VARCHAR(50),
    "referenceId" VARCHAR(450),
    "description" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suppliers" (
    "id" VARCHAR(450) NOT NULL,
    "tenantId" VARCHAR(1000) NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" VARCHAR(20),
    "nationalCode" VARCHAR(20),
    "address" VARCHAR(500),
    "creditLimit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "personType" VARCHAR(10) NOT NULL DEFAULT 'person',
    "economicCode" VARCHAR(20),
    "companyName" VARCHAR(200),
    "legalForm" VARCHAR(100),

    CONSTRAINT "Suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseInvoices" (
    "id" VARCHAR(450) NOT NULL,
    "tenantId" VARCHAR(1000) NOT NULL,
    "supplierId" VARCHAR(450),
    "number" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "paymentType" TEXT NOT NULL DEFAULT 'cash',
    "subTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remainingAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "warehouseId" VARCHAR(450) NOT NULL,
    "journalEntryId" VARCHAR(450),
    "description" VARCHAR(500),
    "cashierId" VARCHAR(450),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "invoiceType" VARCHAR(30) NOT NULL DEFAULT 'purchase',
    "originalPurchaseInvoiceId" VARCHAR(450),

    CONSTRAINT "PurchaseInvoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseInvoiceItems" (
    "id" VARCHAR(450) NOT NULL,
    "purchaseInvoiceId" VARCHAR(450) NOT NULL,
    "productId" VARCHAR(450),
    "productName" VARCHAR(500) NOT NULL,
    "productCode" VARCHAR(50),
    "unitLabel" VARCHAR(50) NOT NULL DEFAULT 'عدد',
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lineTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "returnReason" VARCHAR(500),

    CONSTRAINT "PurchaseInvoiceItems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCounts" (
    "id" VARCHAR(450) NOT NULL,
    "tenantId" VARCHAR(1000) NOT NULL,
    "number" TEXT NOT NULL,
    "warehouseId" VARCHAR(450) NOT NULL,
    "countDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "countedBy" VARCHAR(450),
    "approvedBy" VARCHAR(450),
    "approvedAt" TIMESTAMP(3),
    "notes" VARCHAR(500),
    "journalEntryId" VARCHAR(450),
    "totalDifference" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockCounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCountItems" (
    "id" VARCHAR(450) NOT NULL,
    "stockCountId" VARCHAR(450) NOT NULL,
    "productId" VARCHAR(450) NOT NULL,
    "unitLabel" VARCHAR(50) NOT NULL DEFAULT 'عدد',
    "systemQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "countedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "difference" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "differenceAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reason" VARCHAR(500),
    "countedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockCountItems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branches" (
    "id" VARCHAR(450) NOT NULL,
    "tenantId" VARCHAR(1000) NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" VARCHAR(500),
    "phone" VARCHAR(20),
    "manager" VARCHAR(200),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tickets" (
    "id" VARCHAR(450) NOT NULL,
    "tenantId" VARCHAR(1000) NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "subject" VARCHAR(500) NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdById" VARCHAR(450) NOT NULL,
    "assignedTo" VARCHAR(450),
    "planTierAtCreate" VARCHAR(50),
    "attachments" TEXT,
    "rating" INTEGER,
    "ratingComment" VARCHAR(500),
    "ratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketMessages" (
    "id" VARCHAR(450) NOT NULL,
    "ticketId" VARCHAR(450) NOT NULL,
    "senderType" TEXT NOT NULL DEFAULT 'customer',
    "senderId" VARCHAR(450) NOT NULL,
    "senderName" VARCHAR(200) NOT NULL,
    "message" TEXT NOT NULL,
    "attachments" TEXT,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketMessages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InitialBalances" (
    "id" VARCHAR(450) NOT NULL,
    "tenantId" VARCHAR(1000) NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "accountId" VARCHAR(450),
    "productId" VARCHAR(450),
    "quantity" DOUBLE PRECISION,
    "description" VARCHAR(500),
    "journalEntryId" VARCHAR(450),
    "isPosted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InitialBalances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUsers" (
    "id" VARCHAR(450) NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "password" VARCHAR(500) NOT NULL,
    "role" VARCHAR(50) NOT NULL DEFAULT 'SuperAdmin',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLogin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUsers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedAssets" (
    "id" VARCHAR(450) NOT NULL,
    "tenantId" VARCHAR(1000) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "purchasePrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salvageValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usefulLife" INTEGER NOT NULL DEFAULT 60,
    "depreciationRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "accumulatedDepreciation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bookValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "purchaseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "depreciationStartDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastDepreciationDate" TIMESTAMP(3),
    "depreciationMethod" TEXT NOT NULL DEFAULT 'straight_line',
    "status" TEXT NOT NULL DEFAULT 'active',
    "accountId" VARCHAR(450),
    "accumDepAccountId" VARCHAR(450),
    "depExpenseAccountId" VARCHAR(450),
    "journalEntryId" VARCHAR(450),
    "description" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedAssets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenants_subDomain_key" ON "Tenants"("subDomain");

-- CreateIndex
CREATE INDEX "Tenants_createdAt_idx" ON "Tenants"("createdAt");

-- CreateIndex
CREATE INDEX "Tenants_planName_idx" ON "Tenants"("planName");

-- CreateIndex
CREATE INDEX "Tenants_status_idx" ON "Tenants"("status");

-- CreateIndex
CREATE INDEX "Tenants_planTierId_idx" ON "Tenants"("planTierId");

-- CreateIndex
CREATE INDEX "OtpCodes_expiresAt_idx" ON "OtpCodes"("expiresAt");

-- CreateIndex
CREATE INDEX "OtpCodes_mobile_purpose_isUsed_expiresAt_idx" ON "OtpCodes"("mobile", "purpose", "isUsed", "expiresAt");

-- CreateIndex
CREATE INDEX "OtpCodes_tenantId_idx" ON "OtpCodes"("tenantId");

-- CreateIndex
CREATE INDEX "AuditLogs_at_idx" ON "AuditLogs"("at");

-- CreateIndex
CREATE INDEX "AuditLogs_entityType_entityId_idx" ON "AuditLogs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLogs_tenantId_action_idx" ON "AuditLogs"("tenantId", "action");

-- CreateIndex
CREATE INDEX "AuditLogs_userId_idx" ON "AuditLogs"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Plans_name_key" ON "Plans"("name");

-- CreateIndex
CREATE INDEX "Plans_dbType_idx" ON "Plans"("dbType");

-- CreateIndex
CREATE INDEX "Plans_isActive_idx" ON "Plans"("isActive");

-- CreateIndex
CREATE INDEX "Plans_isTrial_idx" ON "Plans"("isTrial");

-- CreateIndex
CREATE INDEX "Plans_tier_idx" ON "Plans"("tier");

-- CreateIndex
CREATE INDEX "PortalUsers_mobile_idx" ON "PortalUsers"("mobile");

-- CreateIndex
CREATE INDEX "PortalUsers_tenantId_idx" ON "PortalUsers"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalUsers_tenantId_username_key" ON "PortalUsers"("tenantId", "username");

-- CreateIndex
CREATE INDEX "SubscriptionPayments_paidAt_idx" ON "SubscriptionPayments"("paidAt");

-- CreateIndex
CREATE INDEX "SubscriptionPayments_tenantId_isPaid_idx" ON "SubscriptionPayments"("tenantId", "isPaid");

-- CreateIndex
CREATE INDEX "Subscriptions_endDate_idx" ON "Subscriptions"("endDate");

-- CreateIndex
CREATE INDEX "Subscriptions_status_endDate_idx" ON "Subscriptions"("status", "endDate");

-- CreateIndex
CREATE INDEX "Subscriptions_status_idx" ON "Subscriptions"("status");

-- CreateIndex
CREATE INDEX "Subscriptions_tenantId_status_idx" ON "Subscriptions"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "UserLookups_username_key" ON "UserLookups"("username");

-- CreateIndex
CREATE INDEX "UserLookups_isActive_idx" ON "UserLookups"("isActive");

-- CreateIndex
CREATE INDEX "UserLookups_tenantId_idx" ON "UserLookups"("tenantId");

-- CreateIndex
CREATE INDEX "UserLookups_username_idx" ON "UserLookups"("username");

-- CreateIndex
CREATE UNIQUE INDEX "PlanTiers_name_key" ON "PlanTiers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PlanPrices_planTierId_billingCycle_key" ON "PlanPrices"("planTierId", "billingCycle");

-- CreateIndex
CREATE INDEX "StoreUsers_tenantId_idx" ON "StoreUsers"("tenantId");

-- CreateIndex
CREATE INDEX "StoreUsers_tenantId_isActive_idx" ON "StoreUsers"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "StoreUsers_mobile_idx" ON "StoreUsers"("mobile");

-- CreateIndex
CREATE UNIQUE INDEX "StoreUsers_username_tenantId_key" ON "StoreUsers"("username", "tenantId");

-- CreateIndex
CREATE INDEX "Products_tenantId_idx" ON "Products"("tenantId");

-- CreateIndex
CREATE INDEX "Products_tenantId_isActive_idx" ON "Products"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "Products_tenantId_name_idx" ON "Products"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Products_barcode_idx" ON "Products"("barcode");

-- CreateIndex
CREATE INDEX "Products_categoryId_idx" ON "Products"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Products_code_tenantId_key" ON "Products"("code", "tenantId");

-- CreateIndex
CREATE INDEX "ProductCategories_tenantId_idx" ON "ProductCategories"("tenantId");

-- CreateIndex
CREATE INDEX "ProductCategories_tenantId_isActive_idx" ON "ProductCategories"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "ProductCategories_parentId_idx" ON "ProductCategories"("parentId");

-- CreateIndex
CREATE INDEX "Units_tenantId_idx" ON "Units"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Customers_portalToken_key" ON "Customers"("portalToken");

-- CreateIndex
CREATE INDEX "Customers_tenantId_idx" ON "Customers"("tenantId");

-- CreateIndex
CREATE INDEX "Customers_tenantId_mobile_idx" ON "Customers"("tenantId", "mobile");

-- CreateIndex
CREATE INDEX "Customers_tenantId_lastName_idx" ON "Customers"("tenantId", "lastName");

-- CreateIndex
CREATE UNIQUE INDEX "Customers_code_tenantId_key" ON "Customers"("code", "tenantId");

-- CreateIndex
CREATE INDEX "Accounts_tenantId_idx" ON "Accounts"("tenantId");

-- CreateIndex
CREATE INDEX "Accounts_tenantId_type_idx" ON "Accounts"("tenantId", "type");

-- CreateIndex
CREATE INDEX "Accounts_parentId_idx" ON "Accounts"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Accounts_code_tenantId_key" ON "Accounts"("code", "tenantId");

-- CreateIndex
CREATE INDEX "Invoices_tenantId_idx" ON "Invoices"("tenantId");

-- CreateIndex
CREATE INDEX "Invoices_tenantId_status_idx" ON "Invoices"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Invoices_tenantId_invoiceDate_idx" ON "Invoices"("tenantId", "invoiceDate");

-- CreateIndex
CREATE INDEX "Invoices_tenantId_paymentType_idx" ON "Invoices"("tenantId", "paymentType");

-- CreateIndex
CREATE INDEX "Invoices_tenantId_invoiceType_idx" ON "Invoices"("tenantId", "invoiceType");

-- CreateIndex
CREATE INDEX "Invoices_customerId_idx" ON "Invoices"("customerId");

-- CreateIndex
CREATE INDEX "Invoices_cashierId_idx" ON "Invoices"("cashierId");

-- CreateIndex
CREATE INDEX "Invoices_tenantId_moidianStatus_idx" ON "Invoices"("tenantId", "moidianStatus");

-- CreateIndex
CREATE INDEX "Invoices_moidianReferenceId_idx" ON "Invoices"("moidianReferenceId");

-- CreateIndex
CREATE INDEX "Invoices_originalInvoiceId_idx" ON "Invoices"("originalInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoices_number_tenantId_key" ON "Invoices"("number", "tenantId");

-- CreateIndex
CREATE INDEX "InvoiceItems_invoiceId_idx" ON "InvoiceItems"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceItems_productId_idx" ON "InvoiceItems"("productId");

-- CreateIndex
CREATE INDEX "InvoicePayments_tenantId_idx" ON "InvoicePayments"("tenantId");

-- CreateIndex
CREATE INDEX "InvoicePayments_invoiceId_idx" ON "InvoicePayments"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoicePayments_tenantId_paidAt_idx" ON "InvoicePayments"("tenantId", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "InstallmentPlans_invoiceId_key" ON "InstallmentPlans"("invoiceId");

-- CreateIndex
CREATE INDEX "InstallmentPlans_tenantId_idx" ON "InstallmentPlans"("tenantId");

-- CreateIndex
CREATE INDEX "InstallmentPlans_tenantId_customerId_idx" ON "InstallmentPlans"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "InstallmentPlans_tenantId_status_idx" ON "InstallmentPlans"("tenantId", "status");

-- CreateIndex
CREATE INDEX "InstallmentPlans_tenantId_nextDueDate_idx" ON "InstallmentPlans"("tenantId", "nextDueDate");

-- CreateIndex
CREATE INDEX "InstallmentSchedules_planId_installmentNumber_idx" ON "InstallmentSchedules"("planId", "installmentNumber");

-- CreateIndex
CREATE INDEX "InstallmentSchedules_tenantId_idx" ON "InstallmentSchedules"("tenantId");

-- CreateIndex
CREATE INDEX "InstallmentSchedules_tenantId_status_idx" ON "InstallmentSchedules"("tenantId", "status");

-- CreateIndex
CREATE INDEX "InstallmentSchedules_tenantId_dueDate_idx" ON "InstallmentSchedules"("tenantId", "dueDate");

-- CreateIndex
CREATE INDEX "JournalEntries_tenantId_idx" ON "JournalEntries"("tenantId");

-- CreateIndex
CREATE INDEX "JournalEntries_tenantId_status_idx" ON "JournalEntries"("tenantId", "status");

-- CreateIndex
CREATE INDEX "JournalEntries_tenantId_date_idx" ON "JournalEntries"("tenantId", "date");

-- CreateIndex
CREATE INDEX "JournalEntries_sourceType_sourceId_idx" ON "JournalEntries"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "JournalEntries_fiscalYearId_idx" ON "JournalEntries"("fiscalYearId");

-- CreateIndex
CREATE INDEX "JournalEntries_tenantId_isCancelled_idx" ON "JournalEntries"("tenantId", "isCancelled");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntries_number_tenantId_key" ON "JournalEntries"("number", "tenantId");

-- CreateIndex
CREATE INDEX "JournalEntryLines_journalEntryId_idx" ON "JournalEntryLines"("journalEntryId");

-- CreateIndex
CREATE INDEX "JournalEntryLines_accountId_idx" ON "JournalEntryLines"("accountId");

-- CreateIndex
CREATE INDEX "StoreSettings_tenantId_idx" ON "StoreSettings"("tenantId");

-- CreateIndex
CREATE INDEX "PaymentGateways_tenantId_idx" ON "PaymentGateways"("tenantId");

-- CreateIndex
CREATE INDEX "PaymentGateways_tenantId_type_isActive_idx" ON "PaymentGateways"("tenantId", "type", "isActive");

-- CreateIndex
CREATE INDEX "PosDevices_tenantId_idx" ON "PosDevices"("tenantId");

-- CreateIndex
CREATE INDEX "PosDevices_tenantId_isActive_idx" ON "PosDevices"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "PosDevices_terminalType_idx" ON "PosDevices"("terminalType");

-- CreateIndex
CREATE INDEX "CardPayments_tenantId_idx" ON "CardPayments"("tenantId");

-- CreateIndex
CREATE INDEX "CardPayments_tenantId_paidAt_idx" ON "CardPayments"("tenantId", "paidAt");

-- CreateIndex
CREATE INDEX "CardPayments_posDeviceId_idx" ON "CardPayments"("posDeviceId");

-- CreateIndex
CREATE INDEX "CardPayments_invoiceId_idx" ON "CardPayments"("invoiceId");

-- CreateIndex
CREATE INDEX "CardPayments_referenceNumber_idx" ON "CardPayments"("referenceNumber");

-- CreateIndex
CREATE INDEX "Backups_tenantId_idx" ON "Backups"("tenantId");

-- CreateIndex
CREATE INDEX "Backups_tenantId_createdAt_idx" ON "Backups"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Checks_tenantId_idx" ON "Checks"("tenantId");

-- CreateIndex
CREATE INDEX "Checks_tenantId_type_idx" ON "Checks"("tenantId", "type");

-- CreateIndex
CREATE INDEX "Checks_tenantId_status_idx" ON "Checks"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Checks_tenantId_dueDate_idx" ON "Checks"("tenantId", "dueDate");

-- CreateIndex
CREATE INDEX "FiscalYears_tenantId_idx" ON "FiscalYears"("tenantId");

-- CreateIndex
CREATE INDEX "FiscalYears_tenantId_isActive_idx" ON "FiscalYears"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "FiscalYears_tenantId_isClosed_idx" ON "FiscalYears"("tenantId", "isClosed");

-- CreateIndex
CREATE INDEX "FiscalYears_tenantId_startDate_idx" ON "FiscalYears"("tenantId", "startDate");

-- CreateIndex
CREATE INDEX "FiscalYears_tenantId_name_idx" ON "FiscalYears"("tenantId", "name");

-- CreateIndex
CREATE INDEX "OnlinePayments_tenantId_idx" ON "OnlinePayments"("tenantId");

-- CreateIndex
CREATE INDEX "OnlinePayments_tenantId_status_idx" ON "OnlinePayments"("tenantId", "status");

-- CreateIndex
CREATE INDEX "OnlinePayments_invoiceId_idx" ON "OnlinePayments"("invoiceId");

-- CreateIndex
CREATE INDEX "OnlinePayments_authority_idx" ON "OnlinePayments"("authority");

-- CreateIndex
CREATE INDEX "OnlinePayments_installmentId_idx" ON "OnlinePayments"("installmentId");

-- CreateIndex
CREATE INDEX "OnlinePayments_gatewayId_idx" ON "OnlinePayments"("gatewayId");

-- CreateIndex
CREATE UNIQUE INDEX "SmsSettings_tenantId_key" ON "SmsSettings"("tenantId");

-- CreateIndex
CREATE INDEX "SmsLogs_tenantId_idx" ON "SmsLogs"("tenantId");

-- CreateIndex
CREATE INDEX "SmsLogs_tenantId_type_idx" ON "SmsLogs"("tenantId", "type");

-- CreateIndex
CREATE INDEX "SmsLogs_tenantId_status_idx" ON "SmsLogs"("tenantId", "status");

-- CreateIndex
CREATE INDEX "SmsLogs_referenceType_referenceId_idx" ON "SmsLogs"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "SmsLogs_sentAt_idx" ON "SmsLogs"("sentAt");

-- CreateIndex
CREATE INDEX "RecurringJournals_tenantId_idx" ON "RecurringJournals"("tenantId");

-- CreateIndex
CREATE INDEX "RecurringJournals_tenantId_isActive_idx" ON "RecurringJournals"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "RecurringJournals_nextExecutionDate_idx" ON "RecurringJournals"("nextExecutionDate");

-- CreateIndex
CREATE INDEX "RecurringJournals_tenantId_frequency_idx" ON "RecurringJournals"("tenantId", "frequency");

-- CreateIndex
CREATE UNIQUE INDEX "MoidianSettings_tenantId_key" ON "MoidianSettings"("tenantId");

-- CreateIndex
CREATE INDEX "MoidianSettings_tenantId_idx" ON "MoidianSettings"("tenantId");

-- CreateIndex
CREATE INDEX "MoidianSettings_fiscalId_idx" ON "MoidianSettings"("fiscalId");

-- CreateIndex
CREATE INDEX "Warehouses_tenantId_idx" ON "Warehouses"("tenantId");

-- CreateIndex
CREATE INDEX "Warehouses_tenantId_isActive_idx" ON "Warehouses"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouses_code_tenantId_key" ON "Warehouses"("code", "tenantId");

-- CreateIndex
CREATE INDEX "StockLevels_tenantId_idx" ON "StockLevels"("tenantId");

-- CreateIndex
CREATE INDEX "StockLevels_productId_idx" ON "StockLevels"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "StockLevels_warehouseId_productId_key" ON "StockLevels"("warehouseId", "productId");

-- CreateIndex
CREATE INDEX "StockMovements_tenantId_idx" ON "StockMovements"("tenantId");

-- CreateIndex
CREATE INDEX "StockMovements_productId_idx" ON "StockMovements"("productId");

-- CreateIndex
CREATE INDEX "StockMovements_referenceType_referenceId_idx" ON "StockMovements"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "StockMovements_movementType_idx" ON "StockMovements"("movementType");

-- CreateIndex
CREATE INDEX "Suppliers_tenantId_idx" ON "Suppliers"("tenantId");

-- CreateIndex
CREATE INDEX "Suppliers_tenantId_isActive_idx" ON "Suppliers"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Suppliers_code_tenantId_key" ON "Suppliers"("code", "tenantId");

-- CreateIndex
CREATE INDEX "PurchaseInvoices_tenantId_idx" ON "PurchaseInvoices"("tenantId");

-- CreateIndex
CREATE INDEX "PurchaseInvoices_tenantId_status_idx" ON "PurchaseInvoices"("tenantId", "status");

-- CreateIndex
CREATE INDEX "PurchaseInvoices_tenantId_invoiceType_idx" ON "PurchaseInvoices"("tenantId", "invoiceType");

-- CreateIndex
CREATE INDEX "PurchaseInvoices_supplierId_idx" ON "PurchaseInvoices"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseInvoices_warehouseId_idx" ON "PurchaseInvoices"("warehouseId");

-- CreateIndex
CREATE INDEX "PurchaseInvoices_originalPurchaseInvoiceId_idx" ON "PurchaseInvoices"("originalPurchaseInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseInvoices_number_tenantId_key" ON "PurchaseInvoices"("number", "tenantId");

-- CreateIndex
CREATE INDEX "PurchaseInvoiceItems_purchaseInvoiceId_idx" ON "PurchaseInvoiceItems"("purchaseInvoiceId");

-- CreateIndex
CREATE INDEX "PurchaseInvoiceItems_productId_idx" ON "PurchaseInvoiceItems"("productId");

-- CreateIndex
CREATE INDEX "StockCounts_tenantId_idx" ON "StockCounts"("tenantId");

-- CreateIndex
CREATE INDEX "StockCounts_tenantId_status_idx" ON "StockCounts"("tenantId", "status");

-- CreateIndex
CREATE INDEX "StockCounts_tenantId_countDate_idx" ON "StockCounts"("tenantId", "countDate");

-- CreateIndex
CREATE INDEX "StockCounts_warehouseId_idx" ON "StockCounts"("warehouseId");

-- CreateIndex
CREATE INDEX "StockCounts_countedBy_idx" ON "StockCounts"("countedBy");

-- CreateIndex
CREATE INDEX "StockCounts_journalEntryId_idx" ON "StockCounts"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "StockCounts_number_tenantId_key" ON "StockCounts"("number", "tenantId");

-- CreateIndex
CREATE INDEX "StockCountItems_stockCountId_idx" ON "StockCountItems"("stockCountId");

-- CreateIndex
CREATE INDEX "StockCountItems_productId_idx" ON "StockCountItems"("productId");

-- CreateIndex
CREATE INDEX "StockCountItems_stockCountId_productId_idx" ON "StockCountItems"("stockCountId", "productId");

-- CreateIndex
CREATE INDEX "Branches_tenantId_idx" ON "Branches"("tenantId");

-- CreateIndex
CREATE INDEX "Branches_tenantId_isActive_idx" ON "Branches"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Branches_code_tenantId_key" ON "Branches"("code", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Tickets_ticketNumber_key" ON "Tickets"("ticketNumber");

-- CreateIndex
CREATE INDEX "Tickets_tenantId_idx" ON "Tickets"("tenantId");

-- CreateIndex
CREATE INDEX "Tickets_tenantId_status_idx" ON "Tickets"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Tickets_tenantId_createdAt_idx" ON "Tickets"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Tickets_status_idx" ON "Tickets"("status");

-- CreateIndex
CREATE INDEX "Tickets_assignedTo_idx" ON "Tickets"("assignedTo");

-- CreateIndex
CREATE INDEX "Tickets_priority_idx" ON "Tickets"("priority");

-- CreateIndex
CREATE INDEX "Tickets_category_idx" ON "Tickets"("category");

-- CreateIndex
CREATE INDEX "TicketMessages_ticketId_idx" ON "TicketMessages"("ticketId");

-- CreateIndex
CREATE INDEX "TicketMessages_ticketId_createdAt_idx" ON "TicketMessages"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "TicketMessages_senderId_idx" ON "TicketMessages"("senderId");

-- CreateIndex
CREATE INDEX "TicketMessages_senderType_idx" ON "TicketMessages"("senderType");

-- CreateIndex
CREATE INDEX "InitialBalances_tenantId_idx" ON "InitialBalances"("tenantId");

-- CreateIndex
CREATE INDEX "InitialBalances_tenantId_type_idx" ON "InitialBalances"("tenantId", "type");

-- CreateIndex
CREATE INDEX "InitialBalances_accountId_idx" ON "InitialBalances"("accountId");

-- CreateIndex
CREATE INDEX "InitialBalances_productId_idx" ON "InitialBalances"("productId");

-- CreateIndex
CREATE INDEX "InitialBalances_journalEntryId_idx" ON "InitialBalances"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUsers_username_key" ON "AdminUsers"("username");

-- CreateIndex
CREATE INDEX "FixedAssets_tenantId_idx" ON "FixedAssets"("tenantId");

-- CreateIndex
CREATE INDEX "FixedAssets_tenantId_status_idx" ON "FixedAssets"("tenantId", "status");

-- CreateIndex
CREATE INDEX "FixedAssets_tenantId_category_idx" ON "FixedAssets"("tenantId", "category");

-- CreateIndex
CREATE INDEX "FixedAssets_accountId_idx" ON "FixedAssets"("accountId");

-- CreateIndex
CREATE INDEX "FixedAssets_journalEntryId_idx" ON "FixedAssets"("journalEntryId");

-- AddForeignKey
ALTER TABLE "Tenants" ADD CONSTRAINT "Tenants_planTierId_fkey" FOREIGN KEY ("planTierId") REFERENCES "PlanTiers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "OtpCodes" ADD CONSTRAINT "OtpCodes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AuditLogs" ADD CONSTRAINT "AuditLogs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PortalUsers" ADD CONSTRAINT "PortalUsers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "SubscriptionPayments" ADD CONSTRAINT "SubscriptionPayments_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscriptions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "SubscriptionPayments" ADD CONSTRAINT "SubscriptionPayments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Subscriptions" ADD CONSTRAINT "Subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plans"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Subscriptions" ADD CONSTRAINT "Subscriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "UserLookups" ADD CONSTRAINT "UserLookups_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PlanPrices" ADD CONSTRAINT "PlanPrices_planTierId_fkey" FOREIGN KEY ("planTierId") REFERENCES "PlanTiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreUsers" ADD CONSTRAINT "StoreUsers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Products" ADD CONSTRAINT "Products_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Products" ADD CONSTRAINT "Products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Products" ADD CONSTRAINT "Products_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCategories" ADD CONSTRAINT "ProductCategories_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Units" ADD CONSTRAINT "Units_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Customers" ADD CONSTRAINT "Customers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Accounts" ADD CONSTRAINT "Accounts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Invoices" ADD CONSTRAINT "Invoices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Invoices" ADD CONSTRAINT "Invoices_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoices" ADD CONSTRAINT "Invoices_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "StoreUsers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoices" ADD CONSTRAINT "Invoices_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItems" ADD CONSTRAINT "InvoiceItems_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePayments" ADD CONSTRAINT "InvoicePayments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InvoicePayments" ADD CONSTRAINT "InvoicePayments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentPlans" ADD CONSTRAINT "InstallmentPlans_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InstallmentPlans" ADD CONSTRAINT "InstallmentPlans_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentSchedules" ADD CONSTRAINT "InstallmentSchedules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InstallmentSchedules" ADD CONSTRAINT "InstallmentSchedules_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InstallmentPlans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntries" ADD CONSTRAINT "JournalEntries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "JournalEntries" ADD CONSTRAINT "JournalEntries_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "FiscalYears"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryLines" ADD CONSTRAINT "JournalEntryLines_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreSettings" ADD CONSTRAINT "StoreSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PaymentGateways" ADD CONSTRAINT "PaymentGateways_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PosDevices" ADD CONSTRAINT "PosDevices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CardPayments" ADD CONSTRAINT "CardPayments_posDeviceId_fkey" FOREIGN KEY ("posDeviceId") REFERENCES "PosDevices"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CardPayments" ADD CONSTRAINT "CardPayments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoices"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CardPayments" ADD CONSTRAINT "CardPayments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Backups" ADD CONSTRAINT "Backups_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Checks" ADD CONSTRAINT "Checks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "FiscalYears" ADD CONSTRAINT "FiscalYears_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "OnlinePayments" ADD CONSTRAINT "OnlinePayments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "OnlinePayments" ADD CONSTRAINT "OnlinePayments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsSettings" ADD CONSTRAINT "SmsSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "SmsLogs" ADD CONSTRAINT "SmsLogs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "RecurringJournals" ADD CONSTRAINT "RecurringJournals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MoidianSettings" ADD CONSTRAINT "MoidianSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Warehouses" ADD CONSTRAINT "Warehouses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Warehouses" ADD CONSTRAINT "Warehouses_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "StockLevels" ADD CONSTRAINT "StockLevels_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "StockLevels" ADD CONSTRAINT "StockLevels_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "StockLevels" ADD CONSTRAINT "StockLevels_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "StockMovements" ADD CONSTRAINT "StockMovements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "StockMovements" ADD CONSTRAINT "StockMovements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Suppliers" ADD CONSTRAINT "Suppliers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PurchaseInvoices" ADD CONSTRAINT "PurchaseInvoices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PurchaseInvoices" ADD CONSTRAINT "PurchaseInvoices_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Suppliers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PurchaseInvoices" ADD CONSTRAINT "PurchaseInvoices_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PurchaseInvoices" ADD CONSTRAINT "PurchaseInvoices_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntries"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PurchaseInvoiceItems" ADD CONSTRAINT "PurchaseInvoiceItems_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoiceItems" ADD CONSTRAINT "PurchaseInvoiceItems_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "StockCounts" ADD CONSTRAINT "StockCounts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "StockCounts" ADD CONSTRAINT "StockCounts_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "StockCountItems" ADD CONSTRAINT "StockCountItems_stockCountId_fkey" FOREIGN KEY ("stockCountId") REFERENCES "StockCounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountItems" ADD CONSTRAINT "StockCountItems_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Branches" ADD CONSTRAINT "Branches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Tickets" ADD CONSTRAINT "Tickets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Tickets" ADD CONSTRAINT "Tickets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "StoreUsers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "TicketMessages" ADD CONSTRAINT "TicketMessages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMessages" ADD CONSTRAINT "TicketMessages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "StoreUsers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InitialBalances" ADD CONSTRAINT "InitialBalances_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InitialBalances" ADD CONSTRAINT "InitialBalances_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Accounts"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InitialBalances" ADD CONSTRAINT "InitialBalances_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Products"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InitialBalances" ADD CONSTRAINT "InitialBalances_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntries"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "FixedAssets" ADD CONSTRAINT "FixedAssets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "FixedAssets" ADD CONSTRAINT "FixedAssets_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "FixedAssets" ADD CONSTRAINT "FixedAssets_accumDepAccountId_fkey" FOREIGN KEY ("accumDepAccountId") REFERENCES "Accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "FixedAssets" ADD CONSTRAINT "FixedAssets_depExpenseAccountId_fkey" FOREIGN KEY ("depExpenseAccountId") REFERENCES "Accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "FixedAssets" ADD CONSTRAINT "FixedAssets_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
