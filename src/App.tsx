import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { db, seedDatabase, type Location, type Project } from './db';
import { useLiveQuery } from 'dexie-react-hooks';
import { classifyFacility, type FacilityCategory } from './lib/facilityTypes';
import { dataToGeoStates } from './lib/stateNames';
import { isRealDiscipline } from './lib/disciplineIcons';
import { USE_PROJECT_COORDINATES, hasProjectCoordinates } from './lib/projects';
import { FilterPanel } from './components/FilterPanel';
import { MapView } from './components/MapView';
import { StateReportCard } from './components/StateReportCard';
import { ProjectsModal } from './components/projects/ProjectsModal';
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

  // Facility whose state Projects modal is open (its parented projects are shown).
  const [projectsFacility, setProjectsFacility] = useState<Location | null>(null);

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
  const allProjects = useLiveQuery(() => db.projects.toArray()) || [];

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

  // Facility_ID -> number of Phase-1 projects parented there (drives the popup's Project Details link).
  const projectCountByFacility = useMemo(() => {
    const m = new Map<string, number>();
    allProjects.forEach(p => m.set(p.Parent_Facility_ID, (m.get(p.Parent_Facility_ID) || 0) + 1));
    return m;
  }, [allProjects]);

  const projectsForFacility = useMemo(
    () => (projectsFacility ? allProjects.filter(p => p.Parent_Facility_ID === projectsFacility.Facility_ID) : []),
    [allProjects, projectsFacility]);

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

  const handleOpenProjects = useCallback((loc: Location) => setProjectsFacility(loc), []);

  // "Show on Map": until per-project coordinates are switched on, fly to the parent facility and
  // open its existing popup. Flipping USE_PROJECT_COORDINATES switches this to the project's own
  // coordinates with no other change (the values are already stored on the project).
  const handleShowProjectOnMap = useCallback((project: Project) => {
    setProjectsFacility(null);
    if (USE_PROJECT_COORDINATES && hasProjectCoordinates(project)) {
      mapRef.current?.flyTo({ center: [project.Longitude as number, project.Latitude as number], zoom: 12, duration: 1200 });
      return;
    }
    const parent = allLocations.find(l => l.Facility_ID === project.Parent_Facility_ID);
    if (parent) {
      setSelectedLocation(parent);
      mapRef.current?.flyTo({ center: [parent.Longitude, parent.Latitude], zoom: 10, duration: 1200 });
    }
  }, [allLocations]);

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
        {/* Statistics Overview removed from the sidebar — facility statistics now live in the
            state report card (opened from the State filter or by clicking a state on the map). */}
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
        projectCountByFacility={projectCountByFacility}
        onOpenProjects={handleOpenProjects}
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

      {projectsFacility && (
        <ProjectsModal
          stateName={projectsFacility.State ?? 'Projects'}
          projects={projectsForFacility}
          onClose={() => setProjectsFacility(null)}
          onShowOnMap={handleShowProjectOnMap}
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
