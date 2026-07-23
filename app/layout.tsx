import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Image Background Remover',
  description: 'Upload an image, remove the background, and download a transparent PNG.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='zh-CN'>
      <body>{children}</body>
    </html>
  )
}
