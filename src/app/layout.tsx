import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Doorknob · A little space to reflect',
  description: 'Read, reflect, and keep a private share on this device.'
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
