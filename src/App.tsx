import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { db, seedDatabase, type Location } from './db';
import { useLiveQuery } from 'dexie-react-hooks';
import { classifyFacility, ALL_CATEGORIES, QUICK_FILTER_CATEGORIES, FACILITY_CONFIG, type FacilityCategory } from './lib/facilityTypes';
import { dataToGeoStates } from './lib/stateNames';
import { isRealDiscipline } from './lib/disciplineIcons';
import { FilterPanel } from './components/FilterPanel';
import { StatsDeck, type Stats } from './components/StatsDeck';
import { MapView } from './components/MapView';
import { StateReportCard } from './components/StateReportCard';
import './App.css';

// Stable colors per SAI region (alphabetical-index assignment would reshuffle
// every state's color whenever a region is added or removed).
const REGION_COLORS: Record<string, string> = {
  'Bangalore': '#f44336',
  'Bhopal': '#e91e63',
  'Gandhinagar': '#9c27b0',
  'Guwahati': '#673ab7',
  'Head Office': '#3f51b5',
  'Imphal': '#2196f3',
  'Kolkata': '#03a9f4',
  'LNCPE': '#00bcd4',
  'Lucknow': '#009688',
  'Mumbai': '#4caf50',
  'NSNIS': '#8bc34a',
  'Sonepat': '#ff9800',
  'Zirakpur': '#ff5722',
};
const FALLBACK_REGION_COLORS = ['#cddc39', '#ffeb3b', '#ffc107', '#795548'];

type SeedState = 'loading' | 'ready' | 'error';

function isNonEmptyString(x: string | null | undefined): x is string {
  return !!x;
}

