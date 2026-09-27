import { NavBar, Segmented, Stepper, SwitchRow } from '@/components/ui';
import { useAppearance } from '@/hooks/useData';
import type { Accent, ContentFont, ThemePref } from '@/types';
import { cx } from '@/utils/misc';

const ACCENTS: { id: Accent; hue: number; c: number; label: string }[] = [
  { id: 'crimson', hue: 22, c: 0.19, label: 'Carmín' },
  { id: 'terracotta', hue: 45, c: 0.14, label: 'Terracota' },
  { id: 'indigo', hue: 275, c: 0.16, label: 'Índigo' },
  { id: 'violet', hue: 298, c: 0.15, label: 'Violeta' },
  { id: 'blue', hue: 265, c: 0.15, label: 'Azul suave' },
  { id: 'teal', hue: 195, c: 0.1, label: 'Verde agua' },
  { id: 'green', hue: 152, c: 0.12, label: 'Verde' },
  { id: 'amber', hue: 65, c: 0.13, label: 'Ámbar' },
  { id: 'rose', hue: 12, c: 0.15, label: 'Rosa' },
  { id: 'ink', hue: 272, c: 0.02, label: 'Tinta' },
];

const FONTS: { id: ContentFont; label: string; family: string }[] = [
  { id: 'newYork', label: 'New York', family: '-apple-system-ui-serif, ui-serif, Georgia, serif' },
  { id: 'iowan', label: 'Iowan', family: '"Iowan Old Style", Palatino, Georgia, serif' },
  { id: 'georgia', label: 'Georgia', family: 'Georgia, serif' },
  { id: 'system', label: 'SF', family: '-apple-system, system-ui, sans-serif' },
  { id: 'avenir', label: 'Avenir', family: '"Avenir Next", Avenir, system-ui, sans-serif' },
  { id: 'rounded', label: 'Redondeada', family: 'ui-rounded, system-ui, sans-serif' },
  { id: 'mono', label: 'Mono', family: 'ui-monospace, Menlo, monospace' },
];

export default function Appearance({ embedded }: { embedded?: boolean } = {}) {
  const Root = embedded ? 'div' : 'main';
  const [a, setA] = useAppearance();
  const set = (p: Partial<typeof a>) => void setA({ ...p, preset: 'custom' });

  return (
    <Root className={embedded ? 'settings-part' : 'page'}>
      {!embedded && <NavBar back="/ajustes" backLabel="Ajustes" title="Apariencia" />}

      {!embedded && <div className="appearance-preview surface-card mt-2">
        <p className="home-label">Vista previa</p>
        <p className="appearance-preview-title">Martes 14</p>
        <p className="prose">Hoy terminé el primer capítulo. Escribir un poco cada mañana se volvió lo más tranquilo del día.</p>
        <div className="hstack mt-4">
          <span className="btn btn-primary btn-sm">Guardar</span>
          <span className="tag is-accent">#lectura</span>
        </div>
      </div>}

      <section className="group">
        <h2 className="group-title"><span>Tema</span></h2>
        <Segmented<ThemePref> label="Tema" value={a.theme} onChange={(v) => set({ theme: v })} options={[{ value: 'light', label: 'Claro' }, { value: 'dark', label: 'Oscuro' }, { value: 'system', label: 'Automático' }]} />
      </section>

      <section className="group">
        <h2 className="group-title"><span>Color de acento</span></h2>
        <div className="swatches">
          {ACCENTS.map((c) => (
            <button key={c.id} type="button" aria-label={c.label} aria-pressed={a.accent === c.id} className="swatch" style={{ background: `oklch(0.6 ${c.c} ${c.hue})` }} onClick={() => set({ accent: c.id })} />
          ))}
        </div>
      </section>

      <section className="group">
        <h2 className="group-title"><span>Letra del contenido</span></h2>
        <div className="font-tiles">
          {FONTS.map((f) => (
            <button key={f.id} type="button" role="radio" aria-checked={a.font === f.id} className="font-tile" onClick={() => set({ font: f.id })}>
              <span className="font-tile-aa" style={{ fontFamily: f.family }}>Aa</span>
              <span className="font-tile-name">{f.label}</span>
            </button>
          ))}
        </div>
        <div className="group-body mt-4">
          <div className="row"><span className="row-main"><span className="row-label">Tamaño</span></span><Stepper label="Tamaño" value={a.fontSize} min={13} max={28} onChange={(v) => set({ fontSize: v })} format={(v) => `${v}pt`} /></div>
          <div className="row"><span className="row-main"><span className="row-label">Interlineado</span></span><Stepper label="Interlineado" value={a.lineHeight} min={1.3} max={2.2} step={0.05} onChange={(v) => set({ lineHeight: v })} format={(v) => v.toFixed(2)} /></div>
          <SwitchRow label="Usar esta letra en toda la app" checked={a.fontInInterface} onChange={(v) => set({ fontInInterface: v })} />
          <SwitchRow label="Texto justificado" checked={a.justify} onChange={(v) => set({ justify: v })} />
        </div>
      </section>

      <section className="group">
        <h2 className="group-title"><span>Lectura</span></h2>
        <div className="theme-dots">
          {(['app', 'white', 'sepia', 'night'] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={a.readerTheme === t} className={cx('theme-dot', `is-${t}`)} aria-label={{ app: 'Igual que la app', white: 'Blanco', sepia: 'Sepia', night: 'Noche' }[t]} onClick={() => set({ readerTheme: t })} />
          ))}
        </div>
      </section>
    </Root>
  );
}
