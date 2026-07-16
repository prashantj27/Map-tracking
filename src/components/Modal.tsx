import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Stack of open modals so Escape / backdrop only dismiss the topmost one.
const modalStack: symbol[] = [];

export interface ModalProps {
  onClose: () => void;
  children: ReactNode;
  /** lg = detail dialogs, xl = the state projects list. */
  size?: 'lg' | 'xl';
  labelledBy?: string;
  className?: string;
}

/**
 * Reusable, responsive modal shell rendered in a portal on document.body so it reliably
 * overlays the map, panels and popups regardless of their stacking contexts. Handles
 * Escape-to-close, backdrop-click-to-close, body scroll lock, and modal stacking.
 */
export function Modal({ onClose, children, size = 'lg', labelledBy, className }: ModalProps) {
  const idRef = useRef<symbol>(Symbol('modal'));
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = idRef.current;
    modalStack.push(id);
    const prevActive = document.activeElement as HTMLElement | null;
    const isTop = () => modalStack[modalStack.length - 1] === id;

    const onKey = (e: KeyboardEvent) => {
      if (!isTop()) return;
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'Tab') {
        // Trap Tab focus inside the dialog (it is a portal on body; background stays in the DOM).
        const panel = panelRef.current;
        if (!panel) return;
        const nodes = panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (nodes.length === 0) { e.preventDefault(); panel.focus(); return; }
        const first = nodes[0], last = nodes[nodes.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === panel)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = modalStack.indexOf(id);
      if (i >= 0) modalStack.splice(i, 1);
      document.body.style.overflow = prevOverflow;
      prevActive?.focus?.(); // restore focus to the trigger (e.g. the Project Details button)
    };
  }, [onClose]);

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        className={`modal-panel modal-${size}${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
