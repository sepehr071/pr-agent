import type { Metadata } from 'next'
import { IBM_Plex_Sans, IBM_Plex_Mono, Vazirmatn } from 'next/font/google'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { Header } from '@/components/header'
import './globals.css'

const plexSans = IBM_Plex_Sans({
  variable: '--font-plex-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
})

// Persian/Arabic glyphs (review summaries can be written in Persian)
const vazirmatn = Vazirmatn({
  variable: '--font-vazirmatn',
  subsets: ['arabic'],
})

export const metadata: Metadata = {
  title: 'CTO Review Dashboard',
  description: 'AI Code Review Dashboard',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${plexSans.variable} ${plexMono.variable} ${vazirmatn.variable} antialiased min-h-screen flex flex-col`}
      >
        <TooltipProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  )
}
