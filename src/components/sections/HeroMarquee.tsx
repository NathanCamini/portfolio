'use client';

import { Marquee } from '@/components/fun/Marquee';
import { useI18n } from '@/i18n/I18nProvider';

/** The band that slides over the fading hero and carries the eye into the Bio. */
export function HeroMarquee() {
  const { t } = useI18n();
  return <Marquee items={t.marquee} />;
}
