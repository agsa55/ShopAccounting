'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

// ذخیره رویداد نصب به‌صورت global
let deferredPrompt: BeforeInstallPromptEvent | null = null;

export function usePWAInstall() {
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // بررسی نصب بودن
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    
    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    // اگر قبلاً prompt ذخیره شده
    if (deferredPrompt) {
      setCanInstall(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt = e as BeforeInstallPromptEvent;
      setCanInstall(true);
      console.log('[PWA] Install prompt captured');
    };

    const installedHandler = () => {
      setIsInstalled(true);
      setCanInstall(false);
      deferredPrompt = null;
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    
    try {
      await deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      
      if (result.outcome === 'accepted') {
        console.log('[PWA] User accepted install');
        deferredPrompt = null;
        setCanInstall(false);
        return true;
      } else {
        console.log('[PWA] User dismissed install');
        return false;
      }
    } catch (err) {
      console.error('[PWA] Install error:', err);
      return false;
    }
  };

  return { canInstall, isInstalled, install };
}

export function PWARegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) {
      console.log('[PWA] Service Worker not supported');
      return;
    }

    // ★ فیکس: در محیط development اصلاً SW ثبت نمی‌کنیم
    // Turbopack مدام فایل‌ها rebuild می‌کنه → SW آپدیت میشه
    // → controllerchange → reload → حلقه بی‌نهایت
    if (process.env.NODE_ENV === 'development') {
      console.log('[PWA] ⏭️ Development mode — PWARegister غیرفعال است');

      // SW های قبلی رو هم پاک می‌کنیم تا مشکل cache نداشته باشیم
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((reg) => {
          reg.unregister().then((success) => {
            if (success) {
              console.log('[PWA] 🧹 SW قبلی unregister شد (dev mode)');
            }
          });
        });
      });

      return;
    }

    // ★ فقط در production اجرا می‌شود
    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register(
          '/sw.js',
          {
            scope: '/',
            updateViaCache: 'imports',
          }
        );

        console.log('[PWA] Service Worker registered:', registration.scope);

        // بررسی آپدیت
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (
              newWorker.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              console.log('[PWA] New version available');
              // می‌توانید یک notification به کاربر نشان دهید
            }
          });
        });

      } catch (error) {
        console.error('[PWA] Service Worker registration failed:', error);
      }
    };

    // بعد از load صفحه register کن
    if (document.readyState === 'complete') {
      registerSW();
    } else {
      window.addEventListener('load', registerSW, { once: true });
    }
  }, []);

  return null;
}