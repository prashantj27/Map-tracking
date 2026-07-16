import { useMemo, useState, useCallback } from 'react';
import type { Project } from '../../db';
import { Modal } from '../Modal';
import { ProjectCard } from './ProjectCard';
import { ProjectDetailModal } from './ProjectDetailModal';
import { infraBreakdown, getInfraMeta } from '../../lib/projects';

type SortMode = 'az' | 'recent';
const PAGE = 24; // lazy-load in batches so a state with thousands of projects stays fast

export interface ProjectsModalProps {
  stateName: string;
  projects: Project[];
  onClose: () => void;
  onShowOnMap: (p: Project) => void;
}

/** Large responsive modal listing a state's Phase-1 projects as cards. */
export function ProjectsModal({ stateName, projects, onClose, onShowOnMap }: ProjectsModalProps) {
  const [sort, setSort] = useState<SortMode>('az');
  const [visible, setVisible] = useState(PAGE);
  const [detail, setDetail] = useState<Project | null>(null);

  const breakdown = useMemo(() => infraBreakdown(projects), [projects]);

  const sorted = useMemo(() => {
    const arr = [...projects];
    if (sort === 'az') arr.sort((a, b) => (a.Project_Name ?? '').localeCompare(b.Project_Name ?? ''));
    else arr.sort((a, b) => b.Order - a.Order); // Excel row order — later rows = more recent
    return arr;
  }, [projects, sort]);

  const shown = sorted.slice(0, visible);
  const onView = useCallback((p: Project) => setDetail(p), []);

  return (
    <>
      <Modal onClose={onClose} size="xl" labelledBy="projects-modal-title" className="projects-modal">
        <div className="modal-header">
          <div className="modal-header-main">
            <h2 id="projects-modal-title">{stateName}</h2>
            <div className="projects-header-sub">
              <span className="projects-total">{projects.length} Project{projects.length === 1 ? '' : 's'}</span>
              <div className="infra-breakdown">
                {breakdown.map(({ type, count }) => {
                  const m = getInfraMeta(type);
                  return (
                    <span key={type} className="infra-breakdown-chip" style={{ color: m.color }}>
                      <span aria-hidden="true">{m.icon}</span> {type} <strong>({count})</strong>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="projects-toolbar">
          <label htmlFor="projects-sort" className="dim small">Sort</label>
          <select
            id="projects-sort"
            value={sort}
            onChange={(e) => { setSort(e.target.value as SortMode); setVisible(PAGE); }}
          >
            <option value="az">A–Z</option>
            <option value="recent">Recently Added</option>
          </select>
        </div>

        <div className="modal-body">
          {projects.length === 0 ? (
            <div className="project-empty"><p>No projects recorded for this state yet.</p></div>
          ) : (
            <>
              <div className="projects-grid">
                {shown.map((p) => (
                  <ProjectCard key={p.Project_Code} project={p} onView={onView} onShowOnMap={onShowOnMap} />
                ))}
              </div>
              {visible < sorted.length && (
                <div className="projects-loadmore">
                  <button className="btn-secondary" onClick={() => setVisible((v) => v + PAGE)}>
                    Load more ({sorted.length - visible} remaining)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </Modal>

      {detail && <ProjectDetailModal project={detail} onClose={() => setDetail(null)} />}
    </>
  );
}
