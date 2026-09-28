import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { site } from '@/config/site';
import { isLocale, locales, type Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';

/**
 * Link preview (LinkedIn, WhatsApp, Slack, X…): 1200×630 PNG per language,
 * rendered once at build time into out/{pt,en}/opengraph-image.png.
 * Same palette and "stickers" as the hero. No emoji: they would need a network fetch at build.
 */

// Required by `output: 'export'`: rendered once per locale at build time.
export const dynamic = 'force-static';
export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Nathan Camini';

const font = (weight: number) =>
  readFile(join(process.cwd(), `node_modules/@fontsource/inter/files/inter-latin-${weight}-normal.woff`));

const C = {
  bg: '#161826',
  text: '#e9e9ed',
  muted: '#9397ab',
  accent: '#9184d9',
  accentSoft: '#b5abfc',
  green: '#8be3b0',
  red: '#ff8a95',
  yellow: '#f5d27a',
};

function Sticker({
  text,
  color,
  top,
  left,
  rotate,
}: {
  text: string;
  color: string;
  top: number;
  left: number;
  rotate: number;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        display: 'flex',
        padding: '10px 18px',
        borderRadius: 999,
        border: `1.5px solid ${color}66`,
        background: `${color}1f`,
        color,
        fontSize: 22,
        fontWeight: 600,
        transform: `rotate(${rotate}deg)`,
      }}
    >
      {text}
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale: Locale = isLocale(lang) ? lang : 'pt';
  const t = getDictionary(locale);
  const [regular, semibold, bold] = await Promise.all([font(400), font(600), font(700)]);
  const hire = locale === 'pt' ? '$ sudo contratar nathan' : '$ sudo hire nathan';

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        background: `radial-gradient(circle at 18% 30%, #353b80 0%, ${C.bg} 55%)`,
        fontFamily: 'Inter',
        color: C.text,
      }}
    >
      {/* Stickers on the right, like the hero */}
      <Sticker text="GET /api/nathan" color={C.accentSoft} top={80} left={905} rotate={-4} />
      <Sticker text="200 OK" color={C.green} top={175} left={1015} rotate={5} />
      <Sticker text="404 - NOT FOUND" color={C.red} top={265} left={915} rotate={-3} />
      <Sticker text="200 - Error ?!" color={C.yellow} top={360} left={975} rotate={4} />
      <Sticker text='{ "json": true }' color={C.muted} top={455} left={930} rotate={-5} />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 72px',
          width: 890,
        }}
      >
        <div style={{ display: 'flex', fontSize: 26, fontWeight: 600, color: C.accent, letterSpacing: 2 }}>
          / PORTFOLIO
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 18,
            fontSize: 92,
            whiteSpace: 'nowrap',
            fontWeight: 700,
            letterSpacing: -4,
            lineHeight: 1,
          }}
        >
          {site.name}
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 24,
            fontSize: 34,
            fontWeight: 600,
            color: C.accentSoft,
            whiteSpace: 'nowrap',
          }}
        >
          {t.cv.headline}
        </div>
        <div style={{ display: 'flex', marginTop: 14, fontSize: 23, color: C.muted, lineHeight: 1.4 }}>
          {t.meta.ogLine}
        </div>
        <div
          style={{
            display: 'flex',
            alignSelf: 'flex-start',
            marginTop: 44,
            padding: '14px 22px',
            borderRadius: 12,
            background: '#0d0e16',
            border: `1.5px solid ${C.green}55`,
            color: C.green,
            fontSize: 26,
            fontWeight: 600,
          }}
        >
          {hire}
        </div>
      </div>

      {/* Accent bar along the bottom edge */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 10,
          display: 'flex',
          background: `linear-gradient(90deg, ${C.accent}, ${C.accentSoft}, ${C.accent})`,
        }}
      />
    </div>,
    {
      ...size,
      fonts: [
        { name: 'Inter', data: regular, weight: 400, style: 'normal' },
        { name: 'Inter', data: semibold, weight: 600, style: 'normal' },
        { name: 'Inter', data: bold, weight: 700, style: 'normal' },
      ],
    },
  );
}
