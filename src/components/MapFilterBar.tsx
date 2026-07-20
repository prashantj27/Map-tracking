import { useMemo, useRef, useState } from 'react';
import type { Location, Project } from '../db';
import { FACILITY_CONFIG, classifyFacility, type FacilityCategory } from '../lib/facilityTypes';
import { PROJECT_COLOR, PROJECT_STATUS_FILTERS, type ProjectStatusFilterKey } from '../lib/projects';
import { useDraggable } from '../lib/useDraggable';
import { MapQuickChips } from './MapQuickChips';
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
  satellite: boolean;
  onSatelliteChange: (v: boolean) => void;
  /** Show the "zoom to full map" button (only once the map is zoomed in past the overview). */
  showZoomToMap: boolean;
  onResetView: () => void;
}

/**
 * Floating glassmorphism filter panel (bottom-left) — a single draggable widget combining global
 * search (with the satellite-view toggle in the search box), the State selector, the Facility Type
 * quick chips, and a Projects-only status filter row.
 */
export function MapFilterBar({
  uniqueStates, filterState, onStateChange,
  typeSelection, onTypeSelectionChange,
  projectStatusFilter, onProjectStatusFilterChange,
  allLocations, projects, onPickFacility, onPickProject,
  satellite, onSatelliteChange,
  showZoomToMap, onResetView,
}: MapFilterBarProps) {
  const [query, setQuery] = useState('');
  const panelRef = useRef<HTMLElement>(null);
  const { style: dragStyle, dragging, handleProps: dragHandleProps } = useDraggable('mapFilterPanelPos', panelRef);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return { facilities: [] as Location[], projects: [] as Project[] };
    const facilities = allLocations.filter((l) =>
      l.Facility_Name?.toLowerCase().includes(q) ||
      l.City?.toLowerCase().includes(q) ||
      l.District?.toLowerCase().includes(q)).slice(0, 6);
    const projs = projects.filter((p) =>
      p.Project_Name?.toLowerCase().includes(q) ||
      p.Project_Code?.toLowerCase().includes(q) ||
      p.State?.toLowerCase().includes(q) ||
      p.District?.toLowerCase().includes(q)).slice(0, 6);
    return { facilities, projects: projs };
  }, [query, allLocations, projects]);

  const hasResults = results.facilities.length > 0 || results.projects.length > 0;

  return (
    <section className="map-filter-panel" aria-label="Map filters" ref={panelRef} style={dragStyle}>
      <div className="mfp-search">
        <div className="mfp-search-field">
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
          <button
            type="button"
            className={`mfp-satellite-btn${satellite ? ' active' : ''}`}
            aria-pressed={satellite}
            /* Constant accessible name — aria-pressed conveys the state. A name that flips to the
               reverse action alongside aria-pressed reads as contradictory in screen readers. */
            title="Satellite view (Esri World Imagery)"
            aria-label="Satellite view"
            onClick={() => onSatelliteChange(!satellite)}
          >
            {/* Orbiting satellite: body + two solar-panel wings + dish antenna + signal. */}
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M13 7 9 3 5 7l4 4" />
              <path d="m17 11 4 4-4 4-4-4" />
              <path d="m8 12 4 4 6-6-4-4Z" />
              <path d="m16 8 3-3" />
              <path d="M9 21a6 6 0 0 0-6-6" />
            </svg>
          </button>
          <DragHandle
            className={`mfp-drag-handle${dragging ? ' dragging' : ''}`}
            label="Drag to move the filter panel (double-click to reset position)"
            {...dragHandleProps}
          />
        </div>
        {showZoomToMap && (
          <button
            type="button"
            className="mfp-zoom-btn"
            title="Zoom out to the full map"
            aria-label="Zoom out to the full map"
            onClick={onResetView}
          >
            {/* Fit-to-extent frame corners — the map-UI convention for "zoom to full extent". */}
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 3H5a2 2 0 0 0-2 2v3" />
              <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
              <path d="M3 16v3a2 2 0 0 0 2 2h3" />
              <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
            </svg>
          </button>
        )}
        {hasResults && (
          <ul className="search-results mfp-search-results" role="listbox">
            {results.projects.map((p) => (
              <li key={`p-${p.Project_Code}`}>
                <button onClick={() => { onPickProject(p); setQuery(''); }}>
                  <span className="search-dot" style={{ background: PROJECT_COLOR }} aria-hidden="true" />
                  <span className="search-name">{p.Project_Name}</span>
                  <span className="dim small"> {[p.Project_Code, p.State].filter(Boolean).join(' · ')}</span>
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

      <MapQuickChips typeSelection={typeSelection} onTypeSelectionChange={onTypeSelectionChange} />

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
