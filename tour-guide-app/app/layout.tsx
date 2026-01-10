
// ============================================
// FILE: app/layout.tsx
// Replace existing file
// ============================================
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Tour Guide - Your Personal Travel Companion',
  description: 'Discover interesting places around you with AI-powered narration',
  manifest: '/manifest.json',
  themeColor: '#2563eb',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'AI Tour Guide'
  }
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}