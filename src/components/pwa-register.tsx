'use client'

import { useEffect } from 'react'

/**
 * PWA Registration Component
 * Registers the service worker and handles updates
 */
export function PWARegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) {
      console.warn('[PWA] Service workers not supported')
      return
    }

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        })

        console.log('[PWA] Service Worker registered:', registration.scope)

        setInterval(() => {
          registration.update().catch(() => {})
        }, 60 * 60 * 1000)

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (!newWorker) return

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'activated') {
              console.log('[PWA] New Service Worker activated')
            }
          })
        })
      } catch (error) {
        console.error('[PWA] Service Worker registration failed:', error)
      }
    }

    registerSW()
  }, [])

  return null
}

/**
 * Offline Data Initializer
 * v4.0: مقاوم در برابر خطا - اگر استور یا sync-engine لود نشد، crash نمی‌کند
 */
export function OfflineDataInitializer() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    let cleanedUp = false
    let unsubscribe: (() => void) | undefined

    const initOffline = async () => {
      try {
        // لود ماژول‌ها - اگر یکی نبود، بدون crash رد می‌شود
        const syncModule = await import('@/lib/sync-engine').catch(() => null)
        const storeModule = await import('@/lib/store').catch(() => null)

        if (!syncModule?.syncEngine) {
          console.warn('[PWA] syncEngine not available, offline init skipped')
          return
        }

        const store = storeModule?.useStore || storeModule?.useAppStore
        if (!store || typeof store.subscribe !== 'function') {
          console.warn('[PWA] Store not available, offline init skipped')
          return
        }

        const { syncEngine } = syncModule

        // Subscribe to auth state
        unsubscribe = store.subscribe((state: any) => {
          if (cleanedUp) return
        const tenantId = state?.tenantId
          if (state?.isAuthenticated && tenantId) {
            syncEngine.preloadData(tenantId).catch(() => {})
            syncEngine.init()
            if (unsubscribe) {
              unsubscribe()
              unsubscribe = undefined
            }
          }
        })

        // Check if already authenticated
        if (typeof store.getState === 'function') {
          const currentState = store.getState()
       const currentTenantId = currentState?.tenantId
          if (currentState?.isAuthenticated && currentTenantId) {
            syncEngine.preloadData(currentTenantId).catch(() => {})
            syncEngine.init()
            if (unsubscribe) {
              unsubscribe()
              unsubscribe = undefined
            }
          }
        }
      } catch (error) {
        // خطای PWA نباید کل اپ رو خراب کند
        console.warn('[PWA] Offline initialization skipped:', error)
      }
    }

    initOffline()

    return () => {
      cleanedUp = true
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [])

  return null
}