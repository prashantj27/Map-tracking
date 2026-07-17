import { useState } from 'react';
import { FACILITY_CONFIG, QUICK_CHIP_PRIMARY, QUICK_CHIP_MORE, type FacilityCategory } from '../lib/facilityTypes';
import { TypeIcon, type TypeIconKey } from './TypeIcon';
import type { TypeSelection } from './MapFilterBar';

export interface MapQuickChipsProps {
  typeSelection: TypeSelection;
  onTypeSelectionChange: (v: TypeSelection) => void;
}

/**
 * One-tap facility-type chips (Google-Maps style) — the sole Facility Type control, nested inside
 * MapFilterBar's panel. Each chip's `title` carries the full type name (e.g. "National Centre of
 * Excellence") as a hover tooltip, since the chips themselves only show the short acronym.
 */
export function MapQuickChips({ typeSelection, onTypeSelectionChange }: MapQuickChipsProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  const renderChip = (key: TypeSelection, label: string, iconType: TypeIconKey, title: string) => {
    const active = typeSelection === key;
    return (
      <button
        key={String(key)}
        type="button"
        className={`quick-chip${active ? ' active' : ''}`}
        aria-pressed={active}
        title={title}
        onClick={() => onTypeSelectionChange(active ? null : key)}
      >
        <TypeIcon type={iconType} size={18} />
        <span className="quick-chip-label">{label}</span>
      </button>
    );
  };

  return (
    <div className="mfp-chip-row" role="group" aria-label="Filter by facility type">
      {renderChip(null, 'All', 'ALL', 'All Facilities')}
      {QUICK_CHIP_PRIMARY.map((cat: FacilityCategory) => renderChip(cat, FACILITY_CONFIG[cat].acronym, cat, FACILITY_CONFIG[cat].label))}
      {renderChip('PRJ', 'Projects', 'PRJ', 'Projects')}
      {moreOpen && QUICK_CHIP_MORE.map((cat: FacilityCategory) => renderChip(cat, FACILITY_CONFIG[cat].acronym, cat, FACILITY_CONFIG[cat].label))}
      <button
        type="button"
        className={`quick-chip more-chip${moreOpen ? ' open' : ''}`}
        aria-expanded={moreOpen}
        onClick={() => setMoreOpen((o) => !o)}
      >
        <span className="more-chip-label">{moreOpen ? 'Less' : 'More Filters'}</span>
        <svg className="more-chevron" viewBox="0 0 24 24" width="12" height="12" fill="none" aria-hidden="true">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
