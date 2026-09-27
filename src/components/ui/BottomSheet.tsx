import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '@/utils/misc';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Oculta el título visualmente (sigue disponible para lectores de pantalla). */
  hideTitle?: boolean;
  className?: string;
  initialFocus?: 'first' | 'none';
}

const ANIM_MS = 220;
let openCount = 0;

/**
 * Hoja inferior (móvil) / diálogo centrado (≥768px).
 * Cierre: tocar fondo, Escape, o arrastrar el tirador hacia abajo.
 */
export function BottomSheet({ open, onClose, title, description, children, footer, hideTitle, className, initialFocus = 'first' }: BottomSheetProps) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const drag = useRef<{ startY: number; dy: number; active: boolean } | null>(null);
  const titleId = useId();
  const descId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (open) {
      lastFocus.current = document.activeElement as HTMLElement;
      setMounted(true);
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      return () => cancelAnimationFrame(r);
    }
    setVisible(false);
    const t = setTimeout(() => setMounted(false), ANIM_MS);
    return () => clearTimeout(t);
  }, [open]);

  // Bloqueo de scroll del fondo + foco
  useEffect(() => {
    if (!mounted) return;
    openCount++;
    document.documentElement.classList.add('sheet-open');
    return () => {
      openCount--;
      if (openCount <= 0) document.documentElement.classList.remove('sheet-open');
      lastFocus.current?.focus?.({ preventScroll: true });
    };
  }, [mounted]);

  useEffect(() => {
    if (!visible || initialFocus === 'none') return;
    const el = sheetRef.current;
    const first = el?.querySelector<HTMLElement>('[data-autofocus], input, textarea, select, button:not([data-skip-focus]), [href], [tabindex]:not([tabindex="-1"])');
    (first ?? el)?.focus({ preventScroll: true });
  }, [visible, initialFocus]);

  // Con el teclado abierto, mantiene visible el campo enfocado (el teclado de iOS tapa la hoja).
  useEffect(() => {
    if (!mounted) return;
    const el = sheetRef.current;
    if (!el) return;
    const reveal = (e: FocusEvent) => {
      const t = e.target as HTMLElement;
      if (!t.matches('input, textarea, [contenteditable="true"]')) return;
      [120, 360].forEach((ms) => setTimeout(() => t.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), ms));
    };
    el.addEventListener('focusin', reveal);
    return () => el.removeEventListener('focusin', reveal);
  }, [mounted]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
      if (e.key === 'Tab' && sheetRef.current) {
        const f = Array.from(
          sheetRef.current.querySelectorAll<HTMLElement>('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'),
        ).filter((x) => !x.hasAttribute('disabled'));
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open]);

  if (!mounted) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { startY: e.clientY, dy: 0, active: true };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d?.active || !sheetRef.current) return;
    d.dy = Math.max(0, e.clientY - d.startY);
    sheetRef.current.style.transition = 'none';
    sheetRef.current.style.transform = `translateY(${d.dy}px)`;
  };
  const onPointerUp = () => {
    const d = drag.current;
    if (!d || !sheetRef.current) return;
    sheetRef.current.style.transition = '';
    sheetRef.current.style.transform = '';
    if (d.dy > 90) onClose();
    drag.current = null;
  };

  return createPortal(
    <div className={cx('sheet-root', visible && 'is-visible')}>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        ref={sheetRef}
        className={cx('sheet', className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
      >
        <div className="sheet-handle-area" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <div className="sheet-handle" />
        </div>
        {title && (
          <div className={cx('sheet-header', hideTitle && 'sr-only')}>
            <h2 id={titleId} className="sheet-title">
              {title}
            </h2>
            {description && (
              <p id={descId} className="sheet-desc">
                {description}
              </p>
            )}
          </div>
        )}
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

interface SheetActionProps {
  icon?: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  hint?: string;
  checked?: boolean;
}

export function SheetAction({ icon, label, onClick, danger, hint, checked }: SheetActionProps) {
  return (
    <button type="button" className={cx('sheet-action', danger && 'is-danger')} onClick={onClick} role={checked !== undefined ? 'menuitemradio' : undefined} aria-checked={checked}>
      {icon && <span className="sheet-action-icon">{icon}</span>}
      <span className="sheet-action-label">{label}</span>
      {hint && <span className="sheet-action-hint">{hint}</span>}
      {checked && (
        <svg className="sheet-action-check" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      )}
    </button>
  );
}
