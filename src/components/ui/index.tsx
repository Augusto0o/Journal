import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { cx } from '@/utils/misc';

export { Icon, type IconName } from './Icon';
export { BottomSheet, SheetAction } from './BottomSheet';
export { useFeedback } from './Feedback';

export function IconButton({
  icon,
  label,
  onClick,
  className,
  active,
  size = 22,
  tone,
  ...rest
}: {
  icon: IconName;
  label: string;
  onClick?: () => void;
  className?: string;
  active?: boolean;
  size?: number;
  tone?: 'accent' | 'filled';
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>) {
  return (
    <button
      type="button"
      className={cx('icon-btn', active && 'is-active', tone === 'accent' && 'is-accent', tone === 'filled' && 'is-filled', className)}
      aria-label={label}
      title={label}
      onClick={onClick}
      {...rest}
    >
      <Icon name={icon} size={size} />
    </button>
  );
}

/** Vuelve atrás si hay historial dentro de la app; si no, a la ruta indicada. */
export function useGoBack(fallback = '/') {
  const navigate = useNavigate();
  return () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  };
}

/** Barra compacta de las pantallas de detalle (estilo iOS). */
export function NavBar({
  title,
  back,
  backLabel = 'Atrás',
  onBack,
  end,
  className,
}: {
  title?: ReactNode;
  back?: string;
  backLabel?: string;
  onBack?: () => void;
  end?: ReactNode;
  className?: string;
}) {
  const goBack = useGoBack(back ?? '/');
  return (
    <header className={cx('navbar', className)}>
      <div className="navbar-side">
        {(back !== undefined || onBack) && (
          <button type="button" className="navbar-back" onClick={onBack ?? goBack} aria-label={backLabel}>
            <Icon name="arrowLeft" size={18} strokeWidth={2} />
          </button>
        )}
      </div>
      <div className="navbar-title">{title}</div>
      <div className="navbar-side end">{end}</div>
    </header>
  );
}

export function PageHead({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="grow">
        <h1>{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {actions && <div className="page-head-actions">{actions}</div>}
    </div>
  );
}

export function Group({ title, action, children, foot, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; foot?: ReactNode; className?: string }) {
  return (
    <section className={cx('group', className)}>
      {(title || action) && (
        <h2 className="group-title">
          <span>{title}</span>
          {action}
        </h2>
      )}
      <div className="group-body">{children}</div>
      {foot && <p className="group-foot">{foot}</p>}
    </section>
  );
}

interface RowProps {
  icon?: IconName;
  hue?: number;
  label: ReactNode;
  sub?: ReactNode;
  value?: ReactNode;
  to?: string;
  onClick?: () => void;
  chevron?: boolean;
  danger?: boolean;
  accent?: boolean;
  trailing?: ReactNode;
  leading?: ReactNode;
  className?: string;
}

export function Row({ icon, hue, label, sub, value, to, onClick, chevron, danger, accent, trailing, leading, className }: RowProps) {
  const cls = cx('row', (!!icon || !!leading) && 'has-icon', danger && 'is-danger', accent && 'is-accent', className);
  const inner = (
    <>
      {leading}
      {icon && (
        <span className={cx('row-icon', hue !== undefined && 'tint')} style={hue !== undefined ? ({ '--hue': hue } as React.CSSProperties) : undefined}>
          <Icon name={icon} size={18} />
        </span>
      )}
      <span className="row-main">
        <span className="row-label">{label}</span>
        {sub && <span className="row-sub">{sub}</span>}
      </span>
      {value !== undefined && <span className="row-value">{value}</span>}
      {trailing}
      {(chevron ?? !!to) && <Icon name="chevronRight" size={18} className="row-chev" strokeWidth={2} />}
    </>
  );
  if (to) return <Link to={to} className={cls}>{inner}</Link>;
  if (onClick) return <button type="button" className={cls} onClick={onClick}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />;
}

export function SwitchRow({ label, sub, checked, onChange, icon, hue }: { label: string; sub?: ReactNode; checked: boolean; onChange: (v: boolean) => void; icon?: IconName; hue?: number }) {
  return <Row icon={icon} hue={hue} label={label} sub={sub} trailing={<Switch checked={checked} onChange={onChange} label={label} />} />;
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className="segmented" role="group" aria-label={label} style={{ '--n': options.length, '--i': i } as React.CSSProperties}>
      <span className="segmented-thumb" aria-hidden="true" />
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ on, onClick, children, count }: { on?: boolean; onClick: () => void; children: ReactNode; count?: number }) {
  return (
    <button type="button" className="chip" aria-pressed={!!on} onClick={onClick}>
      {children}
      {count !== undefined && <span className="count">{count}</span>}
    </button>
  );
}

/** Fila de chips que mantiene visible el chip activo. */
export function Chips({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    el?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  });
  return (
    <div className="chips" ref={ref}>
      {children}
    </div>
  );
}

export function Stepper({ value, onChange, min = 0, max = 999, step = 1, format, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; format?: (v: number) => ReactNode; label: string }) {
  const round = (v: number) => Math.round(v * 100) / 100;
  return (
    <span className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label="Menos" disabled={value <= min} onClick={() => onChange(round(Math.max(min, value - step)))}>
        <Icon name="divider" size={16} strokeWidth={2.2} />
      </button>
      <output>{format ? format(value) : value}</output>
      <button type="button" aria-label="Más" disabled={value >= max} onClick={() => onChange(round(Math.min(max, value + step)))}>
        <Icon name="plus" size={16} strokeWidth={2.2} />
      </button>
    </span>
  );
}

export function Check({ checked, onChange, label, priority = 0 }: { checked: boolean; onChange: () => void; label: string; priority?: number }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={label} className={cx('check', !checked && priority > 0 && `p${priority}`)} onClick={onChange}>
      <Icon name="check" size={14} strokeWidth={3} />
    </button>
  );
}

export function Empty({ title, message, action }: { title: string; message?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {message && <p className="empty-message">{message}</p>}
      {action}
    </div>
  );
}

export function Spinner({ label = 'Cargando' }: { label?: string }) {
  return <span className="spinner" role="status" aria-label={label} />;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}
