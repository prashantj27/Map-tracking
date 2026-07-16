import { useMemo, type RefObject } from 'react';
import { Marker, Popup, type MapRef } from 'react-map-gl/maplibre';
import type { BBox } from 'geojson';
import useSupercluster from 'use-supercluster';
import type Supercluster from 'supercluster';
import type { Project } from '../../db';
import { getProjectStatusColor, hasProjectCoordinates, PROJECT_COLOR } from '../../lib/projects';
import { ProjectPopupContent } from './ProjectPopup';

interface ProjectPointProps { cluster: boolean; projectCode: string; status: string; }

export interface ProjectLayerProps {
  projects: Project[];
  show: boolean;
  bounds: BBox | null;
  zoom: number;
  mapRef: RefObject<MapRef | null>;
  selected: Project | null;
  onSelect: (p: Project | null) => void;
  onViewDetails: (p: Project) => void;
}

const CLIPBOARD =
  'M19 3h-4.18C14.4 1.84 13.3 1 12 1s-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1z';

/**
 * Dedicated Projects (PRJ) GIS layer — its own clustered marker set, fully independent of the
 * facility markers. Toggled by `show`. Reuses the map's viewport (bounds/zoom) for clustering.
 */
export function ProjectLayer({ projects, show, bounds, zoom, mapRef, selected, onSelect, onViewDetails }: ProjectLayerProps) {
  const byCode = useMemo(() => {
    const m = new globalThis.Map<string, Project>();
    projects.forEach((p) => m.set(p.Project_Code, p));
    return m;
  }, [projects]);

  const points = useMemo<Array<Supercluster.PointFeature<ProjectPointProps>>>(() =>
    show
      ? projects.filter(hasProjectCoordinates).map((p) => ({
          type: 'Feature',
          properties: { cluster: false, projectCode: p.Project_Code, status: p.Status },
          geometry: { type: 'Point', coordinates: [p.Longitude as number, p.Latitude as number] },
        }))
      : [],
    [projects, show]);

  const clusteringEnabled = points.length > 40;
  const { clusters, supercluster } = useSupercluster({
    points,
    bounds: (bounds ?? [68, 6, 98, 37]) as [number, number, number, number],
    zoom,
    options: clusteringEnabled
      ? { radius: 60, maxZoom: 12, minPoints: 3 }
      : { radius: 1, maxZoom: 1, minPoints: 1000 },
  });

  if (!show) return null;

  return (
    <>
      {clusters.map((cluster) => {
        const [longitude, latitude] = cluster.geometry.coordinates;
        const props = cluster.properties as ProjectPointProps | Supercluster.ClusterProperties;

        if ('cluster' in props && props.cluster) {
          const count = (props as Supercluster.ClusterProperties).point_count;
          const size = 30 + Math.min(30, (count / Math.max(points.length, 1)) * 120);
          return (
            <Marker
              key={`prj-cluster-${cluster.id}`}
              longitude={longitude}
              latitude={latitude}
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                const expansionZoom = Math.min(supercluster?.getClusterExpansionZoom(cluster.id as number) ?? zoom + 2, 16);
                mapRef.current?.flyTo({ center: [longitude, latitude], zoom: expansionZoom, duration: 600 });
              }}
            >
              <button className="prj-cluster" style={{ width: size, height: size }} title={`${count} projects — click to expand`} aria-label={`${count} projects — zoom in`}>
                {count}
              </button>
            </Marker>
          );
        }

        const { projectCode, status } = props as ProjectPointProps;
        const project = byCode.get(projectCode);
        if (!project) return null;
        const color = getProjectStatusColor(status);
        return (
          <Marker
            key={`prj-${projectCode}`}
            longitude={longitude}
            latitude={latitude}
            anchor="center"
            onClick={(e) => { e.originalEvent.stopPropagation(); onSelect(project); }}
          >
            <div className="prj-pin" style={{ ['--prj-color' as string]: color }} title={project.Project_Name ?? ''}>
              <span className="prj-pin-pulse" aria-hidden="true" />
              <span className="prj-pin-body" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d={CLIPBOARD} /></svg>
              </span>
            </div>
          </Marker>
        );
      })}

      {selected && Number.isFinite(selected.Latitude as number) && Number.isFinite(selected.Longitude as number) && (
        <Popup
          longitude={selected.Longitude as number}
          latitude={selected.Latitude as number}
          anchor="bottom"
          offset={18}
          onClose={() => onSelect(null)}
          closeOnClick={false}
          maxWidth="300px"
          className="prj-popup-wrap"
        >
          <ProjectPopupContent project={selected} onViewDetails={() => onViewDetails(selected)} />
        </Popup>
      )}
    </>
  );
}

// Re-export for the legend/filter bar swatch.
export { PROJECT_COLOR };
