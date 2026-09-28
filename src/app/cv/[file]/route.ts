import { locales } from '@/i18n/config';
import { resumePdfFile } from '@/lib/resume';
import { renderResumePdf } from '@/lib/resume-pdf';

// Prerendered at build time into out/cv/nathan-camini-{pt,en}.pdf.
export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((locale) => ({ file: resumePdfFile(locale) }));
}

export async function GET(_request: Request, { params }: RouteContext<'/cv/[file]'>) {
  const { file } = await params;
  const locale = locales.find((l) => resumePdfFile(l) === file) ?? locales[0];
  return new Response(renderResumePdf(locale), { headers: { 'Content-Type': 'application/pdf' } });
}
