/*
  Warnings:

  - You are about to alter the column `amount` on the `CardPayments` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `amount` on the `Checks` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `creditLimit` on the `Customers` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `currentBalance` on the `Customers` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `purchasePrice` on the `FixedAssets` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `salvageValue` on the `FixedAssets` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `depreciationRate` on the `FixedAssets` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,6)`.
  - You are about to alter the column `accumulatedDepreciation` on the `FixedAssets` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `bookValue` on the `FixedAssets` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `amount` on the `InitialBalances` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `quantity` on the `InitialBalances` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,4)`.
  - You are about to alter the column `totalAmount` on the `InstallmentPlans` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `downPayment` on the `InstallmentPlans` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `remainingAmount` on the `InstallmentPlans` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `interestRate` on the `InstallmentPlans` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(8,4)`.
  - You are about to alter the column `totalWithInterest` on the `InstallmentPlans` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `installmentAmount` on the `InstallmentPlans` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `totalPaidAmount` on the `InstallmentPlans` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `amount` on the `InstallmentSchedules` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `paidAmount` on the `InstallmentSchedules` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `quantity` on the `InvoiceItems` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,4)`.
  - You are about to alter the column `unitPrice` on the `InvoiceItems` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `discountAmount` on the `InvoiceItems` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `taxAmount` on the `InvoiceItems` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `lineTotal` on the `InvoiceItems` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `amount` on the `InvoicePayments` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `subTotal` on the `Invoices` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `discountAmount` on the `Invoices` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `taxAmount` on the `Invoices` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `totalAmount` on the `Invoices` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `paidAmount` on the `Invoices` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `remainingAmount` on the `Invoices` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `cogsAmount` on the `Invoices` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `totalDebit` on the `JournalEntries` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `totalCredit` on the `JournalEntries` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `debit` on the `JournalEntryLines` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `credit` on the `JournalEntryLines` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `amount` on the `OnlinePayments` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `price` on the `Plans` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `purchasePrice` on the `Products` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `salePrice` on the `Products` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `currentStock` on the `Products` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,4)`.
  - You are about to alter the column `minStock` on the `Products` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,4)`.
  - You are about to alter the column `quantity` on the `PurchaseInvoiceItems` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,4)`.
  - You are about to alter the column `unitPrice` on the `PurchaseInvoiceItems` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `discountAmount` on the `PurchaseInvoiceItems` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `taxAmount` on the `PurchaseInvoiceItems` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `lineTotal` on the `PurchaseInvoiceItems` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `subTotal` on the `PurchaseInvoices` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `discountAmount` on the `PurchaseInvoices` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `taxAmount` on the `PurchaseInvoices` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `totalAmount` on the `PurchaseInvoices` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `paidAmount` on the `PurchaseInvoices` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `remainingAmount` on the `PurchaseInvoices` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `systemQty` on the `StockCountItems` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,4)`.
  - You are about to alter the column `countedQty` on the `StockCountItems` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,4)`.
  - You are about to alter the column `difference` on the `StockCountItems` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,4)`.
  - You are about to alter the column `unitCost` on the `StockCountItems` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `differenceAmount` on the `StockCountItems` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `totalDifference` on the `StockCounts` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `quantity` on the `StockLevels` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,4)`.
  - You are about to alter the column `averageCost` on the `StockLevels` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `quantity` on the `StockMovements` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,4)`.
  - You are about to alter the column `unitCost` on the `StockMovements` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `amount` on the `SubscriptionPayments` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `creditLimit` on the `Suppliers` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `currentBalance` on the `Suppliers` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.

*/
-- AlterTable
ALTER TABLE "CardPayments" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "Checks" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "Customers" ALTER COLUMN "creditLimit" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "currentBalance" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "FixedAssets" ALTER COLUMN "purchasePrice" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "salvageValue" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "depreciationRate" SET DATA TYPE DECIMAL(10,6),
ALTER COLUMN "accumulatedDepreciation" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "bookValue" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "InitialBalances" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "InstallmentPlans" ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "downPayment" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "remainingAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "interestRate" SET DATA TYPE DECIMAL(8,4),
ALTER COLUMN "totalWithInterest" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "installmentAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "totalPaidAmount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "InstallmentSchedules" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "paidAmount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "InvoiceItems" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "discountAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "taxAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "lineTotal" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "InvoicePayments" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "Invoices" ALTER COLUMN "subTotal" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "discountAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "taxAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "paidAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "remainingAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "cogsAmount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "JournalEntries" ALTER COLUMN "totalDebit" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "totalCredit" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "JournalEntryLines" ALTER COLUMN "debit" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "credit" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "OnlinePayments" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "Plans" ALTER COLUMN "price" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "Products" ALTER COLUMN "purchasePrice" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "salePrice" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "currentStock" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "minStock" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "PurchaseInvoiceItems" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "discountAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "taxAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "lineTotal" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "PurchaseInvoices" ALTER COLUMN "subTotal" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "discountAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "taxAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "paidAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "remainingAmount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "StockCountItems" ALTER COLUMN "systemQty" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "countedQty" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "difference" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "unitCost" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "differenceAmount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "StockCounts" ALTER COLUMN "totalDifference" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "StockLevels" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "averageCost" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "StockMovements" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "unitCost" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "SubscriptionPayments" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "Suppliers" ALTER COLUMN "creditLimit" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "currentBalance" SET DATA TYPE DECIMAL(18,2);
