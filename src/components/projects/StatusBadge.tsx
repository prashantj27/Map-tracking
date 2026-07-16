import { getStatusMeta } from '../../lib/projects';

/** Small pill showing a project's status ("Data Awaiting", "Cancelled", …). */
export function StatusBadge({ status }: { status: string }) {
  const meta = getStatusMeta(status);
  return (
    <span className="status-badge" style={{ color: meta.color, background: meta.bg }}>
      {meta.label}
    </span>
  );
}
