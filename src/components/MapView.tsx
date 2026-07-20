import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import Map, {
  Marker, Popup, NavigationControl, Source, Layer,
  type MapRef, type MapLayerMouseEvent, type ViewStateChangeEvent
} from 'react-map-gl/maplibre';
import type { BBox } from 'geojson';
import type { StyleSpecification } from 'maplibre-gl';
import useSupercluster from 'use-supercluster';
import type Supercluster from 'supercluster';
import type { Location, Project } from '../db';
import { classifyFacility, FACILITY_CONFIG, type FacilityCategory } from '../lib/facilityTypes';
import { geoToDataState, dataToGeoStates } from '../lib/stateNames';
import { getDisciplineIcon, isRealDiscipline } from '../lib/disciplineIcons';
import { FacilityPopupContent } from './FacilityPopup';
import { ProjectLayer } from './projects/ProjectLayer';
import { MapPinGraphic, pinGlyph } from './MapPinGraphic';

interface PointProps {
  cluster: boolean;
  locId: number;
  category: FacilityCategory;
}

export interface MapViewProps {
  locations: Location[];
  stateColorMatch: unknown; // MapLibre `match` expression (or fallback color string)
  selected: Location | null;
  onSelect: (loc: Location | null) => void;
  onStateClick: (dataStateName: string) => void;
  mapRef: RefObject<MapRef | null>;
  /** When a facility-type quick filter is active, clusters take that category's color. */
  activeQuickFilter?: FacilityCategory | null;
  /** Satellite basemap (Esri World Imagery). Owned by App — the toggle lives in the search box. */
  satellite: boolean;
  /** Projects (PRJ) GIS layer — independent of the facility markers. */
  projects: Project[];
  showProjects: boolean;
  selectedProject: Project | null;
  onSelectProject: (p: Project | null) => void;
  onViewProjectDetails: (p: Project) => void;
  /**
   * Fired only when the map crosses the "zoomed in past the overview" threshold (not on every
   * zoom delta), so the filter panel can show/hide its "zoom to full map" button without
   * re-rendering on every pan — keeps continuous viewport state inside MapView (invariant #6).
   */
  onZoomedInChange?: (zoomedIn: boolean) => void;
}

/** Default all-India overview — also the "zoom to map" reset target (see App's onResetView). */
export const INITIAL_VIEW = { longitude: 78.96, latitude: 20.59, zoom: 4.0 };
const DISTRICT_MIN_ZOOM = 5;

// In satellite mode the choropleth tint exists for orientation at country/state level only —
// once the user zooms in to actually inspect imagery, it fades out (linearly between these two
// zooms) and the state layer stops intercepting hover/click, then returns on zoom-out.
const SAT_CHOROPLETH_FADE_START = 6;
const SAT_CHOROPLETH_FADE_END = 7;

// "Birdeye" (facility popup): fly straight down to the facility at imagery-inspection zoom.
const BIRDEYE_ZOOM = 17;

// The "zoom to full map" reset button (in the filter panel's search box) only appears once the
// user has zoomed in past the all-India overview — roughly state level, about halfway through the
// orientation range from the initial zoom (4). Below this, the button is hidden and the search box
// keeps its full width. This is a single tunable threshold — raise it to reveal the button only
// deeper in, lower it to reveal it sooner.
const ZOOM_TO_MAP_MIN_ZOOM = 6;

const MAP_STYLES = {
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
} as const;

// Satellite basemap: Esri World Imagery raster tiles + Esri's boundaries/places reference overlay
// so state/city names stay readable over the imagery (hybrid view). No API key; attribution is
// required and surfaced through MapLibre's attribution control. Tiles are fetched per-viewport,
// so an India-centred session only ever downloads India imagery, always current from the provider.
// (OpenStreetMap itself publishes no satellite imagery — Esri World Imagery is the standard free
// companion layer used with OSM-based maps.)
const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'esri-imagery': {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Powered by <a href="https://www.esri.com/">Esri</a> — Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    },
    'esri-labels': {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
    },
  },
  layers: [
    { id: 'esri-imagery', type: 'raster', source: 'esri-imagery' },
    { id: 'esri-labels', type: 'raster', source: 'esri-labels' },
  ],
};

