import type { SVGProps } from 'react';

/** Stroke icons from the design (256-unit grid, Phosphor-style). Decorative by default. */
function Icon({ children, size = 16, ...rest }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      viewBox="0 0 256 256"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={16}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

type P = SVGProps<SVGSVGElement> & { size?: number };

export const ArrowRight = (p: P) => (
  <Icon {...p}>
    <line x1="40" y1="128" x2="216" y2="128" />
    <polyline points="144 56 216 128 144 200" />
  </Icon>
);

export const ArrowDown = (p: P) => (
  <Icon {...p}>
    <line x1="128" y1="40" x2="128" y2="216" />
    <polyline points="56 144 128 216 200 144" />
  </Icon>
);

export const ArrowUpRight = (p: P) => (
  <Icon {...p}>
    <line x1="64" y1="192" x2="192" y2="64" />
    <polyline points="88 64 192 64 192 168" />
  </Icon>
);

export const CornersOut = (p: P) => (
  <Icon {...p}>
    <polyline points="168 48 208 48 208 88" />
    <polyline points="88 208 48 208 48 168" />
    <polyline points="208 168 208 208 168 208" />
    <polyline points="48 88 48 48 88 48" />
  </Icon>
);

export const CornersIn = (p: P) => (
  <Icon {...p}>
    <polyline points="208 88 168 88 168 48" />
    <polyline points="48 168 88 168 88 208" />
    <polyline points="168 208 168 168 208 168" />
    <polyline points="88 48 88 88 48 88" />
  </Icon>
);

export const Trophy = (p: P) => (
  <Icon {...p}>
    <line x1="96" y1="224" x2="160" y2="224" />
    <line x1="128" y1="184" x2="128" y2="224" />
    <path d="M58,128H48A32,32,0,0,1,16,96V80a8,8,0,0,1,8-8H56" />
    <path d="M198,128h10a32,32,0,0,0,32-32V80a8,8,0,0,0-8-8H200" />
    <path d="M56,48H200v63.1c0,39.7-31.75,72.6-71.45,72.9A72,72,0,0,1,56,112Z" />
  </Icon>
);

export const Close = (p: P) => (
  <Icon {...p}>
    <line x1="200" y1="56" x2="56" y2="200" />
    <line x1="200" y1="200" x2="56" y2="56" />
  </Icon>
);
