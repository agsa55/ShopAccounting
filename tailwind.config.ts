import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // ★★★ v8.8: Peyda به‌عنوان فونت اصلی
        sans: ['Peyda', 'Vazirmatn', 'system-ui', '-apple-system', 'sans-serif'],
        vazir: ['Vazirmatn', 'system-ui', '-apple-system', 'sans-serif'],
        peyda: ['Peyda', 'Vazirmatn', 'system-ui', 'sans-serif'],
        mono: ['Peyda', 'Vazirmatn', 'monospace'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // ★★★ v8.8: رنگ‌های معنایی جدید
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",                   // 8px
        md: "calc(var(--radius) - 2px)",       // 6px
        sm: "calc(var(--radius) - 4px)",       // 4px
        // ★★★ v8.8: radius جدید
        card: "var(--radius-card)",            // 12px
        xl: "var(--radius-lg)",                // 16px
      },
      boxShadow: {
        // ★★★ v8.8: سایه‌های تم بنفش-آبی ملایم
        'card': '0 1px 3px rgba(0, 0, 0, 0.04)',
        'card-hover': '0 4px 12px rgba(124, 123, 235, 0.08)',
        'primary': '0 2px 4px rgba(124, 123, 235, 0.15)',
        'primary-hover': '0 4px 8px rgba(124, 123, 235, 0.25)',
        'soft': '0 1px 2px rgba(0, 0, 0, 0.05)',
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in": {
          from: { opacity: "0", transform: "translateX(20px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.3s ease-out",
        "slide-in": "slide-in 0.3s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}

export default config
