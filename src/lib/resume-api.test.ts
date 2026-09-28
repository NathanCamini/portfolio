import { describe, expect, it } from 'vitest';
import { site } from '@/config/site';
import { handleApiRequest, parseAcceptLanguage } from './resume-api';

const BASE = 'https://nathan.example';
const get = (path: string, headers: Record<string, string> = {}, method = 'GET') =>
  handleApiRequest(new Request(BASE + path, { method, headers }));

describe('parseAcceptLanguage', () => {
  it('orders by q-value, keeping header order on ties, and drops q=0 and *', () => {
    expect(parseAcceptLanguage('en;q=0.5, pt-BR, fr;q=0, *;q=0.1, es;q=0.5')).toEqual(['pt-BR', 'en', 'es']);
    expect(parseAcceptLanguage(null)).toEqual([]);
  });
});

describe('GET /api/nathan', () => {
  it('returns the résumé as pretty JSON with CORS and links', async () => {
    const res = get('/api/nathan?lang=pt');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Content-Language')).toBe('pt-BR');

    const text = await res.text();
    expect(text).toContain('\n  "name"');
    const body = JSON.parse(text);
    expect(body.name).toBe(site.name);
    expect(body.contact.email).toBe(site.email);
    expect(body.experience[0].company).toBe('Tramontina');
    expect(body.experience[0].current).toBe(true);
    expect(body.education).toHaveLength(2);
    expect(body.skills).toContain('Genero');
    expect(new Set(body.skills).size).toBe(body.skills.length);
    expect(body.links.pdf).toBe(`${BASE}/cv/nathan-camini-pt.pdf`);
    expect(body.links.self).toBe(`${BASE}/api/nathan?lang=pt`);
  });

  it('picks the language from Accept-Language, falling back to English', async () => {
    expect((await get('/api/nathan', { 'Accept-Language': 'pt-BR,pt;q=0.9' }).json()).locale).toBe('pt-BR');
    expect((await get('/api/nathan', { 'Accept-Language': 'de-DE' }).json()).locale).toBe('en');
    expect((await get('/api/nathan').json()).locale).toBe('en');
  });

  it('rejects an unsupported lang', async () => {
    const res = get('/api/nathan?lang=es');
    expect(res.status).toBe(400);
    expect((await res.json()).supported).toEqual(['pt', 'en']);
  });

  it('redirects to the PDF with ?format=pdf or Accept: application/pdf', () => {
    const a = get('/api/nathan?format=pdf&lang=en');
    expect(a.status).toBe(303);
    expect(a.headers.get('Location')).toBe(`${BASE}/cv/nathan-camini-en.pdf`);
    const b = get('/api/nathan', { Accept: 'application/pdf', 'Accept-Language': 'pt' });
    expect(b.headers.get('Location')).toBe(`${BASE}/cv/nathan-camini-pt.pdf`);
  });

  it('answers HEAD without a body and OPTIONS with CORS', async () => {
    const head = get('/api/nathan', {}, 'HEAD');
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    const options = get('/api/nathan', {}, 'OPTIONS');
    expect(options.status).toBe(204);
    expect(options.headers.get('Access-Control-Allow-Methods')).toContain('GET');
  });

  it('405s other methods and 404s unknown paths', () => {
    const post = get('/api/nathan', {}, 'POST');
    expect(post.status).toBe(405);
    expect(post.headers.get('Allow')).toBe('GET, HEAD, OPTIONS');
    expect(get('/api/nope').status).toBe(404);
    expect(get('/api').status).toBe(200);
  });
});
