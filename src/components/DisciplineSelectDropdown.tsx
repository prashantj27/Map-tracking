import { useEffect, useRef, useState } from 'react';
import { getDisciplineIcon } from '../lib/disciplineIcons';

/**
 * Sport-discipline filter for the Facilities layer — a custom icon dropdown (native <select> can't
 * render the per-sport emoji cleanly) mirroring TypeSelectDropdown's structure/classes. `value` is
 * the base discipline name ('' = all sports); disciplines are already base-normalized + sorted by
 * the caller. Reuses the .mfp-type-menu/.mfp-type-option popup styling.
 */
export function DisciplineSelectDropdown({ disciplines, value, onChange }: {
  disciplines: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const select = (v: string) => { onChange(v); setOpen(false); };

  return (
    <div className="mfp-disc-row">
      <span className="mfp-state-label" id="mfp-disc-label">Sport</span>
      <div className="mfp-disc-select" ref={ref}>
        <button
          type="button"
          className="mfp-type-trigger mfp-disc-trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-labelledby="mfp-disc-label"
          onClick={() => setOpen((o) => !o)}
        >
          <span className="mfp-disc-emoji" aria-hidden="true">{value ? getDisciplineIcon(value) : '🏅'}</span>
          <span className="mfp-type-label">{value || 'All Sports'}</span>
          <svg className={`mfp-type-chevron${open ? ' open' : ''}`} viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {open && (
          <ul className="mfp-type-menu" role="listbox" aria-label="Sport discipline">
            <li role="none">
              <button
                role="option"
                aria-selected={value === ''}
                className={`mfp-type-option${value === '' ? ' selected' : ''}`}
                onClick={() => select('')}
              >
                <span className="mfp-disc-emoji" aria-hidden="true">🏅</span>
                <span>All Sports</span>
              </button>
            </li>
            {disciplines.map((d) => (
              <li role="none" key={d}>
                <button
                  role="option"
                  aria-selected={value === d}
                  className={`mfp-type-option${value === d ? ' selected' : ''}`}
                  onClick={() => select(d)}
                >
                  <span className="mfp-disc-emoji" aria-hidden="true">{getDisciplineIcon(d)}</span>
                  <span>{d}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
