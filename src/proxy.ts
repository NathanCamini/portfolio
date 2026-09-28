import { NextResponse, type NextRequest } from 'next/server';
import { defaultLocale, isLocale, LOCALE_COOKIE, locales, type Locale } from './i18n/config';

/**
 * Next.js 16 Proxy (formerly "middleware"): sends visitors hitting a path
 * without a locale prefix to `/pt` or `/en`.
 *
 * Priority: explicit choice (cookie set by the language toggle)
 *         → browser preference (Accept-Language, q-weighted)
 *         → default locale.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasLocale = locales.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`));
  if (hasLocale) return;

  const url = request.nextUrl.clone();
  url.pathname = `/${pickLocale(request)}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(url);
}

function pickLocale(request: NextRequest): Locale {
  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(cookie)) return cookie;

  const header = request.headers.get('accept-language') ?? '';
  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      return { lang: tag.toLowerCase().split('-')[0], q: q ? Number(q.split('=')[1]) || 0 : 1 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { lang } of ranked) if (isLocale(lang)) return lang;
  return defaultLocale;
}

export const config = {
  // Skip Next internals, API routes and any file with an extension (favicon, images…).
  matcher: ['/((?!_next|api|.*\\..*).*)'],
};
