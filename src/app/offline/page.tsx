'use client'



export default function OfflinePage() {
  return (
    <html lang="fa" dir="rtl">
      <body style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        margin: 0,
        background: '#f9fafb',
        direction: 'rtl',
      }}>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📶</div>
          <h1 style={{ color: '#059669', fontSize: '1.5rem', marginBottom: '0.5rem' }}>
            اتصال اینترنت برقرار نیست
          </h1>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', maxWidth: '400px', lineHeight: '1.8' }}>
            شما آفلاین هستید. فروشگاه همچنان قابل استفاده است و اطلاعات به صورت محلی ذخیره می‌شود.
            پس از اتصال مجدد اینترنت، داده‌ها به صورت خودکار همگام‌سازی می‌شوند.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '1.5rem',
              padding: '0.5rem 1.5rem',
              backgroundColor: '#059669',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            تلاش مجدد
          </button>
        </div>
      </body>
    </html>
  )
}
