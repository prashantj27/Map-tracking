import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { db, seedDatabase, type Location, type Project } from './db';
import { useLiveQuery } from 'dexie-react-hooks';
import { classifyFacility, type FacilityCategory } from './lib/facilityTypes';
import { dataToGeoStates } from './lib/stateNames';
import { hasProjectCoordinates } from './lib/projects';
import { MapFilterBar } from './components/MapFilterBar';
import { MapView } from './components/MapView';
import { StateReportCard } from './components/StateReportCard';
import { ProjectDetailModal } from './components/projects/ProjectDetailModal';
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

  // Facility filters (independent of the PRJ layer)
  const [filterState, setFilterState] = useState('');
  const [activeFacilityType, setActiveFacilityType] = useState<FacilityCategory | null>(null);
  const [reportState, setReportState] = useState<string | null>(null);

  // Projects (PRJ) GIS layer — toggled independently of the facility layers
  const [showProjects, setShowProjects] = useState(true);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectDetail, setProjectDetail] = useState<Project | null>(null);

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

  // Facility markers: State + Facility Type filters (independent from projects).
  const filteredLocations = useMemo(() => allLocations.filter(loc => {
    if (filterState && loc.State !== filterState) return false;
    if (activeFacilityType && classifyFacility(loc.Facility_Type) !== activeFacilityType) return false;
    return true;
  }), [allLocations, filterState, activeFacilityType]);

  // PRJ markers: only projects with coordinates; State filter also scopes them (geographic).
  const filteredProjects = useMemo(() => {
    const withCoords = allProjects.filter(hasProjectCoordinates);
    return filterState ? withCoords.filter(p => p.State === filterState) : withCoords;
  }, [allProjects, filterState]);

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

  const hasActiveFilters = !!(filterState || activeFacilityType);
  const resetFilters = useCallback(() => { setFilterState(''); setActiveFacilityType(null); }, []);

  // Facility selection (from map / report card) — one popup at a time.
  const handleSelectFacility = useCallback((loc: Location | null) => {
    if (loc) setSelectedProject(null);
    setSelectedLocation(loc);
  }, []);

  const handleStateClick = useCallback((stateName: string) => {
    setFilterState(stateName);
    setReportState(stateName);
  }, []);

  const handlePickFromReport = useCallback((loc: Location) => {
    setSelectedProject(null);
    setSelectedLocation(loc);
    mapRef.current?.flyTo({ center: [loc.Longitude, loc.Latitude], zoom: 10, duration: 1200 });
  }, []);

  // Search → facility: clear filters so the pin is visible, fly + open popup.
  const handlePickFacility = useCallback((loc: Location) => {
    resetFilters();
    setSelectedProject(null);
    setSelectedLocation(loc);
    mapRef.current?.flyTo({ center: [loc.Longitude, loc.Latitude], zoom: 10, duration: 1200 });
  }, [resetFilters]);

  // PRJ selection (marker click).
  const handleSelectProject = useCallback((p: Project | null) => {
    if (p) setSelectedLocation(null);
    setSelectedProject(p);
  }, []);

  const handleViewProjectDetails = useCallback((p: Project) => setProjectDetail(p), []);

  // "Show on Map" (search result / future project list) — ensure PRJ visible, fly to the marker
  // and open its popup.
  const handlePickProject = useCallback((p: Project) => {
    setShowProjects(true);
    setFilterState('');
    setSelectedLocation(null);
    setSelectedProject(p);
    if (hasProjectCoordinates(p)) {
      mapRef.current?.flyTo({ center: [p.Longitude as number, p.Latitude as number], zoom: 12, duration: 1200 });
    }
  }, []);

  const noResults = seedState === 'ready' && allLocations.length > 0
    && filteredLocations.length === 0 && (!showProjects || filteredProjects.length === 0)
    && hasActiveFilters;

  return (
    <div className="app-shell">
      <MapView
        locations={filteredLocations}
        stateColorMatch={stateColorMatch}
        selected={selectedLocation}
        onSelect={handleSelectFacility}
        onStateClick={handleStateClick}
        mapRef={mapRef}
        activeQuickFilter={activeFacilityType}
        projects={filteredProjects}
        showProjects={showProjects}
        selectedProject={selectedProject}
        onSelectProject={handleSelectProject}
        onViewProjectDetails={handleViewProjectDetails}
      />

      <MapFilterBar
        uniqueStates={uniqueStates}
        filterState={filterState}
        onStateChange={setFilterState}
        activeFacilityType={activeFacilityType}
        onFacilityTypeChange={setActiveFacilityType}
        showProjects={showProjects}
        onToggleProjects={setShowProjects}
        allLocations={allLocations}
        projects={allProjects}
        onPickFacility={handlePickFacility}
        onPickProject={handlePickProject}
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

      {projectDetail && (
        <ProjectDetailModal project={projectDetail} onClose={() => setProjectDetail(null)} />
      )}

      {seedState === 'loading' && allLocations.length === 0 && (
        <div className="overlay-message" role="status">
          <div className="spinner" aria-hidden="true" />
          Loading data…
        </div>
      )}

      {seedState === 'error' && allLocations.length === 0 && (
        <div className="overlay-message error" role="alert">
          Could not load data. Check your connection and{' '}
          <button onClick={() => window.location.reload()}>reload</button>.
        </div>
      )}

      {noResults && (
        <div className="overlay-message" role="status">
          No facilities or projects match these filters.{' '}
          <button onClick={resetFilters}>Reset filters</button>
        </div>
      )}
    </div>
  );
}

export default App;
