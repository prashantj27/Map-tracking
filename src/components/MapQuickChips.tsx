import { useRef, useState } from 'react';
import { FACILITY_CONFIG, QUICK_CHIP_PRIMARY, QUICK_CHIP_MORE, type FacilityCategory } from '../lib/facilityTypes';
import { useDraggable } from '../lib/useDraggable';
import { TypeIcon, type TypeIconKey } from './TypeIcon';
import { DragHandle } from './DragHandle';
import type { TypeSelection } from './MapFilterBar';

export interface MapQuickChipsProps {
  typeSelection: TypeSelection;
  onTypeSelectionChange: (v: TypeSelection) => void;
}

/**
 * Bottom floating quick-filter chips (Google-Maps style) — one tap to switch the active type.
 * Drives the exact same `typeSelection` state as the Facility Type selector in MapFilterBar, so
 * the two stay in sync regardless of which control the user touches.
 */
export function MapQuickChips({ typeSelection, onTypeSelectionChange }: MapQuickChipsProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { style: dragStyle, dragging, handleProps: dragHandleProps } = useDraggable('mapQuickChipsPos', rootRef);

  const renderChip = (key: TypeSelection, label: string, iconType: TypeIconKey) => {
    const active = typeSelection === key;
    return (
      <button
        key={String(key)}
        type="button"
        className={`quick-chip${active ? ' active' : ''}`}
        aria-pressed={active}
        onClick={() => onTypeSelectionChange(active ? null : key)}
      >
        <TypeIcon type={iconType} size={18} />
        <span className="quick-chip-label">{label}</span>
      </button>
    );
  };

  return (
    <div className="map-quick-chips" role="group" aria-label="Quick filters" ref={rootRef} style={dragStyle}>
      <DragHandle
        className={`chips-drag-handle${dragging ? ' dragging' : ''}`}
        label="Drag to move the quick filters (double-click to reset position)"
        {...dragHandleProps}
      />
      {renderChip(null, 'All', 'ALL')}
      {QUICK_CHIP_PRIMARY.map((cat: FacilityCategory) => renderChip(cat, FACILITY_CONFIG[cat].acronym, cat))}
      {renderChip('PRJ', 'Projects', 'PRJ')}
      {moreOpen && QUICK_CHIP_MORE.map((cat: FacilityCategory) => renderChip(cat, FACILITY_CONFIG[cat].acronym, cat))}
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