function App() {
  const mapRef = useRef<MapRef | null>(null);

  const [seedState, setSeedState] = useState<SeedState>('loading');
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);

  // Filters
  const [filterRegion, setFilterRegion] = useState('');
  const [filterState, setFilterState] = useState('');
  const [filterDiscipline, setFilterDiscipline] = useState('');
  const [activeQuickFilter, setActiveQuickFilter] = useState<FacilityCategory | null>(null);
  const [reportState, setReportState] = useState<string | null>(null);

  useEffect(() => {
    seedDatabase()
      .then(() => setSeedState('ready'))
      .catch(err => {
        console.error('Failed to seed database:', err);
        setSeedState('error');
      });
  }, []);

  const allLocations = useLiveQuery(() => db.locations.toArray()) || [];
  const allDisciplineRows = useLiveQuery(() => db.disciplines.toArray()) || [];

  const uniqueRegions = useMemo(
    () => Array.from(new Set(allLocations.map(l => l.Parent_Region).filter(isNonEmptyString))).sort(),
    [allLocations]);
  const uniqueStates = useMemo(
    () => Array.from(new Set(allLocations.map(l => l.State).filter(isNonEmptyString))).sort(),
    [allLocations]);
  const uniqueDisciplines = useMemo(() => {
    const dSet = new Set<string>();
    allLocations.forEach(l => {
      l.Disciplines?.split(',').forEach(d => { const t = d.trim(); if (t && isRealDiscipline(t)) dSet.add(t); });
    });
    return Array.from(dSet).sort();
  }, [allLocations]);

  // Region/State/Discipline filters — drive the statistics.
  const filteredLocationsForStats = useMemo(() => {
    return allLocations.filter(loc => {
      if (filterRegion && loc.Parent_Region !== filterRegion) return false;
      if (filterState && loc.State !== filterState) return false;
      if (filterDiscipline) {
        if (!loc.Disciplines) return false;
        if (!loc.Disciplines.split(',').some(d => d.trim() === filterDiscipline)) return false;
      }
      return true;
    });
  }, [allLocations, filterRegion, filterState, filterDiscipline]);

  // Facility-type quick filter additionally applies to the map markers.
  const filteredLocations = useMemo(() => {
    if (!activeQuickFilter) return filteredLocationsForStats;
    return filteredLocationsForStats.filter(loc => classifyFacility(loc.Facility_Type) === activeQuickFilter);
  }, [filteredLocationsForStats, activeQuickFilter]);

  const stats = useMemo<Stats & {
    genderByCategory: Record<FacilityCategory, { m: number; f: number }>;
    traineesByCategory: Record<FacilityCategory, number>;
  }>(() => {
    const counts = Object.fromEntries(ALL_CATEGORIES.map(c => [c, 0])) as Record<FacilityCategory, number>;
    const genderByCategory = Object.fromEntries(
      ALL_CATEGORIES.map(c => [c, { m: 0, f: 0 }])
    ) as Record<FacilityCategory, { m: number; f: number }>;
    const traineesByCategory = Object.fromEntries(
      ALL_CATEGORIES.map(c => [c, 0])
    ) as Record<FacilityCategory, number>;
    let m = 0, f = 0, total = 0;

    filteredLocationsForStats.forEach(loc => {
      const cat = classifyFacility(loc.Facility_Type);
      counts[cat]++;
      const locM = loc.Trainees_Male || 0;
      const locF = loc.Trainees_Female || 0;
      const locTotal = loc.Total_Trainees || 0;
      m += locM;
      f += locF;
      total += locTotal;
      genderByCategory[cat].m += locM;
      genderByCategory[cat].f += locF;
      traineesByCategory[cat] += locTotal;
    });

    return { counts, m, f, total, genderByCategory, traineesByCategory };
  }, [filteredLocationsForStats]);

  const topBarChartTitle = filterDiscipline ? 'Top 5 States (Trainees)' : 'Top 5 Disciplines (Trainees)';

  const topBarChartData = useMemo(() => {
    const facMap = new Map<string, Location>();
    filteredLocationsForStats.forEach(l => facMap.set(l.Facility_ID, l));

    const totals: Record<string, { total: number; breakdown: Record<string, number> }> = {};

    allDisciplineRows.forEach(row => {
      const loc = facMap.get(row.Facility_ID);
      if (!loc || !row.Discipline) return;

      const key = filterDiscipline ? loc.State : row.Discipline;
      if (!key) return;

      if (!totals[key]) {
        totals[key] = { total: 0, breakdown: { KIC: 0, KISCE: 0, STC: 0, NCOE: 0 } };
      }

      const t = row.Total_Trainees ?? ((row.Trainees_Male || 0) + (row.Trainees_Female || 0));
      totals[key].total += t;

      const cat = classifyFacility(loc.Facility_Type);
      if (['KIC', 'KISCE', 'STC', 'NCOE'].includes(cat)) {
        totals[key].breakdown[cat] += 1;
      }
    });

    return Object.entries(totals)
      .map(([name, data]) => ({ name, total: data.total, breakdown: data.breakdown }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
      .reverse();
  }, [filteredLocationsForStats, allDisciplineRows, filterDiscipline]);

  const facilityGenderData = useMemo(() =>
    QUICK_FILTER_CATEGORIES.map(cat => ({
      name: FACILITY_CONFIG[cat].acronym,
      Male: stats.genderByCategory[cat].m,
      Female: stats.genderByCategory[cat].f,
    })), [stats.genderByCategory]);

  // Choropleth expression — keys must be GeoJSON state names.
  const stateColorMatch = useMemo(() => {
    if (allLocations.length === 0) return '#e0e0e0';
    const regionToColor = (region: string, idx: number) =>
      REGION_COLORS[region] ?? FALLBACK_REGION_COLORS[idx % FALLBACK_REGION_COLORS.length];

    const stateToColor: Record<string, string> = {};
    allLocations.forEach(loc => {
      if (!loc.State || !loc.Parent_Region) return;
      dataToGeoStates(loc.State).forEach(geoName => {
        if (!stateToColor[geoName]) {
          stateToColor[geoName] = regionToColor(loc.Parent_Region as string, uniqueRegions.indexOf(loc.Parent_Region as string));
        }
      });
    });

    const entries = Object.entries(stateToColor);
    if (entries.length === 0) return '#e0e0e0';
    const matchExpr: unknown[] = ['match', ['get', 'STNAME_SH']];
    entries.forEach(([state, color]) => matchExpr.push(state, color));
    matchExpr.push('#e0e0e0');
    return matchExpr;
  }, [allLocations, uniqueRegions]);

  const scopeLabel = useMemo(() => {
    const parts = [filterState || filterRegion || 'All India'];
    if (activeQuickFilter) parts.push(`${FACILITY_CONFIG[activeQuickFilter].acronym}s`);
    if (filterDiscipline) parts.push(filterDiscipline);
    return parts.join(' • ');
  }, [filterState, filterRegion, activeQuickFilter, filterDiscipline]);

  const hasActiveFilters = !!(filterRegion || filterState || filterDiscipline || activeQuickFilter);

  const resetFilters = useCallback(() => {
    setFilterRegion('');
    setFilterState('');
    setFilterDiscipline('');
    setActiveQuickFilter(null);
  }, []);

  const handleRegionChange = useCallback((v: string) => {
    setFilterRegion(v);
    setFilterState(''); // region change resets state
  }, []);

  const handlePickFacility = useCallback((loc: Location) => {
    resetFilters(); // a searched facility may be outside the active filters — make sure its pin is visible
    setSelectedLocation(loc);
    mapRef.current?.flyTo({ center: [loc.Longitude, loc.Latitude], zoom: 10, duration: 1200 });
  }, [resetFilters]);

  const handleToggleQuickFilter = useCallback((cat: FacilityCategory) => {
    setActiveQuickFilter(prev => (prev === cat ? null : cat));
  }, []);

  // Map state click: filter + open the report card.
  const handleStateClick = useCallback((stateName: string) => {
    setFilterState(stateName);
    setReportState(stateName);
  }, []);

  // From the report card's facility list: fly + open popup, keep filters.
  const handlePickFromReport = useCallback((loc: Location) => {
    setSelectedLocation(loc);
    mapRef.current?.flyTo({ center: [loc.Longitude, loc.Latitude], zoom: 10, duration: 1200 });
  }, []);

  return (
    <div className="app-shell">
      <button
        className="panel-toggle"
        onClick={() => setPanelOpen(o => !o)}
        aria-expanded={panelOpen}
        aria-controls="control-panel"
      >
        {panelOpen ? '‹ Hide filters' : '› Filters'}
      </button>

      <aside id="control-panel" className={`control-panel${panelOpen ? '' : ' closed'}`}>
        <h3>SAI Facilities Finder</h3>

        <FilterPanel
          allLocations={allLocations}
          uniqueRegions={uniqueRegions}
          uniqueStates={uniqueStates}
          uniqueDisciplines={uniqueDisciplines}
          filterRegion={filterRegion}
          filterState={filterState}
          filterDiscipline={filterDiscipline}
          activeQuickFilter={activeQuickFilter}
          onRegionChange={handleRegionChange}
          onStateChange={setFilterState}
          onDisciplineChange={setFilterDiscipline}
          onQuickFilterChange={setActiveQuickFilter}
          onReset={resetFilters}
          onPickFacility={handlePickFacility}
          hasActiveFilters={hasActiveFilters}
          onOpenReport={filterState ? () => setReportState(filterState) : undefined}
        />

        <StatsDeck
          stats={stats}
          topBarChartData={topBarChartData}
          topBarChartTitle={topBarChartTitle}
          facilityGenderData={facilityGenderData}
          activeQuickFilter={activeQuickFilter}
          onToggleQuickFilter={handleToggleQuickFilter}
          scopeLabel={scopeLabel}
        />
      </aside>

      <MapView
        locations={filteredLocations}
        stateColorMatch={stateColorMatch}
        selected={selectedLocation}
        onSelect={setSelectedLocation}
        onStateClick={handleStateClick}
        mapRef={mapRef}
        activeDiscipline={filterDiscipline}
        activeQuickFilter={activeQuickFilter}
      />

      {reportState && (
        <StateReportCard
          key={reportState} /* resets internal selection when the state changes */
          stateName={reportState}
          locations={allLocations}
          disciplineRows={allDisciplineRows}
          onClose={() => setReportState(null)}
          onPickFacility={handlePickFromReport}
        />
      )}

      {seedState === 'loading' && allLocations.length === 0 && (
        <div className="overlay-message" role="status">
          <div className="spinner" aria-hidden="true" />
          Loading facility data…
        </div>
      )}

      {seedState === 'error' && allLocations.length === 0 && (
        <div className="overlay-message error" role="alert">
          Could not load facility data. Check your connection and{' '}
          <button onClick={() => window.location.reload()}>reload</button>.
        </div>
      )}

      {seedState === 'ready' && allLocations.length > 0 && filteredLocations.length === 0 && (
        <div className="overlay-message" role="status">
          No facilities match these filters.{' '}
          <button onClick={resetFilters}>Reset filters</button>
        </div>
      )}
    </div>
  );
}

export default App;
