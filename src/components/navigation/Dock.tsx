import { useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '@/components/ui/Icon';
import { cx } from '@/utils/misc';

const TABS: { to: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { to: '/', label: 'Hoy', icon: 'sun', match: (p) => p === '/' || p.startsWith('/habitos') || p.startsWith('/ingles') || p.startsWith('/pomodoro') },
  { to: '/cuaderno', label: 'Cuaderno', icon: 'journal', match: (p) => p.startsWith('/cuaderno') || p.startsWith('/journal') || p.startsWith('/mapas') || p.startsWith('/pdf') },
  { to: '/biblioteca', label: 'Biblioteca', icon: 'library', match: (p) => p.startsWith('/biblioteca') || p.startsWith('/descubrir') || p.startsWith('/arte') },
];

/**
 * Tres pestañas en una cápsula, más la búsqueda (que también pregunta a la IA)
 * y el botón de captura. El indicador activo se desliza entre pestañas.
 */
export function Dock({ onCapture, hidden }: { onCapture: () => void; hidden?: boolean }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [box, setBox] = useState<{ x: number; w: number } | null>(null);
  const active = TABS.findIndex((t) => t.match(pathname));

  useLayoutEffect(() => {
    const el = refs.current[active];
    setBox(el ? { x: el.offsetLeft, w: el.offsetWidth } : null);
  }, [active]);

  return (
    <div className={cx('dock-wrap', hidden && 'is-hidden')}>
      <nav className="capsule dock" aria-label="Principal">
        <span className="dock-indicator" aria-hidden="true" style={box ? ({ '--x': `${box.x}px`, '--w': `${box.w}px` } as React.CSSProperties) : { opacity: 0 }} />
        {TABS.map((t, i) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === '/'}
            ref={(el) => (refs.current[i] = el)}
            className={cx('dock-item', i === active && 'is-active')}
            aria-current={i === active ? 'page' : undefined}
          >
            <Icon name={t.icon} size={21} strokeWidth={i === active ? 2 : 1.7} />
            <span>{t.label}</span>
          </NavLink>
        ))}
      </nav>
      <button type="button" className={cx('capsule dock-round', pathname.startsWith('/buscar') && 'is-active')} onClick={() => navigate('/buscar')} aria-label="Buscar o preguntar">
        <Icon name="search" size={21} />
      </button>
      <button type="button" className="dock-plus" onClick={onCapture} aria-label="Captura rápida">
        <Icon name="plus" size={24} strokeWidth={2.2} />
      </button>
    </div>
  );
}
