import { Color, DoubleSide, MeshPhysicalMaterial, MeshStandardMaterial, type Material } from 'three';

/**
 * PBR material set for the 911. Paint and glass are clear-coated physical
 * materials: they only look right with an environment map, which CarCanvas
 * provides (RoomEnvironment → PMREM, generated locally, no HDR download).
 */
export type PaintFinish = 'metallic' | 'solid';

/** Metallic flake paint reflects like metal; solid (e.g. Guards Red) is a dielectric under clear coat. */
const FINISH: Record<PaintFinish, { metalness: number; roughness: number }> = {
  metallic: { metalness: 0.85, roughness: 0.22 },
  solid: { metalness: 0.05, roughness: 0.35 },
};

export function applyPaint(material: MeshPhysicalMaterial, color: string, finish: PaintFinish) {
  material.color.set(color);
  Object.assign(material, FINISH[finish]);
}

export function createMaterials(paintColor: string, finish: PaintFinish = 'metallic') {
  const paint = new MeshPhysicalMaterial({
    name: 'paint',
    color: new Color(paintColor),
    ...FINISH[finish],
    clearcoat: 1,
    clearcoatRoughness: 0.06,
  });

  const glass = new MeshPhysicalMaterial({
    name: 'glass',
    color: '#07080d',
    metalness: 0,
    roughness: 0.04,
    envMapIntensity: 0.6,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
  });

  const trim = new MeshStandardMaterial({ name: 'trim', color: '#0d0e13', roughness: 0.55, metalness: 0.2 });
  const underbody = new MeshStandardMaterial({ name: 'underbody', color: '#050609', roughness: 0.95 });
  const rubber = new MeshStandardMaterial({ name: 'rubber', color: '#121317', roughness: 0.88 });
  const alloy = new MeshStandardMaterial({ name: 'alloy', color: '#8d929c', metalness: 0.9, roughness: 0.28 });
  const alloyDark = new MeshStandardMaterial({
    name: 'alloy_dark',
    color: '#2a2d34',
    metalness: 0.7,
    roughness: 0.45,
    side: DoubleSide,
  });
  const chrome = new MeshStandardMaterial({ name: 'chrome', color: '#d8dce4', metalness: 1, roughness: 0.14 });
  const brakeDisc = new MeshStandardMaterial({ name: 'brake_disc', color: '#6b6f78', metalness: 0.8, roughness: 0.45 });
  const caliper = new MeshStandardMaterial({ name: 'caliper', color: '#c8102e', metalness: 0.2, roughness: 0.4 });
  const housing = new MeshStandardMaterial({ name: 'lamp_housing', color: '#15171d', metalness: 0.8, roughness: 0.25 });
  const lens = new MeshPhysicalMaterial({
    name: 'lamp_lens',
    color: '#10131b',
    metalness: 0.1,
    roughness: 0.05,
    clearcoat: 1,
  });
  // Emissive values > 1 read as "lit" after ACES tone mapping.
  const drl = new MeshStandardMaterial({ name: 'drl', color: '#ffffff', emissive: '#f4f7ff', emissiveIntensity: 3 });
  const taillight = new MeshStandardMaterial({
    name: 'taillight',
    color: '#3a0006',
    emissive: '#ff1f35',
    emissiveIntensity: 2.6,
  });

  const all: Material[] = [
    paint,
    glass,
    trim,
    underbody,
    rubber,
    alloy,
    alloyDark,
    chrome,
    brakeDisc,
    caliper,
    housing,
    lens,
    drl,
    taillight,
  ];

  return {
    paint,
    glass,
    trim,
    underbody,
    rubber,
    alloy,
    alloyDark,
    chrome,
    brakeDisc,
    caliper,
    housing,
    lens,
    drl,
    taillight,
    dispose: () => all.forEach((m) => m.dispose()),
  };
}

export type CarMaterials = ReturnType<typeof createMaterials>;
