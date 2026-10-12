import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    default: 'Acme',
    template: '%s | Acme',
  },
  description: 'Reusable rockets.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
