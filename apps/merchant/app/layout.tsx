import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'BukkaPay Merchant',
  description: 'Merchant dashboard and onboarding workflow.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
