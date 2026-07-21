import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Project } from '../../db';
import { Modal } from '../Modal';
import { StatusBadge } from './StatusBadge';
import { ProjectGallery } from './ProjectGallery';
import { getInfraMeta, getProjectStatusColor } from '../../lib/projects';
import { confirmProjectCoordinates, unconfirmProjectCoordinates, projectCoordinatesConfirmedQuery } from '../../lib/imageStore';

type TabId = 'Overview' | 'Financials' | 'Timeline' | 'Gallery' | 'Documents' | 'Remarks';
const TABS: TabId[] = ['Overview', 'Financials', 'Timeline', 'Gallery', 'Documents', 'Remarks'];

function EmptyState({ label }: { label: string }) {
  return (
    <div className="project-empty">
      <div className="project-empty-icon" aria-hidden="true">🗂️</div>
      <p>Data will be available in future updates.</p>
      <span className="dim small">{label}</span>
    </div>
  );
}

/**
 * "Coordinates available" toggle — shown in the Gallery only for projects the source data flags
 * `Without_GPS_Images`. Marking it available removes the project from the "Without GPS Images"
 * map filter (persisted per-browser, survives reseed). Reversible.
 */
function CoordinatesAvailableToggle({ project }: { project: Project }) {
  const confirmed = useLiveQuery(() => projectCoordinatesConfirmedQuery(project.Project_Code), [project.Project_Code]);
  if (project.Without_GPS_Images !== true) return null;
  const isConfirmed = confirmed === true;
  return (
    <div className={`coord-toggle${isConfirmed ? ' confirmed' : ''}`}>
      <div className="coord-toggle-info">
        <strong>{isConfirmed ? '📍 Coordinates available' : '📷 Without GPS Images'}</strong>
        <span className="dim small">
          {isConfirmed
            ? 'Removed from the “Without GPS Images” filter. You can undo this.'
            : 'This project shows under the “Without GPS Images” filter until a GPS-verified location is confirmed.'}
        </span>
      </div>
      <button
        type="button"
        className="coord-toggle-btn"
        aria-pressed={isConfirmed}
        onClick={() => (isConfirmed ? unconfirmProjectCoordinates(project.Project_Code) : confirmProjectCoordinates(project.Project_Code))}
      >
        {isConfirmed ? '✓ Coordinates available' : 'Coordinates available'}
      </button>
    </div>
  );
}

/** Responsive per-project modal with Overview / Gallery / Documents / Timeline / Remarks tabs. */
export function ProjectDetailModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const [tab, setTab] = useState<TabId>('Overview');
  const infra = getInfraMeta(project.Infra_Type);

  return (
    <Modal onClose={onClose} size="lg" labelledBy="project-detail-title" className="project-detail-modal">
      <div className="modal-header">
        <div className="modal-header-main">
          <span className="infra-chip" style={{ background: `${infra.color}1a`, color: infra.color }}>
            <span aria-hidden="true">{infra.icon}</span> {project.Infra_Type}
          </span>
          <h2 id="project-detail-title">{project.Project_Name}</h2>
        </div>
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div
        className="modal-tabs"
        role="tablist"
        aria-label="Project details sections"
        onKeyDown={(e) => {
          if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
          e.preventDefault();
          const i = TABS.indexOf(tab);
          const n = e.key === 'ArrowRight' ? (i + 1) % TABS.length
            : e.key === 'ArrowLeft' ? (i - 1 + TABS.length) % TABS.length
              : e.key === 'Home' ? 0 : TABS.length - 1;
          setTab(TABS[n]);
          document.getElementById(`ptab-${TABS[n]}`)?.focus();
        }}
      >
        {TABS.map((t) => (
          <button
            key={t}
            id={`ptab-${t}`}
            className={`modal-tab${tab === t ? ' active' : ''}`}
            role="tab"
            aria-selected={tab === t}
            aria-controls="ptabpanel"
            tabIndex={tab === t ? 0 : -1}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="modal-body" role="tabpanel" id="ptabpanel" aria-labelledby={`ptab-${tab}`}>
        {tab === 'Overview' && (
          <dl className="overview-grid">
            <div><dt>Project Name</dt><dd>{project.Project_Name}</dd></div>
            <div><dt>State</dt><dd>{project.State}</dd></div>
            {project.District && <div><dt>District</dt><dd>{project.District}</dd></div>}
            <div><dt>Infrastructure Type</dt><dd>{project.Infra_Type}</dd></div>
            <div><dt>Project Code</dt><dd><code className="readonly-code">{project.Project_Code}</code></dd></div>
            <div><dt>Status</dt><dd><StatusBadge status={project.Status || 'Data Awaiting'} /></dd></div>
            <div className="overview-progress">
              <dt>Progress</dt>
              <dd>
                {typeof project.Progress === 'number' ? (
                  <div className="progress-wrap">
                    <div className="progress-track" role="img" aria-label={`${project.Progress}% complete`}>
                      <div className="progress-fill" style={{ width: `${project.Progress}%`, background: getProjectStatusColor(project.Status) }} />
                    </div>
                    <span className="progress-pct">{project.Progress}%</span>
                  </div>
                ) : <span className="dim">—</span>}
              </dd>
            </div>
          </dl>
        )}

        {tab === 'Financials' && <EmptyState label="Financials" />}

        {tab === 'Gallery' && (
          <>
            <CoordinatesAvailableToggle project={project} />
            <ProjectGallery projectCode={project.Project_Code} />
          </>
        )}

        {tab === 'Documents' && <EmptyState label="Documents" />}
        {tab === 'Timeline' && <EmptyState label="Timeline" />}
        {tab === 'Remarks' && (
          project.Remarks
            ? <div className="project-remarks">{project.Remarks}</div>
            : <EmptyState label="Remarks" />
        )}
      </div>
    </Modal>
  );
}
