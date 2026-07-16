import { memo } from 'react';
import type { Project } from '../../db';
import { StatusBadge } from './StatusBadge';
import { PLACEHOLDER_IMAGE, getInfraMeta } from '../../lib/projects';

export interface ProjectCardProps {
  project: Project;
  onView: (p: Project) => void;
  onShowOnMap: (p: Project) => void;
}

/** Modern project card (placeholder image, name, state, status, actions). Memoized for long lists. */
export const ProjectCard = memo(function ProjectCard({ project, onView, onShowOnMap }: ProjectCardProps) {
  const infra = getInfraMeta(project.Infra_Type);
  return (
    <article className="project-card">
      <div className="project-card-media">
        <img src={PLACEHOLDER_IMAGE} alt="" loading="lazy" />
        <span className="infra-chip on-media" style={{ background: infra.color }}>
          <span aria-hidden="true">{infra.icon}</span> {project.Infra_Type}
        </span>
      </div>
      <div className="project-card-body">
        <h4 className="project-card-title" title={project.Project_Name ?? ''}>{project.Project_Name}</h4>
        <div className="project-card-meta">
          <span className="dim small"><span aria-hidden="true">📍 </span>{project.State}</span>
          <StatusBadge status={project.Status} />
        </div>
      </div>
      <div className="project-card-actions">
        <button className="btn-primary" onClick={() => onView(project)}>View Details</button>
        <button className="btn-secondary" onClick={() => onShowOnMap(project)}>Show on Map</button>
      </div>
    </article>
  );
});
