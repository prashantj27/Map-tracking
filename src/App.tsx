import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { db, seedDatabase, type Location, type Project } from './db';
import { useLiveQuery } from 'dexie-react-hooks';
import { classifyFacility, type FacilityCategory } from './lib/facilityTypes';
import { dataToGeoStates } from './lib/stateNames';
import { hasProjectCoordinates, projectMatchesStatusFilter, type ProjectStatusFilterKey } from './lib/projects';
import { confirmedCoordinateCodes } from './lib/imageStore';
import { MapFilterBar, type TypeSelection } from './components/MapFilterBar';
import { MapView, INITIAL_VIEW, BIRDEYE_ZOOM } from './components/MapView';
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

  // Unified type selector (Facility Type dropdown + bottom quick chips): a facility category,
  // 'PRJ' (Projects layer only), or null ("All Facilities" — everything shown). Replaces the
  // separate facility-type filter + independent PRJ-layer checkbox from the previous design.
  const [typeSelection, setTypeSelection] = useState<TypeSelection>(null);
  const [filterState, setFilterState] = useState('');
  const [reportState, setReportState] = useState<string | null>(null);

  // Project Status filter — only meaningful (and only shown) while typeSelection === 'PRJ'.
  const [projectStatusFilter, setProjectStatusFilter] = useState<ProjectStatusFilterKey | null>(null);

  // Satellite basemap toggle. Lives here (not in MapView with the rest of the map-mode state)
  // because its control sits in MapFilterBar's search box; a rare discrete toggle, so the
  // App-level re-render is fine — continuous viewport state stays inside MapView.
  const [satellite, setSatellite] = useState(false);

  // Whether the map is zoomed in past the overview — drives the "zoom to full map" button in the
  // search box. MapView notifies us only on threshold crossings (see onZoomedInChange), so this
  // flips rarely and continuous panning never re-renders the panel.
  const [mapZoomedIn, setMapZoomedIn] = useState(false);

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

  // Project_Codes the user has marked "coordinates available" — these drop out of the
  // "Without GPS Images" filter (persisted, survives reseed; see lib/imageStore.ts).
  const confirmedCodesArr = useLiveQuery(() => confirmedCoordinateCodes(), []) || [];
  const confirmedCoordCodes = useMemo(() => new Set(confirmedCodesArr), [confirmedCodesArr]);

  const uniqueRegions = useMemo(
    () => Array.from(new Set(allLocations.map(l => l.Parent_Region).filter(isNonEmptyString))).sort(),
    [allLocations]);
  const uniqueStates = useMemo(
    () => Array.from(new Set(allLocations.map(l => l.State).filter(isNonEmptyString))).sort(),
    [allLocations]);

  // Selecting a specific facility type or "Projects" focuses the map on that single layer
  // (Google-Maps-style category switching); "All Facilities" shows both layers together.
  const activeFacilityType: FacilityCategory | null = (typeSelection && typeSelection !== 'PRJ') ? typeSelection : null;
  const showFacilities = typeSelection !== 'PRJ';
  const showProjects = typeSelection === null || typeSelection === 'PRJ';

  // Facility markers: State + Facility Type filters.
  const filteredLocations = useMemo(() => {
    if (!showFacilities) return [];
    return allLocations.filter(loc => {
      if (filterState && loc.State !== filterState) return false;
      if (activeFacilityType && classifyFacility(loc.Facility_Type) !== activeFacilityType) return false;
      return true;
    });
  }, [allLocations, filterState, activeFacilityType, showFacilities]);

  // PRJ markers: only projects with coordinates; State + Project Status filters also apply.
  const filteredProjects = useMemo(() => {
    let list = allProjects.filter(hasProjectCoordinates);
    if (filterState) list = list.filter(p => p.State === filterState);
    if (projectStatusFilter) {
      list = list.filter(p => projectMatchesStatusFilter(p, projectStatusFilter, confirmedCoordCodes.has(p.Project_Code)));
    }
    return list;
  }, [allProjects, filterState, projectStatusFilter, confirmedCoordCodes]);

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

  const hasActiveFilters = !!(filterState || typeSelection || projectStatusFilter);

  // Changing the type selection away from Projects clears its status filter (it's hidden then,
  // so a stale filter shouldn't silently keep hiding PRJ markers next time it's reopened).
  const handleTypeSelectionChange = useCallback((v: TypeSelection) => {
    setTypeSelection(v);
    if (v !== 'PRJ') setProjectStatusFilter(null);
  }, []);

  const resetFilters = useCallback(() => {
    setFilterState('');
    setTypeSelection(null);
    setProjectStatusFilter(null);
  }, []);

  // Facility selection (from map / report card) — one popup at a time.
  const handleSelectFacility = useCallback((loc: Location | null) => {
    if (loc) setSelectedProject(null);
    setSelectedLocation(loc);
  }, []);

  const handleStateClick = useCallback((stateName: string) => {
    setFilterState(stateName);
    setReportState(stateName);
  }, []);

  // "Zoom to full map" — fly back to the all-India overview. Pitch/bearing are left alone so it
  // behaves correctly whether or not 3D mode is on.
  const handleResetView = useCallback(() => {
    mapRef.current?.flyTo({
      center: [INITIAL_VIEW.longitude, INITIAL_VIEW.latitude],
      zoom: INITIAL_VIEW.zoom,
      duration: 1200,
    });
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

  // Report card → project name: close the report and dive to the project on the map in "birdeye"
  // mode (Projects layer shown, aerial close-up at BIRDEYE_ZOOM, no popup — just the location).
  const handleProjectBirdeyeFromReport = useCallback((p: Project) => {
    if (!hasProjectCoordinates(p)) return;
    setTypeSelection('PRJ');
    setProjectStatusFilter(null);
    setSelectedLocation(null);
    setSelectedProject(null);
    setReportState(null);
    mapRef.current?.flyTo({ center: [p.Longitude as number, p.Latitude as number], zoom: BIRDEYE_ZOOM, duration: 1800 });
  }, []);

  // Search → project ("Show on Map"): switch to the Projects layer so the marker is visible, fly
  // to it and open its popup.
  const handlePickProject = useCallback((p: Project) => {
    setTypeSelection('PRJ');
    setProjectStatusFilter(null);
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
        satellite={satellite}
        projects={filteredProjects}
        showProjects={showProjects}
        selectedProject={selectedProject}
        onSelectProject={handleSelectProject}
        onViewProjectDetails={handleViewProjectDetails}
        onZoomedInChange={setMapZoomedIn}
      />

      {/* Single draggable widget — remembers its own position (see useDraggable). */}
      <MapFilterBar
        uniqueStates={uniqueStates}
        filterState={filterState}
        onStateChange={setFilterState}
        typeSelection={typeSelection}
        onTypeSelectionChange={handleTypeSelectionChange}
        projectStatusFilter={projectStatusFilter}
        onProjectStatusFilterChange={setProjectStatusFilter}
        allLocations={allLocations}
        projects={allProjects}
        onPickFacility={handlePickFacility}
        onPickProject={handlePickProject}
        satellite={satellite}
        onSatelliteChange={setSatellite}
        showZoomToMap={mapZoomedIn}
        onResetView={handleResetView}
      />

      {reportState && (
        <StateReportCard
          key={reportState} /* resets internal selection when the state changes */
          stateName={reportState}
          locations={allLocations}
          disciplineRows={allDisciplineRows}
          projects={allProjects}
          onClose={() => setReportState(null)}
          onPickFacility={handlePickFromReport}
          onBirdeyeProject={handleProjectBirdeyeFromReport}
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
