import { useMemo, useState } from 'react';
import type { Location } from '../db';
import { FACILITY_CONFIG, QUICK_FILTER_CATEGORIES, classifyFacility, type FacilityCategory } from '../lib/facilityTypes';
import { getDisciplineIcon } from '../lib/disciplineIcons';

export interface FilterPanelProps {
  allLocations: Location[];
  uniqueRegions: string[];
  uniqueStates: string[];
  uniqueDisciplines: string[];
  filterRegion: string;
  filterState: string;
  filterDiscipline: string;
  activeQuickFilter: FacilityCategory | null;
  onRegionChange: (v: string) => void;
  onStateChange: (v: string) => void;
  onDisciplineChange: (v: string) => void;
  onQuickFilterChange: (v: FacilityCategory | null) => void;
  onReset: () => void;
  onPickFacility: (loc: Location) => void;
  hasActiveFilters: boolean;
  /** Present when a state filter is active — opens that state's report card. */
  onOpenReport?: () => void;
}

export function FilterPanel({
  allLocations, uniqueRegions, uniqueStates, uniqueDisciplines,
  filterRegion, filterState, filterDiscipline, activeQuickFilter,
  onRegionChange, onStateChange, onDisciplineChange, onQuickFilterChange,
  onReset, onPickFacility, hasActiveFilters, onOpenReport
}: FilterPanelProps) {
  const [query, setQuery] = useState('');

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return allLocations
      .filter(loc =>
        loc.Facility_Name?.toLowerCase().includes(q) ||
        loc.City?.toLowerCase().includes(q) ||
        loc.District?.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [allLocations, query]);

  const activeTags: { label: string; clear: () => void }[] = [];
  if (filterRegion) activeTags.push({ label: `Region: ${filterRegion}`, clear: () => onRegionChange('') });
  if (filterState) activeTags.push({ label: filterState, clear: () => onStateChange('') });
  if (activeQuickFilter) activeTags.push({ label: `${FACILITY_CONFIG[activeQuickFilter].acronym} only`, clear: () => onQuickFilterChange(null) });
  if (filterDiscipline) activeTags.push({ label: `${getDisciplineIcon(filterDiscipline)} ${filterDiscipline}`, clear: () => onDisciplineChange('') });

  return (
    <>
      <div className="search-box">
        <label htmlFor="facility-search">Find a facility</label>
        <input
          id="facility-search"
          type="search"
          placeholder="Search by name, city or district…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoComplete="off"
        />
        {searchResults.length > 0 && (
          <ul className="search-results" role="listbox">
            {searchResults.map(loc => (
              <li key={loc.id}>
                <button onClick={() => { onPickFacility(loc); setQuery(''); }}>
                  <span
                    className="search-dot"
                    style={{ background: FACILITY_CONFIG[classifyFacility(loc.Facility_Type)].color }}
                    aria-hidden="true"
                  />
                  <span className="search-name">{loc.Facility_Name}</span>
                  <span className="dim small"> {[loc.City, loc.State].filter(Boolean).join(', ')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {query.trim().length >= 2 && searchResults.length === 0 && (
          <div className="search-empty">No facilities match “{query.trim()}”</div>
        )}
      </div>

      <div className="field">
        <label htmlFor="filter-region">Regional Centre</label>
        <select id="filter-region" value={filterRegion} onChange={e => onRegionChange(e.target.value)}>
          <option value="">All Regions</option>
          {uniqueRegions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div className="field">
        <label htmlFor="filter-state">State</label>
        <select id="filter-state" value={filterState} onChange={e => onStateChange(e.target.value)}>
          <option value="">All States</option>
          {uniqueStates.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {filterState && onOpenReport && (
          <button className="report-link" onClick={onOpenReport}>
            <span aria-hidden="true">📊</span> View {filterState} report card
          </button>
        )}
      </div>

      <div className="field">
        <label id="facility-filter-label">Facility Filters</label>
        <div className="chips" role="group" aria-labelledby="facility-filter-label">
          <button
            className={`chip${activeQuickFilter === null ? ' active' : ''}`}
            aria-pressed={activeQuickFilter === null}
            onClick={() => onQuickFilterChange(null)}
          >
            ALL
          </button>
          {QUICK_FILTER_CATEGORIES.map(cat => (
            <button
              key={cat}
              className={`chip${activeQuickFilter === cat ? ' active' : ''}`}
              aria-pressed={activeQuickFilter === cat}
              onClick={() => onQuickFilterChange(activeQuickFilter === cat ? null : cat)}
            >
              {FACILITY_CONFIG[cat].acronym}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="filter-discipline">Sport / Discipline</label>
        <select id="filter-discipline" value={filterDiscipline} onChange={e => onDisciplineChange(e.target.value)}>
          <option value="">All Disciplines</option>
          {uniqueDisciplines.map(d => <option key={d} value={d}>{getDisciplineIcon(d)} {d}</option>)}
        </select>
      </div>

      {hasActiveFilters && (
        <div className="active-filters">
          {activeTags.map(tag => (
            <span key={tag.label} className="filter-tag">
              {tag.label}
              <button onClick={tag.clear} aria-label={`Clear filter ${tag.label}`}>×</button>
            </span>
          ))}
          <button className="reset-btn" onClick={onReset}>Reset all</button>
        </div>
      )}
    </>
  );
}