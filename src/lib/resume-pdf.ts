import { jsPDF } from 'jspdf';
import type { Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { buildResume } from './resume';

/**
 * Renders the résumé as a real-text A4 PDF (selectable, searchable, ATS-friendly).
 * Runs at build time only (src/app/cv/[file]/route.ts), so jsPDF never ships to
 * the browser. Uses the built-in Helvetica (WinAnsi), which covers Portuguese.
 */

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2;

const INK = '#1b1d29';
const MUTED = '#666a7d';
const ACCENT = '#5d5294';
const RULE = '#d9d8e6';

export function renderResumePdf(locale: Locale): ArrayBuffer {
  const t = getDictionary(locale);
  const cv = buildResume(locale);
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  doc.setProperties({
    title: t.cv.docTitle,
    author: cv.name,
    subject: cv.headline,
    keywords: cv.skills.join(', '),
    creator: cv.name,
  });
  doc.setLanguage(locale === 'pt' ? 'pt-BR' : 'en-US');

  let y = MARGIN;

  const ensure = (height: number) => {
    if (y + height > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const font = (size: number, style: 'normal' | 'bold' = 'normal', color = INK) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(color);
  };

  /** Wrapped paragraph; returns nothing, advances `y`. */
  const paragraph = (text: string, size: number, color = INK, indent = 0) => {
    font(size, 'normal', color);
    const lines: string[] = doc.splitTextToSize(text, CONTENT_W - indent);
    const lh = size * 1.45;
    for (const line of lines) {
      ensure(lh);
      doc.text(line, MARGIN + indent, y + size);
      y += lh;
    }
  };

  const heading = (text: string) => {
    ensure(40);
    y += 14;
    font(10, 'bold', ACCENT);
    doc.setCharSpace(1.2);
    doc.text(text.toUpperCase(), MARGIN, y + 10);
    doc.setCharSpace(0);
    y += 16;
    doc.setDrawColor(RULE);
    doc.setLineWidth(0.8);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 10;
  };

  // ---- Header
  font(26, 'bold');
  doc.text(cv.name, MARGIN, y + 24);
  y += 34;
  font(12, 'normal', ACCENT);
  doc.text(cv.headline, MARGIN, y + 12);
  y += 22;

  font(9.5, 'normal', MUTED);
  const contacts: [string, string][] = [
    [cv.contact.email, `mailto:${cv.contact.email}`],
    [cv.contact.linkedin.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''), cv.contact.linkedin],
    [cv.contact.github.replace(/^https?:\/\/(www\.)?/, ''), cv.contact.github],
  ];
  let x = MARGIN;
  contacts.forEach(([label, url], i) => {
    if (i > 0) {
      doc.text('·', x + 7, y + 9.5);
      x += 17;
    }
    doc.textWithLink(label, x, y + 9.5, { url });
    x += doc.getTextWidth(label);
  });
  y += 18;

  // ---- Summary
  heading(t.cv.summaryLabel);
  paragraph(cv.summary, 10);

  // ---- Experience
  heading(t.bio.expLabel);
  cv.experience.forEach((job, i) => {
    if (i > 0) y += 10;
    ensure(48);
    font(11, 'bold');
    const title = `${job.role} — ${job.company}`;
    const periodW = (() => {
      font(9.5, 'normal', MUTED);
      return doc.getTextWidth(job.period);
    })();
    font(11, 'bold');
    const titleLines: string[] = doc.splitTextToSize(title, CONTENT_W - periodW - 16);
    titleLines.forEach((line, j) => {
      doc.text(line, MARGIN, y + 11 + j * 15);
    });
    font(9.5, 'normal', MUTED);
    doc.text(job.period, PAGE_W - MARGIN, y + 11, { align: 'right' });
    y += 15 * titleLines.length;
    doc.text(job.location, MARGIN, y + 9.5);
    y += 16;

    paragraph(job.description, 10);
    for (const h of job.highlights) {
      font(10, 'normal', ACCENT);
      ensure(14.5);
      doc.text('•', MARGIN + 4, y + 10);
      paragraph(h, 10, INK, 16);
    }
    if (job.stack.length) {
      y += 2;
      paragraph(`${t.cv.stackLabel}: ${job.stack.join(' · ')}`, 9, MUTED);
    }
  });

  // ---- Education
  heading(t.bio.eduLabel);
  cv.education.forEach((e, i) => {
    if (i > 0) y += 8;
    ensure(34);
    font(11, 'bold');
    doc.text(e.course, MARGIN, y + 11);
    font(9.5, 'normal', MUTED);
    doc.text(e.period, PAGE_W - MARGIN, y + 11, { align: 'right' });
    y += 16;
    doc.text(`${e.level} · ${e.institution} · ${e.status}`, MARGIN, y + 9.5);
    y += 14;
  });

  // ---- Skills
  heading(t.cv.skillsLabel);
  paragraph(cv.skills.join('  ·  '), 10);

  // ---- Footer on every page
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    font(8, 'normal', MUTED);
    doc.text(t.cv.pdfFooter, MARGIN, PAGE_H - 28);
    if (pages > 1) doc.text(`${p}/${pages}`, PAGE_W - MARGIN, PAGE_H - 28, { align: 'right' });
  }

  return doc.output('arraybuffer');
}
