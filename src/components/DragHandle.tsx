import type { PointerEventHandler } from 'react';

export interface DragHandleProps {
  className?: string;
  label: string;
  onPointerDown: PointerEventHandler<HTMLButtonElement>;
  onPointerMove: PointerEventHandler<HTMLButtonElement>;
  onPointerUp: PointerEventHandler<HTMLButtonElement>;
  onPointerCancel: PointerEventHandler<HTMLButtonElement>;
  onDoubleClick: () => void;
}

/**
 * Small grip handle that starts a drag (via `useDraggable`) on pointerdown. `touch-action: none`
 * is required so touch drags aren't hijacked by the browser's default scroll/pan gesture.
 * Double-click resets the widget to its default position.
 */
export function DragHandle({ className, label, ...handlers }: DragHandleProps) {
  return (
    <button
      type="button"
      className={`drag-handle${className ? ` ${className}` : ''}`}
      style={{ touchAction: 'none' }}
      aria-label={label}
      title={label}
      {...handlers}
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
        <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
        <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
        <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
      </svg>
    </button>
  );
}
