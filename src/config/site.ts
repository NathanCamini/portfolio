/**
 * Personal data used across the page. Edit here — no component needs to change.
 */
export const site = {
  name: 'Nathan Camini',
  /** Public URL, used for canonical/OG tags. Set NEXT_PUBLIC_SITE_URL in production. */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  // TODO: replace the placeholders below with your real contact links.
  email: 'voce@email.com',
  links: {
    github: 'https://github.com/NathanCamini',
    linkedin: '#',
  },
} as const;

/**
 * 3D car settings (Porsche 911, procedurally modelled — see src/components/three/porsche911).
 * Some factory-inspired paints (use finish 'metallic' or 'solid' accordingly):
 *   GT Silver Metallic  #9ea4b0  metallic   (default)
 *   Chalk               #d9d6cf  solid
 *   Guards Red          #b3121b  solid
 *   Gentian Blue        #1f3a8a  metallic
 *   Design-system blurple #9184d9 metallic
 */
export const carConfig: { color: string; finish: 'metallic' | 'solid' } = {
  color: '#9ea4b0',
  finish: 'metallic',
};

/** Mini-game difficulty: CPU top speed. */
export const gameConfig = {
  cpuLevel: 'normal' as 'easy' | 'normal' | 'hard',
  winScore: 7,
};
