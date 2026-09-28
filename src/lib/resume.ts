import { site } from '@/config/site';
import { htmlLang, type Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';

/**
 * The résumé as data: one source (the page dictionaries) for three outputs —
 * the Bio section, the PDF (src/lib/resume-pdf.ts) and `GET /api/nathan`
 * (src/lib/resume-api.ts). Keys are English in every locale; values are localised.
 */
export interface Resume {
  name: string;
  headline: string;
  locale: string;
  summary: string;
  contact: { email: string; linkedin: string; github: string };
  experience: {
    role: string;
    company: string;
    period: string;
    location: string;
    current: boolean;
    description: string;
    highlights: string[];
    stack: string[];
  }[];
  education: {
    level: string;
    course: string;
    institution: string;
    period: string;
    status: string;
    completed: boolean;
  }[];
  skills: string[];
}

/** Public path of the prerendered PDF (see src/app/cv/[file]/route.ts). */
export function resumePdfPath(locale: Locale): string {
  return `/cv/${resumePdfFile(locale)}`;
}

export function resumePdfFile(locale: Locale): string {
  return `nathan-camini-${locale}.pdf`;
}

export function buildResume(locale: Locale): Resume {
  const t = getDictionary(locale);
  const experience = t.bio.exp.map((job) => ({
    role: job.role,
    company: job.company,
    period: job.period,
    location: job.place,
    current: !!job.current,
    description: job.body,
    highlights: job.highlights ?? [],
    stack: job.stack ?? [],
  }));

  return {
    name: site.name,
    headline: t.cv.headline,
    locale: htmlLang[locale],
    summary: t.cv.summary,
    contact: { email: site.email, linkedin: site.links.linkedin, github: site.links.github },
    experience,
    education: t.bio.edu.map((e) => ({
      level: e.level,
      course: e.course,
      institution: e.school,
      period: e.years,
      status: e.status,
      completed: e.done,
    })),
    // Everything listed under a job, most recent job first, without duplicates.
    skills: [...new Set(experience.flatMap((job) => job.stack))],
  };
}
