import type { Project } from '../../db';
import { StatusBadge } from './StatusBadge';
import { getInfraMeta } from '../../lib/projects';

/** Google Maps navigation URL to a project's coordinates (device current location as origin). */
function buildDirectionsUrl(p: Project): string {
  const dest = encodeURIComponent(`${p.Latitude},${p.Longitude}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}

/**
 * Compact PRJ marker popup — deliberately project-centric (no facility/NCOE reference).
 */
export function ProjectPopupContent({ project, onViewDetails }: { project: Project; onViewDetails: () => void }) {
  const infra = getInfraMeta(project.Infra_Type);
  const hasCoords = Number.isFinite(project.Latitude as number) && Number.isFinite(project.Longitude as number);

  return (
    <div className="prj-popup">
      <span className="infra-chip" style={{ background: `${infra.color}1a`, color: infra.color }}>
        <span aria-hidden="true">{infra.icon}</span> {project.Infra_Type}
      </span>
      <h3 className="prj-popup-title">{project.Project_Name}</h3>

      <dl className="prj-popup-meta">
        <div><dt>State</dt><dd>{project.State ?? '—'}</dd></div>
        {project.District && <div><dt>District</dt><dd>{project.District}</dd></div>}
        <div><dt>Status</dt><dd><StatusBadge status={project.Status || 'Data Awaiting'} /></dd></div>
      </dl>

      <div className="prj-popup-actions">
        {hasCoords && (
          <a
            className="directions-btn"
            href={buildDirectionsUrl(project)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Get directions to ${project.Project_Name} in Google Maps`}
          >
            <span aria-hidden="true">🧭</span> Directions
          </a>
        )}
        <button className="project-details-link" onClick={onViewDetails}>
          <span aria-hidden="true">📋</span> View Project Details <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}
