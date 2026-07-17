import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

export interface DragPosition { left: number; top: number; }

function clamp(pos: DragPosition, width: number, height: number): DragPosition {
  const maxLeft = Math.max(8, window.innerWidth - width - 8);
  const maxTop = Math.max(8, window.innerHeight - height - 8);
  return { left: Math.min(Math.max(pos.left, 8), maxLeft), top: Math.min(Math.max(pos.top, 8), maxTop) };
}

function readStored(key: string): DragPosition | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.left === 'number' && typeof parsed?.top === 'number') return parsed;
  } catch {
    // corrupt/unavailable storage — fall back to the default CSS position
  }
  return null;
}

/**
 * Makes a floating panel user-draggable via a dedicated grip handle. The panel keeps its normal
 * CSS-positioned default location until the user drags it for the first time; from then on its
 * chosen position is applied inline (position: fixed) and remembered in localStorage under
 * `storageKey`, so it's restored on the next visit. Positions are clamped to stay fully on-screen,
 * including after a window resize. Double-clicking the handle resets to the default position.
 */
export function useDraggable(storageKey: string, elementRef: RefObject<HTMLElement | null>) {
  const [position, setPosition] = useState<DragPosition | null>(() => readStored(storageKey));
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  // Re-clamp a restored position once the element is mounted (viewport may have changed size
  // since the position was saved) and again on every window resize.
  useEffect(() => {
    const reclamp = () => {
      const el = elementRef.current;
      setPosition((p) => {
        if (!p || !el) return p;
        const { width, height } = el.getBoundingClientRect();
        return clamp(p, width, height);
      });
    };
    reclamp();
    window.addEventListener('resize', reclamp);
    return () => window.removeEventListener('resize', reclamp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const el = elementRef.current;
    if (!el || e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    dragStart.current = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  }, [elementRef]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragStart.current) return;
    const el = elementRef.current;
    const { width, height } = el ? el.getBoundingClientRect() : { width: 0, height: 0 };
    const next = clamp(
      { left: dragStart.current.left + (e.clientX - dragStart.current.x), top: dragStart.current.top + (e.clientY - dragStart.current.y) },
      width, height
    );
    setPosition(next);
  }, [elementRef]);

  const endDrag = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragStart.current) return;
    dragStart.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setPosition((p) => {
      if (p) { try { localStorage.setItem(storageKey, JSON.stringify(p)); } catch { /* storage unavailable — position just won't persist */ } }
      return p;
    });
  }, [storageKey]);

  const resetPosition = useCallback(() => {
    setPosition(null);
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
  }, [storageKey]);

  const style = position
    ? { position: 'fixed' as const, left: position.left, top: position.top, right: 'auto', bottom: 'auto', zIndex: dragging ? 60 : undefined }
    : undefined;

  const handleProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onDoubleClick: resetPosition,
  };

  return { style, dragging, handleProps };
}
