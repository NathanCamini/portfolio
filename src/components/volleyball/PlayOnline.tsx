'use client';

import type { ReactNode } from 'react';
import { ArrowUpRight } from '@/components/ui/icons';
import { useI18n } from '@/i18n/I18nProvider';
import { gameLink } from '@/lib/game-link';

/** A link to the full game (online 1×1, Endless, rankings), in a new tab. */
export function PlayOnline({ className, children }: { className?: string; children: ReactNode }) {
  const { locale } = useI18n();
  return (
    <a className={className} href={gameLink(locale)} target="_blank" rel="noopener">
      {children}
      <ArrowUpRight size={14} />
    </a>
  );
}
