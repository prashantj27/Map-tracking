import { useMemo, useState } from 'react';
import type { Location, Project } from '../db';
import { FACILITY_CONFIG, FILTER_CHIP_CATEGORIES, classifyFacility, type FacilityCategory } from '../lib/facilityTypes';
import { PROJECT_COLOR } from '../lib/projects';

export interface MapFilterBarProps {
  uniqueStates: string[];
  filterState: string;
  onStateChange: (v: string) => void;
  activeFacilityType: FacilityCategory | null;
  onFacilityTypeChange: (v: FacilityCategory | null) => void;
  showProjects: boolean;
  onToggleProjects: (v: boolean) => void;
  allLocations: Location[];
  projects: Project[];
  onPickFacility: (loc: Location) => void;
  onPickProject: (p: Project) => void;
}

/**
 * Floating map filter bar (bottom-left) — replaces the old left sidebar. Holds the Facility Type
 * and State selectors, the independent PRJ layer toggle, and an intelligent search over both
 * facilities and projects. Facilities and Projects filter independently.
 */
export function MapFilterBar({
  uniqueStates, filterState, onStateChange,
  activeFacilityType, onFacilityTypeChange,
  showProjects, onToggleProjects,
  allLocations, projects, onPickFacility, onPickProject,
}: MapFilterBarProps) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState(false);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return { facilities: [] as Location[], projects: [] as Project[] };
    const facilities = allLocations.filter((l) =>
      l.Facility_Name?.toLowerCase().includes(q) ||
      l.City?.toLowerCase().includes(q) ||
      l.District?.toLowerCase().includes(q)).slice(0, 6);
    const projs = projects.filter((p) =>
      p.Project_Name?.toLowerCase().includes(q) ||
      p.State?.toLowerCase().includes(q)).slice(0, 6);
    return { facilities, projects: projs };
  }, [query, allLocations, projects]);

  const hasResults = results.facilities.length > 0 || results.projects.length > 0;

  return (
    <section className={`map-filter-bar${collapsed ? ' collapsed' : ''}`} aria-label="Map filters">
      <header className="mfb-header">
        <span className="mfb-title">SAI Facilities &amp; Projects</span>
        <button
          className="mfb-collapse"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand filters' : 'Collapse filters'}
        >
          {collapsed ? '▲' : '▼'}
        </button>
      </header>

      {!collapsed && (
        <div className="mfb-body">
          <div className="mfb-search">
            <input
              type="search"
              placeholder="Search facilities or projects…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              aria-label="Search facilities or projects"
            />
            {hasResults && (
              <ul className="search-results" role="listbox">
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

          <div className="mfb-row">
            <label htmlFor="mfb-type" className="mfb-label">Facility Type</label>
            <select
              id="mfb-type"
              value={activeFacilityType ?? ''}
              onChange={(e) => onFacilityTypeChange((e.target.value || null) as FacilityCategory | null)}
            >
              <option value="">All Facility Types</option>
              {FILTER_CHIP_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{FACILITY_CONFIG[cat].label} ({FACILITY_CONFIG[cat].acronym})</option>
              ))}
            </select>
          </div>

          <div className="mfb-row">
            <label htmlFor="mfb-state" className="mfb-label">State</label>
            <select id="mfb-state" value={filterState} onChange={(e) => onStateChange(e.target.value)}>
              <option value="">All States</option>
              {uniqueStates.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <label className="mfb-prj-toggle">
            <input type="checkbox" checked={showProjects} onChange={(e) => onToggleProjects(e.target.checked)} />
            <span className="prj-swatch" style={{ background: PROJECT_COLOR }} aria-hidden="true" />
            <span>Projects <strong>(PRJ)</strong></span>
          </label>
        </div>
      )}
    </section>
  );
}