// KIC keeps its original look: the classic teardrop showing the facility's sport icon when it
// offers exactly one discipline (~98% of KICs), else the "KIC" acronym. Every other type uses
// the shared MapPinGraphic glyph pin.
const KIC_TEARDROP = 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z';

function getFacilityDisciplineIcon(loc: Location): string | null {
  const disciplines = loc.Disciplines?.split(',')
    .map(d => d.trim())
    .filter(d => d && isRealDiscipline(d)) ?? [];
  return disciplines.length === 1 ? getDisciplineIcon(disciplines[0]) : null;
}

function MapViewComponent({
  locations, stateColorMatch, selected, onSelect, onStateClick, mapRef,
  activeQuickFilter, satellite,
  projects, showProjects, selectedProject, onSelectProject, onViewProjectDetails,
  onZoomedInChange
}: MapViewProps) {
  // Viewport state lives here so panning/zooming never re-renders the side panel.
  const [bounds, setBounds] = useState<BBox | null>(null);
  const [zoom, setZoom] = useState<number>(INITIAL_VIEW.zoom);
  const [hoveredState, setHoveredState] = useState<{ name: string; x: number; y: number } | null>(null);
  const [is3D, setIs3D] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const hoveredFeatureId = useRef<string | number | null>(null);

  const clusterColor = activeQuickFilter ? FACILITY_CONFIG[activeQuickFilter].color : '#1a73e8';

  // Once the satellite choropleth has fully faded out, the (now invisible) state fill must also
  // stop intercepting hover/click — otherwise an unseen layer would still show the "Click to
  // filter state" tooltip and hijack map clicks. (3D extrusion is an explicit data-viz mode and
  // is deliberately not gated.)
  const choroplethHidden = satellite && !is3D && zoom >= SAT_CHOROPLETH_FADE_END;

  // Tell App when the map crosses the "zoomed in" threshold. Because the effect depends on the
  // derived boolean (not `zoom` itself), it fires only on a crossing — panning/zooming within a
  // band doesn't notify App, so the filter panel isn't re-rendered on every frame.
  const zoomedIn = zoom >= ZOOM_TO_MAP_MIN_ZOOM;
  useEffect(() => { onZoomedInChange?.(zoomedIn); }, [zoomedIn, onZoomedInChange]);

  const locationById = useMemo(() => {
    const map = new globalThis.Map<number, Location>();
    locations.forEach(loc => { if (loc.id != null) map.set(loc.id, loc); });
    return map;
  }, [locations]);

  const points = useMemo<Array<Supercluster.PointFeature<PointProps>>>(() =>
    locations
      .filter(loc => loc.id != null && Number.isFinite(loc.Longitude) && Number.isFinite(loc.Latitude))
      .map(loc => ({
        type: 'Feature',
        properties: { cluster: false, locId: loc.id as number, category: classifyFacility(loc.Facility_Type) },
        geometry: { type: 'Point', coordinates: [loc.Longitude, loc.Latitude] }
      })), [locations]);

  // With a small filtered set (e.g. one discipline + one type), clustering hides
  // more than it helps — show plain pins and let supercluster kick in only for
  // larger datasets. minPoints 3 avoids confusing "2" clusters.
  const clusteringEnabled = points.length > 40;

  const { clusters, supercluster } = useSupercluster({
    points,
    bounds: (bounds ?? [68, 6, 98, 37]) as [number, number, number, number],
    zoom,
    options: clusteringEnabled
      ? { radius: 50, maxZoom: 11, minPoints: 3 }
      : { radius: 1, maxZoom: 1, minPoints: 1000 } // effectively disables clustering
  });


  // 3D mode: extrude each state by its (filtered) facility count.
  const stateHeightMatch = useMemo(() => {
    const counts: Record<string, number> = {};
    locations.forEach(loc => {
      if (!loc.State) return;
      dataToGeoStates(loc.State).forEach(g => { counts[g] = (counts[g] || 0) + 1; });
    });
    const entries = Object.entries(counts);
    if (entries.length === 0) return 0;
    const expr: unknown[] = ['match', ['get', 'STNAME_SH']];
    entries.forEach(([state, count]) => expr.push(state, Math.sqrt(count) * 22000));
    expr.push(0);
    return expr;
  }, [locations]);

  const toggle3D = useCallback(() => {
    setIs3D(prev => {
      const next = !prev;
      mapRef.current?.easeTo(next
        ? { pitch: 55, bearing: -12, duration: 900 }
        : { pitch: 0, bearing: 0, duration: 900 });
      return next;
    });
  }, [mapRef]);

  // Birdeye: close the popup and dive to the facility so the location itself is visible
  // (most useful on the satellite basemap, but works on the street styles too).
  const flyToBirdeye = useCallback((loc: Location) => {
    onSelect(null);
    mapRef.current?.flyTo({ center: [loc.Longitude, loc.Latitude], zoom: BIRDEYE_ZOOM, duration: 1800 });
  }, [mapRef, onSelect]);

  // Same Birdeye action for a project marker's popup (closes the PRJ popup, dives to its location).
  const flyToBirdeyeProject = useCallback((p: Project) => {
    onSelectProject(null);
    mapRef.current?.flyTo({ center: [p.Longitude as number, p.Latitude as number], zoom: BIRDEYE_ZOOM, duration: 1800 });
  }, [mapRef, onSelectProject]);

  const syncViewport = useCallback((e: ViewStateChangeEvent) => {
    const b = e.target.getBounds();
    setBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    setZoom(e.target.getZoom());
  }, []);

  const clearHover = useCallback(() => {
    const map = mapRef.current;
    if (map && hoveredFeatureId.current !== null) {
      map.setFeatureState({ source: 'states', id: hoveredFeatureId.current }, { hover: false });
      hoveredFeatureId.current = null;
    }
    setHoveredState(null);
  }, [mapRef]);

  // Wheel/button zoom doesn't move the pointer, so onMouseMove never fires to clear a hover
  // that was active when the satellite choropleth faded out — clear it explicitly, or a stale
  // "Click to filter state" tooltip would linger over an overlay that no longer exists.
  useEffect(() => {
    if (choroplethHidden) clearHover();
  }, [choroplethHidden, clearHover]);

  const isStateLayer = (layerId: string | undefined) =>
    layerId === 'state-fills' || layerId === 'state-extrusion';

  const onMouseMove = useCallback((e: MapLayerMouseEvent) => {
    const feature = e.features?.[0];
    const map = mapRef.current;
    if (feature && isStateLayer(feature.layer.id) && map) {
      if (hoveredFeatureId.current !== null && hoveredFeatureId.current !== feature.id) {
        map.setFeatureState({ source: 'states', id: hoveredFeatureId.current }, { hover: false });
      }
      if (feature.id != null) {
        hoveredFeatureId.current = feature.id;
        map.setFeatureState({ source: 'states', id: feature.id }, { hover: true });
      }
      setHoveredState({ name: feature.properties?.STNAME_SH, x: e.point.x, y: e.point.y });
    } else {
      clearHover();
    }
  }, [mapRef, clearHover]);

  const onClick = useCallback((e: MapLayerMouseEvent) => {
    const feature = e.features?.[0];
    if (feature && isStateLayer(feature.layer.id)) {
      onStateClick(geoToDataState(feature.properties?.STNAME_SH));
      mapRef.current?.flyTo({ center: e.lngLat, zoom: 6, duration: 1500 });
    }
    setHoveredState(null);
  }, [onStateClick, mapRef]);

  return (
    <div className="map-area">
      <Map
        ref={mapRef}
        initialViewState={INITIAL_VIEW}
        mapStyle={satellite ? SATELLITE_STYLE : MAP_STYLES[theme]}
        interactiveLayerIds={is3D ? ['state-extrusion'] : choroplethHidden ? [] : ['state-fills']}
        cursor={hoveredState ? 'pointer' : 'grab'}
        maxPitch={70}
        onLoad={e => {
          const b = e.target.getBounds();
          setBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
          setZoom(e.target.getZoom());
        }}
        onMouseMove={onMouseMove}
        onMouseLeave={clearHover}
        onClick={onClick}
        onMove={syncViewport}
      >
        <NavigationControl position="top-right" visualizePitch />

        {/* Interactive state polygons, tinted by SAI region */}
        <Source id="states" type="geojson" data="/india_states_simplified.geojson" generateId>
          <Layer
            id="state-fills"
            type="fill"
            layout={{ visibility: is3D ? 'none' : 'visible' }}
            paint={{
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              'fill-color': stateColorMatch as any,
              // Over satellite imagery the region tint is dropped to a whisper so the imagery
              // stays legible; hover still brightens enough to show the click-to-filter target.
              // It also fades out entirely past SAT_CHOROPLETH_FADE_END so zoomed-in imagery is
              // unobstructed, and comes back on zoom-out (street mode is zoom-independent).
              'fill-opacity': satellite
                ? [
                    'interpolate', ['linear'], ['zoom'],
                    SAT_CHOROPLETH_FADE_START,
                    ['case', ['boolean', ['feature-state', 'hover'], false], 0.3, 0.05],
                    SAT_CHOROPLETH_FADE_END,
                    0
                  ]
                : [
                    'case',
                    ['boolean', ['feature-state', 'hover'], false],
                    0.45,
                    0.15
                  ]
            }}
          />
          <Layer
            id="state-borders"
            type="line"
            paint={{
              'line-color': satellite ? '#ffffff' : theme === 'dark' ? '#8ab4f8' : '#1a73e8',
              'line-width': 1,
              'line-opacity': satellite ? 0.5 : 0.3
            }}
          />
          {is3D && (
            <Layer
              id="state-extrusion"
              type="fill-extrusion"
              paint={{
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                'fill-extrusion-color': stateColorMatch as any,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                'fill-extrusion-height': stateHeightMatch as any,
                'fill-extrusion-opacity': 0.72,
                'fill-extrusion-base': 0
              }}
            />
          )}
        </Source>

        {/* District boundaries — source mounted lazily to avoid the 2.7 MB download at startup */}
        {zoom >= DISTRICT_MIN_ZOOM && (
          <Source id="india-districts" type="geojson" data="/india_district_simplified.geojson">
            <Layer
              id="india-districts-line"
              type="line"
              minzoom={5.5}
              paint={{
                'line-color': satellite || theme === 'dark' ? '#ffffff' : '#000000',
                'line-width': 1,
                'line-opacity': satellite ? 0.2 : 0.05
              }}
            />
          </Source>
        )}

        {/* Pulsing ring under the selected facility */}
        {selected && (
          <Marker longitude={selected.Longitude} latitude={selected.Latitude}>
            <div className="pulse-ring" aria-hidden="true" />
          </Marker>
        )}

        {/* Clustered facility markers */}
        {clusters.map(cluster => {
          const [longitude, latitude] = cluster.geometry.coordinates;
          const props = cluster.properties as PointProps | Supercluster.ClusterProperties;

          if ('cluster' in props && props.cluster) {
            const clusterProps = props as Supercluster.ClusterProperties;
            const count = clusterProps.point_count;
            const size = 28 + Math.min(32, (count / points.length) * 120);
            return (
              <Marker
                key={`cluster-${cluster.id}`}
                longitude={longitude}
                latitude={latitude}
                onClick={(e) => {
                  e.originalEvent.stopPropagation();
                  const expansionZoom = Math.min(supercluster?.getClusterExpansionZoom(cluster.id as number) ?? zoom + 2, 16);
                  mapRef.current?.flyTo({ center: [longitude, latitude], zoom: expansionZoom, duration: 600 });
                }}
              >
                <button
                  className="cluster-marker"
                  style={{ width: size, height: size, background: clusterColor }}
                  title={`${count} facilities — click to expand`}
                  aria-label={`${count} facilities — zoom in`}
                >
                  {count}
                </button>
              </Marker>
            );
          }

          const { locId, category } = props as PointProps;
          const loc = locationById.get(locId);
          if (!loc) return null;
          const cfg = FACILITY_CONFIG[category];

          return (
            <Marker
              key={`loc-${locId}`}
              longitude={longitude}
              latitude={latitude}
              anchor="bottom"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                onSelect(loc);
                setHoveredState(null);
              }}
            >
              <div className="pin" onMouseEnter={clearHover}>
                {/* NCOE are the primary state centres — rendered a little larger via .ncoe */}
                <div className={`pin-graphic${category === 'NCOE' ? ' ncoe' : ''}`}>
                  {category === 'KIC' ? (
                    <>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill={cfg.color} aria-hidden="true">
                        <path d={KIC_TEARDROP} />
                      </svg>
                      {(() => {
                        const sport = getFacilityDisciplineIcon(loc);
                        return sport
                          ? <span className="pin-emoji" aria-hidden="true">{sport}</span>
                          : <span className="pin-acronym">{cfg.acronym}</span>;
                      })()}
                    </>
                  ) : (
                    <MapPinGraphic color={cfg.color} glyph={pinGlyph(category)} />
                  )}
                </div>
                {/* Hover box: facility name + type */}
                <span className="pin-tooltip" aria-hidden="true">
                  <strong>{loc.Facility_Name}</strong>
                  <span className="pin-tooltip-type">{loc.Facility_Type}</span>
                </span>
              </div>
            </Marker>
          );
        })}

        {selected && (
          <Popup
            longitude={selected.Longitude}
            latitude={selected.Latitude}
            onClose={() => onSelect(null)}
            closeOnClick={false}
            maxWidth="340px"
          >
            <FacilityPopupContent loc={selected} onBirdeye={flyToBirdeye} />
          </Popup>
        )}

        {/* Dedicated Projects (PRJ) layer — independent clustered markers + popup */}
        <ProjectLayer
          projects={projects}
          show={showProjects}
          bounds={bounds}
          zoom={zoom}
          mapRef={mapRef}
          selected={selectedProject}
          onSelect={onSelectProject}
          onViewDetails={onViewProjectDetails}
          onBirdeye={flyToBirdeyeProject}
        />

        {/* State hover tooltip (hidden while a popup is open) */}
        {hoveredState && !selected && (
          <div className="state-tooltip" style={{ left: hoveredState.x + 15, top: hoveredState.y + 15 }}>
            <strong>{hoveredState.name}</strong>
            <div className="tooltip-hint">Click to filter state</div>
          </div>
        )}
      </Map>

      {/* Map mode controls. No separate type legend — marker colours/icons match the Facility
          Type selector and quick-filter chips, which serve as the visual legend. */}
      <div className="map-controls">
        {is3D && <div className="map-3d-note">Height = facilities per state</div>}
        <button
          className={`map-control-btn${is3D ? ' active' : ''}`}
          onClick={toggle3D}
          aria-pressed={is3D}
          title="Toggle 3D view — states rise by facility count"
        >
          3D
        </button>
        {/* The light/dark toggle only switches the CARTO street styles — hidden while the
            satellite basemap is active, where it would do nothing. */}
        {!satellite && (
          <button
            className={`map-control-btn${theme === 'dark' ? ' active' : ''}`}
            onClick={() => setTheme(t => (t === 'light' ? 'dark' : 'light'))}
            aria-pressed={theme === 'dark'}
            title="Toggle dark basemap"
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        )}
      </div>
    </div>
  );
}

// Memoized: every prop App passes is a stable reference, so unrelated App re-renders
// (e.g. opening/closing a modal or the report card) skip the marker-layer re-render.
export const MapView = memo(MapViewComponent);
