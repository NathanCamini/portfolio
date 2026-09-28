'use client';

import type { ReactNode } from 'react';
import { MotionConfig } from 'motion/react';
import type { Locale } from '@/i18n/config';
import { I18nProvider } from '@/i18n/I18nProvider';

/** Client-side providers mounted once by the root layout. */
export function Providers({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    // reducedMotion="user": every Motion animation respects the OS "reduce motion" setting.
    <MotionConfig reducedMotion="user">
      <I18nProvider initialLocale={locale}>{children}</I18nProvider>
    </MotionConfig>
  );
}
