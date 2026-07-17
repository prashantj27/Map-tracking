import { FACILITY_CONFIG, type FacilityCategory } from '../lib/facilityTypes';
import { PROJECT_COLOR } from '../lib/projects';
import { pinGlyph } from './MapPinGraphic';

export type TypeIconKey = FacilityCategory | 'ALL' | 'PRJ';

/** Generic "everything" glyph (2×2 grid) for the "All Facilities" option. */
const ALL_GLYPH = (
  <g>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </g>
);

function iconColor(type: TypeIconKey): string {
  if (type === 'ALL') return '#5f6368';
  if (type === 'PRJ') return PROJECT_COLOR;
  return FACILITY_CONFIG[type].color;
}

/**
 * Small circular badge icon for a facility type / "All Facilities" / Projects. Reuses the exact
 * glyph paths rendered on the map pins (`pinGlyph`, from MapPinGraphic) so every place this icon
 * appears — the Facility Type selector, the quick-filter chips — visually matches the markers on
 * the map, doubling as the legend (no separate legend needed).
 *
 * KIC is a deliberate exception: on the map a KIC pin shows the facility's own sport icon (or the
 * "KIC" acronym as fallback) rather than a single category glyph, so this badge shows the acronym
 * to stay truthful to what the map actually renders for that type.
 */
export function TypeIcon({ type, size = 22 }: { type: TypeIconKey; size?: number }) {
  const color = iconColor(type);
  const glyph = type === 'ALL'
    ? ALL_GLYPH
    : type === 'KIC'
      ? <text x="12" y="16.5" textAnchor="middle" fontSize="9.5" fontWeight="800">KIC</text>
      : pinGlyph(type === 'PRJ' ? 'PRJ' : type);

  return (
    <span className="type-icon" style={{ width: size, height: size, background: color }} aria-hidden="true">
      <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62} fill="#fff">{glyph}</svg>
    </span>
  );
}
