import { htmlLang, isLocale, locales, type Locale } from '@/i18n/config';
import { pickLocale } from '@/i18n/detect';
import { buildResume, resumePdfPath } from './resume';

/**
 * `GET /api/nathan` — the résumé as JSON. Runs in the Cloudflare Worker
 * (worker/index.ts), which only receives `/api/*`; everything else is served
 * straight from the static assets.
 *
 *   ?lang=pt|en          language (default: Accept-Language, then English)
 *   ?format=pdf          303 → the prerendered PDF (same for `Accept: application/pdf`)
 */

const ALLOW = 'GET, HEAD, OPTIONS';

const BASE_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': ALLOW,
  'X-Powered-By': 'coffee',
};

function json(body: unknown, status: number, request: Request, extra: Record<string, string> = {}): Response {
  const headers = { ...BASE_HEADERS, 'Content-Type': 'application/json; charset=utf-8', ...extra };
  // Pretty-printed: this endpoint is meant to be read in a terminal.
  const payload = request.method === 'HEAD' ? null : JSON.stringify(body, null, 2) + '\n';
  return new Response(payload, { status, headers });
}

/** Languages from an Accept-Language header, most preferred first (q-values respected). */
export function parseAcceptLanguage(header: string | null): string[] {
  if (!header) return [];
  return header
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      return { tag: tag.trim(), q: q ? Number(q.slice(2)) || 0 : 1, index };
    })
    .filter((l) => l.tag && l.tag !== '*' && l.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index)
    .map((l) => l.tag);
}

function wantsPdf(url: URL, request: Request): boolean {
  if (url.searchParams.get('format') === 'pdf') return true;
  const accept = request.headers.get('Accept') ?? '';
  return accept.includes('application/pdf') && !accept.includes('application/json');
}

export function handleApiRequest(request: Request): Response {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...BASE_HEADERS, Allow: ALLOW } });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ error: 'method_not_allowed', allow: ALLOW.split(', ') }, 405, request, { Allow: ALLOW });
  }

  if (path === '/api') {
    return json(
      {
        endpoints: {
          'GET /api/nathan': 'Résumé as JSON. Query: lang=pt|en, format=pdf.',
        },
      },
      200,
      request,
    );
  }

  if (path !== '/api/nathan') {
    return json({ error: 'not_found', hint: 'Try GET /api/nathan' }, 404, request);
  }

  const lang = url.searchParams.get('lang');
  if (lang !== null && !isLocale(lang)) {
    return json({ error: 'unsupported_lang', supported: locales }, 400, request);
  }
  const locale: Locale = lang ?? pickLocale(parseAcceptLanguage(request.headers.get('Accept-Language')));
  const pdf = resumePdfPath(locale);

  if (wantsPdf(url, request)) {
    return new Response(null, {
      status: 303,
      headers: { ...BASE_HEADERS, Location: new URL(pdf, url).toString(), Vary: 'Accept, Accept-Language' },
    });
  }

  const self = new URL('/api/nathan', url);
  self.searchParams.set('lang', locale);
  return json(
    {
      ...buildResume(locale),
      links: {
        self: self.toString(),
        pdf: new URL(pdf, url).toString(),
        site: new URL(`/${locale}`, url).toString(),
      },
    },
    200,
    request,
    {
      'Content-Language': htmlLang[locale],
      'Cache-Control': 'public, max-age=300',
      Vary: 'Accept, Accept-Language',
    },
  );
}
