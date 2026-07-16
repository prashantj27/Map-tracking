import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface GalleryImage {
  key: string;
  url: string;
  name: string;
  /** Present for uploaded images (deletable); absent for the placeholder. */
  imageId?: number;
}

export interface ImageViewerProps {
  images: GalleryImage[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  onDelete?: (img: GalleryImage) => void;
  canDelete: boolean;
}

/**
 * In-platform fullscreen image viewer. Images never open in a browser tab — download uses a
 * programmatic anchor. Keyboard handling is registered in the capture phase so Escape/arrows
 * act on the viewer only and never dismiss the modal beneath it.
 */
export function ImageViewer({ images, index, onIndex, onClose, onDelete, canDelete }: ImageViewerProps) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const img = images[index];
  const count = images.length;

  const go = useCallback((delta: number) => {
    if (count === 0) return;
    const next = (index + delta + count) % count;
    onIndex(next);
  }, [index, count, onIndex]);

  // Reset zoom/pan when the shown image changes.
  useEffect(() => { setScale(1); setOffset({ x: 0, y: 0 }); }, [index]);

  // Clamp the index if the list shrinks (e.g. after a delete).
  useEffect(() => {
    if (count === 0) { onClose(); return; }
    if (index > count - 1) onIndex(count - 1);
  }, [count, index, onIndex, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); }
      else if (e.key === 'ArrowRight') { e.stopImmediatePropagation(); go(1); }
      else if (e.key === 'ArrowLeft') { e.stopImmediatePropagation(); go(-1); }
      else if (e.key === 'Tab') {
        const nodes = rootRef.current?.querySelectorAll<HTMLElement>('button');
        if (!nodes || !nodes.length) return;
        const first = nodes[0], last = nodes[nodes.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && active === first) { e.preventDefault(); e.stopImmediatePropagation(); last.focus(); }
        else if (!e.shiftKey && active === last) { e.preventDefault(); e.stopImmediatePropagation(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true); // capture phase — priority over modal below
    return () => document.removeEventListener('keydown', onKey, true);
  }, [go, onClose]);

  // Move focus into the viewer on open; restore it to the trigger (thumbnail) on close.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    rootRef.current?.focus();
    return () => prev?.focus?.();
  }, []);

  const download = useCallback(() => {
    if (!img) return;
    const a = document.createElement('a');
    a.href = img.url;
    a.download = img.name || 'image';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [img]);

  const zoom = (delta: number) => setScale((s) => Math.min(4, Math.max(1, +(s + delta).toFixed(2))));

  const onPointerDown = (e: React.PointerEvent) => {
    if (scale <= 1) return;
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setOffset({ x: drag.current.ox + (e.clientX - drag.current.x), y: drag.current.oy + (e.clientY - drag.current.y) });
  };
  const onPointerUp = () => { drag.current = null; };

  if (!img) return null;

  return createPortal(
    <div
      className="viewer-backdrop"
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Image viewer — ${img.name}`}
      tabIndex={-1}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="viewer-toolbar">
        <span className="viewer-count">{index + 1} / {count}</span>
        <div className="viewer-actions">
          <button onClick={() => zoom(-0.5)} aria-label="Zoom out" title="Zoom out">−</button>
          <button onClick={() => zoom(0.5)} aria-label="Zoom in" title="Zoom in">＋</button>
          <button onClick={download} aria-label="Download image" title="Download">⤓</button>
          {canDelete && img.imageId != null && onDelete && (
            <button className="viewer-delete" onClick={() => onDelete(img)} aria-label="Delete image" title="Delete">🗑</button>
          )}
          <button onClick={onClose} aria-label="Close viewer" title="Close">✕</button>
        </div>
      </div>

      {count > 1 && <button className="viewer-nav prev" onClick={() => go(-1)} aria-label="Previous image">‹</button>}

      <div className="viewer-stage" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} onDoubleClick={() => setScale((s) => (s > 1 ? 1 : 2))}>
        <img
          className="viewer-image"
          src={img.url}
          alt={img.name}
          draggable={false}
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, cursor: scale > 1 ? 'grab' : 'default' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      </div>

      {count > 1 && <button className="viewer-nav next" onClick={() => go(1)} aria-label="Next image">›</button>}
    </div>,
    document.body,
  );
}
