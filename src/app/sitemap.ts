import type { MetadataRoute } from 'next';
import { site } from '@/config/site';
import { locales } from '@/i18n/config';

export default function sitemap(): MetadataRoute.Sitemap {
  return locales.map((lang) => ({
    url: `${site.url}/${lang}`,
    changeFrequency: 'monthly',
    priority: lang === 'pt' ? 1 : 0.9,
    alternates: { languages: { 'pt-BR': `${site.url}/pt`, en: `${site.url}/en` } },
  }));
}
