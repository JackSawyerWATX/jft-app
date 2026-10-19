import type { Metadata } from 'next';
import './globals.css';
/** Public page metadata describing the session-scoped save experience. */
export const metadata: Metadata = {
  title: 'Doorknob · A little space to reflect',
  description:
    'Read, reflect, and save private shares for this browser session.'
};
/** Supplies document metadata and the shared application stylesheet. */
export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
