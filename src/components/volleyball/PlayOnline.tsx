'use client';

import type { ReactNode } from 'react';
import { ArrowUpRight } from '@/components/ui/icons';
import { useI18n } from '@/i18n/I18nProvider';
import { gameLink, gameLinkWithHandoff } from '@/lib/game-link';

/**
 * A link to the full game (online 1×1, Endless, rankings), in a new tab. The
 * rendered href is the plain one; on click it gains the player's online
 * identity (lib/game-link.ts), which only the browser can read.
 */
export function PlayOnline({ className, children }: { className?: string; children: ReactNode }) {
  const { locale } = useI18n();
  return (
    <a
      className={className}
      href={gameLink(locale)}
      target="_blank"
      rel="noopener"
      onClick={(e) => {
        e.currentTarget.href = gameLinkWithHandoff(locale);
      }}
    >
      {children}
      <ArrowUpRight size={14} />
    </a>
  );
}
