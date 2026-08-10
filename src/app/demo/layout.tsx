// src/app/demo/layout.tsx
// Layout ساده برای صفحات دمو (بدون header/footer اصلی)

export default function DemoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-white">
      {children}
    </div>
  )
}