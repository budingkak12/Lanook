import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { I18nProvider } from '@/components/i18n-provider'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/toaster'
import './globals.css'

// 临时禁用Google字体，使用系统字体避免网络问题
// const _geist = Geist({
//   subsets: ["latin"],
//   variable: "--font-geist"
// });
// const _geistMono = Geist_Mono({
//   subsets: ["latin"],
//   variable: "--font-geist-mono"
// });

export const metadata: Metadata = {
  title: 'Lanook',
  description: 'Created with v0',
  generator: 'v0.app',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' }
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }
    ]
  },
  manifest: '/site.webmanifest',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
          themes={["light", "dark", "warm"]}
        >
          <I18nProvider>
            {children}
          </I18nProvider>
          <Analytics />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
