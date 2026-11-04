import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'BukkaPay',
  description: 'Secure wallets, merchant onboarding, and payments built for Africa and global business.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
