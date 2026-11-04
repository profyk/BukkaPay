import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'BukkaPay Admin',
  description: 'Manage website content, legal docs, pricing plans, and merchant onboarding.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
