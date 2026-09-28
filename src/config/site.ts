/**
 * Personal data used across the page. Edit here — no component needs to change.
 */
export const site = {
  name: 'Nathan Camini',
  /** Public URL, used for canonical/OG tags. Set NEXT_PUBLIC_SITE_URL in production. */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  email: 'camininathan@gmail.com',
  links: {
    github: 'https://github.com/NathanCamini',
    linkedin: 'https://www.linkedin.com/in/nathancamini/',
  },
} as const;

/**
 * 3D car settings (Porsche 911 GT3 RS, procedurally modelled — see src/components/three/porsche911).
 * Some factory-inspired paints (use finish 'metallic' or 'solid' accordingly):
 *   Shark Blue          #0d57b0  solid      (default)
 *   Python Green        #2e9a47  solid
 *   White               #e8e9eb  solid
 *   Guards Red          #b3121b  solid
 *   GT Silver Metallic  #9ea4b0  metallic
 */
export const carConfig: { color: string; finish: 'metallic' | 'solid' } = {
  color: '#0d57b0',
  finish: 'solid',
};

/** Mini-game difficulty: CPU top speed. */
export const gameConfig = {
  cpuLevel: 'normal' as 'easy' | 'normal' | 'hard',
  winScore: 7,
};
