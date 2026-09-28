'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useAnimate, useReducedMotion } from 'motion/react';
import { useI18n } from '@/i18n/I18nProvider';

/**
 * Wraps <main>. When the language changes, the whole page does a quick
 * "focus pull": opacity .25 → 1 and blur 3px → 0 in 450 ms (as in the design),
 * masking the text reflow between PT and EN.
 */
export function LocaleTransition({ children }: { children: ReactNode }) {
  const { locale } = useI18n();
  const [scope, animate] = useAnimate<HTMLElement>();
  const reduce = useReducedMotion();
  const previous = useRef(locale);

  useEffect(() => {
    if (previous.current === locale) return;
    previous.current = locale;
    const el = scope.current;
    if (!el || reduce) return;

    const controls = animate(
      el,
      { opacity: [0.25, 1], filter: ['blur(3px)', 'blur(0px)'] },
      { duration: 0.45, ease: 'easeOut' },
    );
    // A lingering `filter` would give <main> a new stacking context and make it
    // the containing block of fixed descendants — clear it once the flash is over.
    controls.then(() => {
      el.style.filter = '';
      el.style.opacity = '';
    });
    return () => controls.stop();
  }, [locale, animate, scope, reduce]);

  return <main ref={scope}>{children}</main>;
}
