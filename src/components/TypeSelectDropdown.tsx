import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FACILITY_CONFIG, QUICK_CHIP_PRIMARY, QUICK_CHIP_MORE, type FacilityCategory } from '../lib/facilityTypes';
import { TypeIcon } from './TypeIcon';
import type { TypeSelection } from './MapFilterBar';

/** All 9 facility categories in display order (primary chips first, then the "More" set). */
const CATEGORY_ORDER: FacilityCategory[] = [...QUICK_CHIP_PRIMARY, ...QUICK_CHIP_MORE];

function typeLabel(sel: TypeSelection): string {
  if (sel === null) return 'All Facilities';
  if (sel === 'PRJ') return 'Projects (PRJ)';
  return `${FACILITY_CONFIG[sel].label} (${FACILITY_CONFIG[sel].acronym})`;
}

/**
 * Compact Facility Type selector used on mobile/tablet in place of the wrapping icon-chip row —
 * a custom icon dropdown (native <select> can't render the per-type `TypeIcon`). Drives the same
 * `typeSelection` state as `MapQuickChips`, so the two are interchangeable per viewport.
 */
export function TypeSelectDropdown({ typeSelection, onTypeSelectionChange }: {
  typeSelection: TypeSelection;
  onTypeSelectionChange: (v: TypeSelection) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const select = (v: TypeSelection) => { onTypeSelectionChange(v); setOpen(false); };

  // Render helper (not a nested component — avoids remounting each option's subtree on re-render).
  const renderOption = (value: TypeSelection, iconType: 'ALL' | 'PRJ' | FacilityCategory, label: ReactNode) => (
    <li role="none" key={String(value)}>
      <button
        role="option"
        aria-selected={typeSelection === value}
        className={`mfp-type-option${typeSelection === value ? ' selected' : ''}`}
        onClick={() => select(value)}
      >
        <TypeIcon type={iconType} size={22} />
        <span>{label}</span>
      </button>
    </li>
  );

  return (
    <div className="mfp-type-select" ref={ref}>
      <button
        type="button"
        className="mfp-type-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <TypeIcon type={typeSelection ?? 'ALL'} size={24} />
        <span className="mfp-type-label">{typeLabel(typeSelection)}</span>
        <svg className={`mfp-type-chevron${open ? ' open' : ''}`} viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <ul className="mfp-type-menu" role="listbox" aria-label="Facility type">
          {renderOption(null, 'ALL', 'All Facilities')}
          {CATEGORY_ORDER.map((cat) => renderOption(cat, cat, <>{FACILITY_CONFIG[cat].label} <em>({FACILITY_CONFIG[cat].acronym})</em></>))}
          <li className="mfp-type-divider" role="none" aria-hidden="true" />
          {renderOption('PRJ', 'PRJ', <>Projects <em>(PRJ)</em></>)}
        </ul>
      )}
    </div>
  );
}
