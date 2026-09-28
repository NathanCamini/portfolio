'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Magnetic } from '@/components/fun/Magnetic';
import { ArrowUpRight, Check, Copy, Download } from '@/components/ui/icons';
import { useI18n } from '@/i18n/I18nProvider';
import { celebrate, originOf } from '@/lib/confetti';
import { resumePdfFile, resumePdfPath } from '@/lib/resume';
import styles from './ResumeBar.module.css';

const noop = () => () => {};

/**
 * Résumé call-to-action above the experience timeline: a highlighted PDF
 * download plus the same data as JSON (`GET /api/nathan`, served by the Worker).
 */
export function ResumeBar() {
  const { t, locale } = useI18n();
  // The deployed origin is only known in the browser; the static HTML shows a relative path.
  const origin = useSyncExternalStore(
    noop,
    () => window.location.origin,
    () => '',
  );
  const apiPath = `/api/nathan?lang=${locale}`;
  const command = `curl ${origin}${apiPath}`;

  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked (permissions / insecure context): the command stays selectable.
    }
  };

  return (
    <div className={styles.bar}>
      <div className={styles.text}>
        <h3 className={styles.title}>{t.cv.title}</h3>
        <p className={styles.blurb}>{t.cv.blurb}</p>
      </div>

      <Magnetic strength={0.2}>
        <a
          className={styles.download}
          href={resumePdfPath(locale)}
          download={resumePdfFile(locale)}
          onClick={(e) => celebrate(originOf(e.currentTarget), 0.6)}
        >
          <Download size={18} />
          {t.cv.download}
        </a>
      </Magnetic>

      <div className={styles.api}>
        <span className={styles.apiHint}>{t.cv.apiHint}</span>
        <div className={styles.cmd}>
          <code className={styles.code}>
            <span className={styles.prompt} aria-hidden="true">
              $
            </span>{' '}
            {command}
          </code>
          <button
            type="button"
            className={styles.copy}
            onClick={copy}
            aria-label={copied ? t.cv.copied : t.cv.copy}
            title={copied ? t.cv.copied : t.cv.copy}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
        </div>
        <a className={styles.open} href={apiPath} target="_blank" rel="noopener">
          {t.cv.openJson}
          <ArrowUpRight size={12} />
        </a>
        <span className={styles.sr} aria-live="polite">
          {copied ? t.cv.copied : ''}
        </span>
      </div>
    </div>
  );
}
