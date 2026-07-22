import { useMemo, useRef, useState } from 'react';
import type { Location, Project } from '../db';
import { FACILITY_CONFIG, classifyFacility, type FacilityCategory } from '../lib/facilityTypes';
import { PROJECT_COLOR, PROJECT_STATUS_FILTERS, WITHOUT_GPS_FILTER, type ProjectStatusFilterKey } from '../lib/projects';
import { useDraggable } from '../lib/useDraggable';
import { useIsMobileOrTablet } from '../lib/useMediaQuery';
import { MapQuickChips } from './MapQuickChips';
import { TypeSelectDropdown } from './TypeSelectDropdown';
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
  /** Independent "Without GPS Images" toggle — combines (ANDs) with the status filter. */
  withoutGpsOnly: boolean;
  onWithoutGpsOnlyChange: (v: boolean) => void;
  /** Count of facilities matching the active facility filters (null = no facility filter active). */
  facilityFilterCount: number | null;
  onExportFacilities: () => void;
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

const SearchGlyph = ({ className, size = 16 }: { className?: string; size?: number }) => (
  <svg className={className} viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden="true">
    <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2" />
    <line x1="15.3" y1="15.3" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const FitGlyph = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 3H5a2 2 0 0 0-2 2v3" />
    <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
    <path d="M3 16v3a2 2 0 0 0 2 2h3" />
    <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
  </svg>
);

/**
 * Floating glassmorphism filter panel (bottom-left on desktop, top on mobile) — a single draggable
 * widget combining global search (with the satellite-view toggle in the search box), the State
 * selector, the Facility Type control (quick chips on desktop, an icon dropdown on mobile/tablet),
 * and a Projects-only status filter row. On mobile/tablet the whole panel collapses to two circular
 * buttons (expand + zoom-out) after a search, and can be re-expanded by tapping.
 */
