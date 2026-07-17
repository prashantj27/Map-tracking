import { useEffect, useMemo, useRef, useState } from 'react';
import type { Location, Project } from '../db';
import { FACILITY_CONFIG, FILTER_CHIP_CATEGORIES, classifyFacility, type FacilityCategory } from '../lib/facilityTypes';
import { PROJECT_COLOR, PROJECT_STATUS_FILTERS, type ProjectStatusFilterKey } from '../lib/projects';
import { useDraggable } from '../lib/useDraggable';
import { TypeIcon } from './TypeIcon';
import { DragHandle } from './DragHandle';

export type TypeSelection = FacilityCategory | 'PRJ' | null;

export interface MapFilterBarProps {
  uniqueStates: string[];
  filterState: string;
  onStateChange: (v: string) => void;
  typeSelection: TypeSelection;
  onTypeSelectionChange: (v: TypeSelection) => void;
  projectStatusFilter: ProjectStatusFilterKey | null;
  onProjectStatusFilterChange: (v: ProjectStatusFilterKey | null) => void;
  allLocations: Location[];
  projects: Project[];
  onPickFacility: (loc: Location) => void;
  onPickProject: (p: Project) => void;
}

function typeLabel(sel: TypeSelection): string {
  if (sel === null) return 'All Facilities';
  if (sel === 'PRJ') return 'Projects (PRJ)';
  return `${FACILITY_CONFIG[sel].label} (${FACILITY_CONFIG[sel].acronym})`;
}

/**
 * Floating glassmorphism filter panel (bottom-left) — global search, the Facility Type selector
 * (a custom icon dropdown that doubles as the map legend), a Projects-only status filter row, and
 * the State selector. Replaces the old left sidebar.
 */
export function MapFilterBar({
  uniqueStates, filterState, onStateChange,
  typeSelection, onTypeSelectionChange,
  projectStatusFilter, onProjectStatusFilterChange,
  allLocations, projects, onPickFacility, onPickProject,
}: MapFilterBarProps) {
  const [query, setQuery] = useState('');
  const [typeOpen, setTypeOpen] = useState(false);
  const typeRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const { style: dragStyle, dragging, handleProps: dragHandleProps } = useDraggable('mapFilterPanelPos', panelRef);

  useEffect(() => {
    if (!typeOpen) return;
    const onDocDown = (e: MouseEvent) => {
      if (typeRef.current && !typeRef.current.contains(e.target as Node)) setTypeOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setTypeOpen(false); };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [typeOpen]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return { facilities: [] as Location[], projects: [] as Project[] };
    const facilities = allLocations.filter((l) =>
      l.Facility_Name?.toLowerCase().includes(q) ||
      l.City?.toLowerCase().includes(q) ||
      l.District?.toLowerCase().includes(q)).slice(0, 6);
    const projs = projects.filter((p) =>
      p.Project_Name?.toLowerCase().includes(q) ||
      p.State?.toLowerCase().includes(q) ||
      p.District?.toLowerCase().includes(q)).slice(0, 6);
    return { facilities, projects: projs };
  }, [query, allLocations, projects]);

  const hasResults = results.facilities.length > 0 || results.projects.length > 0;

  const selectType = (v: TypeSelection) => {
    onTypeSelectionChange(v);
    setTypeOpen(false);
  };

  return (
    <section className="map-filter-panel" aria-label="Map filters" ref={panelRef} style={dragStyle}>
      <div className="mfp-search">
        <svg className="mfp-search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2" />
          <line x1="15.3" y1="15.3" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          placeholder="Search facilities, projects, districts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          aria-label="Search facilities, projects, districts"
        />
        <DragHandle
          className={`mfp-drag-handle${dragging ? ' dragging' : ''}`}
          label="Drag to move the filter panel (double-click to reset position)"
          {...dragHandleProps}
        />
        {hasResults && (
          <ul className="search-results mfp-search-results" role="listbox">
            {results.projects.map((p) => (
              <li key={`p-${p.Project_Code}`}>
                <button onClick={() => { onPickProject(p); setQuery(''); }}>
                  <span className="search-dot" style={{ background: PROJECT_COLOR }} aria-hidden="true" />
                  <span className="search-name">{p.Project_Name}</span>
                  <span className="dim small"> {p.State}</span>
                  <span className="search-kind prj">PRJ</span>
                </button>
              </li>
            ))}
            {results.facilities.map((loc) => (
              <li key={`f-${loc.id}`}>
                <button onClick={() => { onPickFacility(loc); setQuery(''); }}>
                  <span className="search-dot" style={{ background: FACILITY_CONFIG[classifyFacility(loc.Facility_Type)].color }} aria-hidden="true" />
                  <span className="search-name">{loc.Facility_Name}</span>
                  <span className="dim small"> {[loc.City, loc.State].filter(Boolean).join(', ')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {query.trim().length >= 2 && !hasResults && (
          <div className="search-empty">No matches for “{query.trim()}”</div>
        )}
      </div>

      <div className="mfp-state-row">
        <label htmlFor="mfp-state" className="mfp-state-label">State</label>
        <select id="mfp-state" value={filterState} onChange={(e) => onStateChange(e.target.value)}>
          <option value="">All States</option>
          {uniqueStates.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="type-select" ref={typeRef}>
        <button
          type="button"
          className="type-select-trigger"
          onClick={() => setTypeOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={typeOpen}
        >
          <TypeIcon type={typeSelection ?? 'ALL'} size={26} />
          <span className="type-select-label">{typeLabel(typeSelection)}</span>
          <svg className={`type-select-chevron${typeOpen ? ' open' : ''}`} viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {typeOpen && (
          <ul className="type-select-menu" role="listbox" aria-label="Facility type">
            <li role="none">
              <button role="option" aria-selected={typeSelection === null} className={`type-option${typeSelection === null ? ' selected' : ''}`} onClick={() => selectType(null)}>
                <TypeIcon type="ALL" />
                <span>All Facilities</span>
              </button>
            </li>
            {FILTER_CHIP_CATEGORIES.map((cat) => (
              <li key={cat} role="none">
                <button role="option" aria-selected={typeSelection === cat} className={`type-option${typeSelection === cat ? ' selected' : ''}`} onClick={() => selectType(cat)}>
                  <TypeIcon type={cat} />
                  <span>{FACILITY_CONFIG[cat].label} <em>({FACILITY_CONFIG[cat].acronym})</em></span>
                </button>
              </li>
            ))}
            <li className="type-option-divider" role="none" aria-hidden="true" />
            <li role="none">
              <button role="option" aria-selected={typeSelection === 'PRJ'} className={`type-option${typeSelection === 'PRJ' ? ' selected' : ''}`} onClick={() => selectType('PRJ')}>
                <TypeIcon type="PRJ" />
                <span>Projects <em>(PRJ)</em></span>
              </button>
            </li>
          </ul>
        )}
      </div>

      {typeSelection === 'PRJ' && (
        <div className="project-status-bar" role="group" aria-label="Project status filters">
          {PROJECT_STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`status-chip${projectStatusFilter === f.key ? ' active' : ''}`}
              aria-pressed={projectStatusFilter === f.key}
              onClick={() => onProjectStatusFilterChange(projectStatusFilter === f.key ? null : f.key)}
              style={projectStatusFilter === f.key ? { background: f.color, borderColor: f.color } : undefined}
            >
              <span aria-hidden="true">{f.icon}</span> {f.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
