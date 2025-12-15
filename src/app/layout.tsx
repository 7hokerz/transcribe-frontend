import { headers } from 'next/headers';
import { Inter, Source_Code_Pro } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  display: 'swap',
  variable: '--font-inter',
  preload: true,
  adjustFontFallback: true,
});

const sourceCodePro = Source_Code_Pro({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-source-code-pro',
  preload: true,
  adjustFontFallback: true,
});

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const nonce = headersList.get('x-nonce') || '';

  return (
    <html
      lang="ko"
      className={`${inter.variable} ${sourceCodePro.variable}`}
      suppressHydrationWarning
    >
      <body className="font-body antialiased">
        <Providers nonce={nonce}>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
