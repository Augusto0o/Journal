import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '@/components/ui';
import { cx, haptic } from '@/utils/misc';

export interface SwipeAction {
  id: string;
  label: string;
  icon: IconName;
  tone?: 'default' | 'accent' | 'danger';
  onAction: () => void;
}

const W = 76;

/**
 * Fila deslizable como en Mail/Notas: arrastrá hacia la izquierda para ver
 * las acciones; un deslizamiento largo ejecuta la última (normalmente eliminar).
 * Sigue al dedo, se abre o se cierra según la velocidad y la distancia.
 */
export function SwipeRow({ actions, children, className }: { actions: SwipeAction[]; children: React.ReactNode; className?: string }) {
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; base: number; t: number; axis: 'x' | 'y' | null } | null>(null);
  const moved = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const open = -W * actions.length;
  const full = open - 90;

  // Cerrar al tocar afuera.
  useEffect(() => {
    if (x === 0) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setX(0);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [x]);

  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY, base: x, t: performance.now(), axis: null };
    moved.current = false;
  };

  const onMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (s.axis === 'x') {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setDragging(true);
      }
    }
    if (s.axis !== 'x') return;
    moved.current = true;
    let nx = s.base + dx;
    // Resistencia al pasar los bordes.
    if (nx > 0) nx = nx * 0.2;
    if (nx < full) nx = full + (nx - full) * 0.35;
    setX(nx);
  };

  const onUp = (e: React.PointerEvent) => {
    const s = start.current;
    start.current = null;
    setDragging(false);
    if (!s || s.axis !== 'x') return;
    const dx = e.clientX - s.x;
    const v = dx / Math.max(1, performance.now() - s.t); // px/ms
    if (x <= full + 10 && actions.length) {
      haptic();
      setX(0);
      actions[actions.length - 1].onAction();
      return;
    }
    const shouldOpen = v < -0.35 || (v <= 0.35 && x < open / 2);
    setX(shouldOpen ? open : 0);
  };

  return (
    <div ref={root} className={cx('swipe', className, x !== 0 && 'is-open')}>
      <div className="swipe-actions" aria-hidden={x === 0} style={{ visibility: x === 0 && !dragging ? 'hidden' : undefined }}>
        {actions.map((a) => (
          <button
            key={a.id}
            type="button"
            className={cx('swipe-btn', a.tone && `is-${a.tone}`)}
            tabIndex={x === 0 ? -1 : 0}
            onClick={() => {
              setX(0);
              a.onAction();
            }}
          >
            <Icon name={a.icon} size={20} />
            <span>{a.label}</span>
          </button>
        ))}
      </div>
      <div
        className={cx('swipe-front', dragging && 'is-dragging')}
        style={{ transform: `translate3d(${x}px,0,0)` }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        // Evita abrir el elemento si el gesto fue un deslizamiento.
        onClickCapture={(e) => {
          if (moved.current) {
            // Fue un deslizamiento, no un toque.
            e.preventDefault();
            e.stopPropagation();
            moved.current = false;
          } else if (x !== 0) {
            // Con las acciones abiertas, tocar la fila la cierra.
            e.preventDefault();
            e.stopPropagation();
            setX(0);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