export function MapFilterBar({
  uniqueStates, filterState, onStateChange,
  typeSelection, onTypeSelectionChange,
  projectStatusFilter, onProjectStatusFilterChange,
  withoutGpsOnly, onWithoutGpsOnlyChange,
  facilityFilterCount, onExportFacilities,
  allLocations, projects, onPickFacility, onPickProject,
  satellite, onSatelliteChange,
  showZoomToMap, onResetView,
}: MapFilterBarProps) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const isMobile = useIsMobileOrTablet();
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

  // Picking a search result auto-minimizes the panel on mobile so the map is immediately visible.
  const pickFacility = (loc: Location) => { onPickFacility(loc); setQuery(''); if (isMobile) setCollapsed(true); };
  const pickProject = (p: Project) => { onPickProject(p); setQuery(''); if (isMobile) setCollapsed(true); };

  // Collapsed mobile/tablet view: two circular buttons — reopen the panel, and (when zoomed in) reset the view.
  if (isMobile && collapsed) {
    return (
      <div className="mfp-collapsed" role="region" aria-label="Map filters (minimized)">
        <button type="button" className="mfp-fab mfp-fab-primary" onClick={() => setCollapsed(false)} aria-label="Open search and filters">
          <SearchGlyph size={20} />
        </button>
        {showZoomToMap && (
          <button type="button" className="mfp-fab" onClick={onResetView} aria-label="Zoom out to the full map" title="Zoom out to the full map">
            <FitGlyph />
          </button>
        )}
      </div>
    );
  }

  return (
    <section className={`map-filter-panel${isMobile ? ' mobile' : ''}`} aria-label="Map filters" ref={panelRef} style={isMobile ? undefined : dragStyle}>
      <div className="mfp-search">
        <div className="mfp-search-field">
          <SearchGlyph className="mfp-search-icon" />
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
          {/* Desktop drag grip; on mobile the panel is minimized via the glowing arrow at its
              bottom edge instead (below), so the search box stays uncluttered. */}
          {!isMobile && (
            <DragHandle
              className={`mfp-drag-handle${dragging ? ' dragging' : ''}`}
              label="Drag to move the filter panel (double-click to reset position)"
              {...dragHandleProps}
            />
          )}
        </div>
        {showZoomToMap && (
          <button
            type="button"
            className="mfp-zoom-btn"
            title="Zoom out to the full map"
            aria-label="Zoom out to the full map"
            onClick={onResetView}
          >
            <FitGlyph />
          </button>
        )}
        {hasResults && (
          <ul className="search-results mfp-search-results" role="listbox">
            {results.projects.map((p) => (
              <li key={`p-${p.Project_Code}`}>
                <button onClick={() => pickProject(p)}>
                  <span className="search-dot" style={{ background: PROJECT_COLOR }} aria-hidden="true" />
                  <span className="search-name">{p.Project_Name}</span>
                  <span className="dim small"> {[p.Project_Code, p.State].filter(Boolean).join(' · ')}</span>
                  <span className="search-kind prj">PRJ</span>
                </button>
              </li>
            ))}
            {results.facilities.map((loc) => (
              <li key={`f-${loc.id}`}>
                <button onClick={() => pickFacility(loc)}>
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

      {/* Facility filter results: count + one-tap Excel export (shown only when a facility filter is active). */}
      {facilityFilterCount != null && (
        <div className="mfp-results-strip">
          <span className="mfp-results-count">
            <strong>{facilityFilterCount.toLocaleString()}</strong> {facilityFilterCount === 1 ? 'facility' : 'facilities'}
          </span>
          <button
            type="button"
            className="mfp-export-btn"
            onClick={onExportFacilities}
            disabled={facilityFilterCount === 0}
            title="Download the filtered facilities as an Excel file"
            aria-label={`Download ${facilityFilterCount} facilities as an Excel file`}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3v12" /><path d="m7 12 5 5 5-5" /><path d="M5 20h14" />
            </svg>
            Excel
          </button>
        </div>
      )}

      <div className="mfp-state-row">
        <label htmlFor="mfp-state" className="mfp-state-label">State</label>
        <select id="mfp-state" value={filterState} onChange={(e) => onStateChange(e.target.value)}>
          <option value="">All States</option>
          {uniqueStates.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {isMobile
        ? <TypeSelectDropdown typeSelection={typeSelection} onTypeSelectionChange={onTypeSelectionChange} />
        : <MapQuickChips typeSelection={typeSelection} onTypeSelectionChange={onTypeSelectionChange} />}

      {typeSelection === 'PRJ' && (
        <div className="project-status-bar" role="group" aria-label="Project filters">
          {/* Status — single-select (click again to clear). */}
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
          {/* Independent toggle — combines with the status above (e.g. Completed + Without GPS Images). */}
          <span className="status-bar-break" aria-hidden="true" />
          <button
            type="button"
            className={`status-chip status-chip-gps${withoutGpsOnly ? ' active' : ''}`}
            aria-pressed={withoutGpsOnly}
            onClick={() => onWithoutGpsOnlyChange(!withoutGpsOnly)}
            style={withoutGpsOnly ? { background: WITHOUT_GPS_FILTER.color, borderColor: WITHOUT_GPS_FILTER.color } : undefined}
          >
            <span aria-hidden="true">{WITHOUT_GPS_FILTER.icon}</span> {WITHOUT_GPS_FILTER.label}
          </button>
        </div>
      )}

      {/* Mobile: an eye-catching glowing pull-tab at the panel's bottom edge to minimize it. */}
      {isMobile && (
        <button
          type="button"
          className="mfp-minimize-arrow"
          onClick={() => setCollapsed(true)}
          aria-label="Minimize the filter panel"
          title="Minimize"
        >
          <span className="mfp-minimize-glow" aria-hidden="true" />
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 15l6-6 6 6" />
          </svg>
        </button>
      )}
    </section>
  );
}
