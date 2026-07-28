/**
 * Zod Validation Schemas - Invoice
 * 
 * Input validation for invoice endpoints
 */

import { z } from 'zod'
import { tenantId, cuid, paginationSchema, searchSchema, dateRangeSchema } from './common'

// ============================================
// Invoice Item Schema
// ============================================

export const invoiceItemSchema = z.object({
  productId: z.string().optional().nullable(),
  productName: z.string().min(1, 'نام محصول الزامی است'),
  quantity: z.number().positive('تعداد باید بیشتر از صفر باشد'),
  unitPrice: z.number().min(0, 'قیمت واحد نمی‌تواند منفی باشد'),
  discount: z.number().min(0).max(100, 'تخفیف حداکثر ۱۰۰ درصد').default(0),
  taxRate: z.number().min(0).max(100, 'مالیات حداکثر ۱۰۰ درصد').default(0),
})

// ============================================
// Invoice Payment Schema
// ============================================

export const invoicePaymentSchema = z.object({
  amount: z.number().positive('مبلغ پرداخت باید بیشتر از صفر باشد'),
  paymentType: z.enum(['Cash', 'Card', 'Online', 'Transfer']).default('Cash'),
  reference: z.string().optional().nullable(),
})

// ============================================
// Create Invoice Schema
// ============================================

export const createInvoiceSchema = z.object({
  customerId: z.string().optional().nullable(),
  paymentType: z.enum(['Cash', 'Credit', 'Installment']).default('Cash'),
  items: z.array(invoiceItemSchema).min(1, 'حداقل یک قلم فاکتور الزامی است'),
  payments: z.array(invoicePaymentSchema).optional().default([]),
  description: z.string().max(500, 'توضیحات حداکثر ۵۰۰ کاراکتر').optional().nullable(),
  cashierId: z.string().optional().nullable(),
  tenantId: tenantId,
  
  // Installment fields
  numberOfInstallments: z.number().int().min(2, 'حداقل ۲ قسط').max(60, 'حداکثر ۶۰ قسط').optional(),
  intervalDays: z.number().int().min(7, 'حداقل ۷ روز بین اقساط').max(365).default(30).optional(),
  interestRate: z.number().min(0).max(50, 'سود حداکثر ۵۰ درصد').default(0).optional(),
}).refine(
  (data) => {
    // If payment type is Installment, numberOfInstallments is required
    if (data.paymentType === 'Installment' && !data.numberOfInstallments) {
      return false
    }
    return true
  },
  { message: 'تعداد اقساط برای فاکتور اقساطی الزامی است', path: ['numberOfInstallments'] }
)

// ============================================
// Invoice Query Schema (GET)
// ============================================

export const invoiceQuerySchema = paginationSchema
  .merge(searchSchema)
  .merge(dateRangeSchema)
  .merge(z.object({
    tenantId: tenantId,
    status: z.enum(['Draft', 'Paid', 'PartiallyPaid', 'Overdue', 'Cancelled']).optional(),
    paymentType: z.enum(['Cash', 'Credit', 'Installment']).optional(),
  }))

// ============================================
// Update Invoice Status Schema
// ============================================

export const updateInvoiceStatusSchema = z.object({
  id: cuid,
  tenantId: tenantId,
  status: z.enum(['Draft', 'Paid', 'PartiallyPaid', 'Overdue', 'Cancelled']),
})

// ============================================
// Type Exports
// ============================================

export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>
export type InvoicePaymentInput = z.infer<typeof invoicePaymentSchema>
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>
export type InvoiceQueryInput = z.infer<typeof invoiceQuerySchema>
export type UpdateInvoiceStatusInput = z.infer<typeof updateInvoiceStatusSchema>
