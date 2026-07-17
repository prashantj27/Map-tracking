import type { ReactNode } from 'react';
import type { FacilityCategory } from '../lib/facilityTypes';

/**
 * Premium map-pin icon set. Every marker (facilities + projects) uses ONE consistent teardrop
 * frame — a colour-filled head with a white ring and a white glyph — so the whole map reads as a
 * single design language; only the colour + glyph distinguish the type. Glyphs are white line/solid
 * icons in a 24×24 space, centred in the pin head.
 */
type GlyphKey = FacilityCategory | 'PRJ';

const GLYPHS: Partial<Record<GlyphKey, ReactNode>> = {
  // Building with windows
  RC: <path d="M17 11V3H7v4H3v14h8v-4h2v4h8V11h-4zM7 19H5v-2h2v2zm0-4H5v-2h2v2zm0-4H5V9h2v2zm4 4H9v-2h2v2zm0-4H9V9h2v2zm0-4H9V5h2v2zm4 8h-2v-2h2v2zm0-4h-2V9h2v2zm0-4h-2V5h2v2zm4 12h-2v-2h2v2zm0-4h-2v-2h2v2z" />,
  // Trophy
  NCOE: <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z" />,
  // Running athlete
  STC: <path d="M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z" />,
  // Classical building / columns
  EXT: <path d="M6.5 10h-2v7h2v-7zm6 0h-2v7h2v-7zM2 22h19v-2H2v2zm16.5-12h-2v7h2v-7zM12 3.26L17.28 6H6.72L12 3.26M12 1L2 6v2h20V6L12 1z" />,
  // Person with raised arms (grassroots participation)
  KIC: (
    <>
      <circle cx="12" cy="4.4" r="2.4" />
      <path d="M12 7.6c-.95 0-1.78.53-2.2 1.32L7 7.05a1.15 1.15 0 0 0-1.3 1.9l3.95 2.9V22h2.15v-6.4h.4V22h2.15V11.85l3.95-2.9a1.15 1.15 0 0 0-1.3-1.9L14.2 8.92A2.5 2.5 0 0 0 12 7.6z" />
    </>
  ),
  // Institution with a star (state centre of excellence)
  KISCE: (
    <>
      <path d="M12 1l1.24 2.5 2.76.4-2 1.95.47 2.75L12 7.3 9.53 8.6 10 5.85l-2-1.95 2.76-.4z" />
      <path d="M4.5 22v-8L12 10.4l7.5 3.6v8h-4.35v-5.1H8.85V22z" />
    </>
  ),
  // Handshake (adopted / partnership)
  AKHARA: (
    <g>
      <path d="M2.2 9.3l4.9 2.4-1.7 3.5-4.9-2.4z" />
      <path d="M21.8 9.3l-4.9 2.4 1.7 3.5 4.9-2.4z" />
      <rect x="7.4" y="11.2" width="9.2" height="4.6" rx="2.3" />
      <path d="M9.8 15.4h4.4l-1.4 2.2c-.4.6-1.2.6-1.6 0z" />
    </g>
  ),
  // Construction crane + blocks (projects)
  PRJ: (
    <g>
      <path d="M3.6 20h8.6v1.7H3.6z" />
      <path d="M6.6 4h1.7v16H6.6z" />
      <path d="M6.6 4h11.2v1.7H6.6z" />
      <path d="M16.1 5.4h1.5v3.1h-1.5z" />
      <path d="M15.2 8.2h3.3v1.5h-3.3z" />
      <path d="M13.6 12.5h5.4V20h-5.4z" />
      <path d="M15.4 10.2h3.6v2h-3.6z" />
    </g>
  ),
};

// Generic marker glyph for categories without a dedicated icon (NSTC / IGMA / OTHER).
const DEFAULT_GLYPH = <circle cx="12" cy="12" r="4.6" />;

export function pinGlyph(key: GlyphKey): ReactNode {
  return GLYPHS[key] ?? DEFAULT_GLYPH;
}

/**
 * The shared teardrop pin frame (colour-filled head + white ring) with a centred white glyph.
 * Rendered ~30% smaller than the original 34×46 (now 24×32) — the viewBox is unchanged, so the
 * glyph stays correctly proportioned and centred at any render size.
 */
export function MapPinGraphic({ color, glyph }: { color: string; glyph: ReactNode }) {
  return (
    <svg className="mp-pin-svg" width="24" height="32" viewBox="0 0 40 54" aria-hidden="true">
      <path
        d="M20 1.6C10.06 1.6 2 9.66 2 19.6c0 12.4 18 32.4 18 32.4s18-20 18-32.4C38 9.66 29.94 1.6 20 1.6Z"
        fill={color}
      />
      <circle cx="20" cy="19.6" r="12.4" fill="none" stroke="#fff" strokeWidth="1.7" opacity="0.92" />
      <g fill="#fff" transform="translate(11,10.6) scale(0.75)">{glyph}</g>
    </svg>
  );
}
