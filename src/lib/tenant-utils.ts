// ============================================================================
// src/lib/tenant-utils.ts
// ShopAccounting — توابع کمکی برای مدیریت tenantId در Client Components
// ============================================================================

import { useAppStore } from '@/lib/store'

// ✅ FIX v6: fallback به user.tenantId هم اضافه شد
export function resolveTenantId(
  currentTenant: any,
  storeTenantId?: string | null,
  userTenantId?: string | null
): string {
  // 1. از currentTenant.id
  if (currentTenant && typeof currentTenant === 'object' && currentTenant.id) return currentTenant.id
  if (currentTenant && typeof currentTenant === 'string') return currentTenant
  // 2. از storeTenantId (store.tenantId)
  if (storeTenantId && typeof storeTenantId === 'string' && storeTenantId.trim()) return storeTenantId.trim()
  // 3. از userTenantId (user.tenantId)
  if (userTenantId && typeof userTenantId === 'string' && userTenantId.trim()) return userTenantId.trim()
  return ''
}

// ✅ FIX v6: تابع کمکی برای گرفتن tenantId از store در هر لحظه
export function getTenantIdFromStore(): string {
  const state = useAppStore.getState()
  return resolveTenantId(state.currentTenant, state.tenantId, state.user?.tenantId)
}

// ★ Type برای پشتیبان‌گیری (استفاده در BackupTab)
export interface BackupInfo {
  id: string
  fileName: string
  fileSize: number
  recordCount?: number
  createdAt: string
}