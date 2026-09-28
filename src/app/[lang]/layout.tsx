import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { notFound } from 'next/navigation';
import { Providers } from '@/components/Providers';
import { site } from '@/config/site';
import { htmlLang, isLocale, locales } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import '../globals.css';

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

// Pre-render /pt and /en at build time; any other first segment is a 404.
export const dynamicParams = false;
export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<'/[lang]'>): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = getDictionary(lang);
  return {
    metadataBase: new URL(site.url),
    title: t.meta.title,
    description: t.meta.description,
    authors: [{ name: site.name }],
    alternates: {
      canonical: `/${lang}`,
      languages: { 'pt-BR': '/pt', en: '/en', 'x-default': '/pt' },
    },
    openGraph: {
      type: 'website',
      title: t.meta.title,
      description: t.meta.description,
      url: `/${lang}`,
      siteName: site.name,
      locale: lang === 'pt' ? 'pt_BR' : 'en_US',
    },
  };
}

export const viewport: Viewport = {
  themeColor: '#161826',
  colorScheme: 'dark',
};

export default async function RootLayout({ children, params }: LayoutProps<'/[lang]'>) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  return (
    <html lang={htmlLang[lang]} className={inter.variable}>
      <body>
        <Providers locale={lang}>{children}</Providers>
      </body>
    </html>
  );
}
