import { useState } from 'react';
import { Icon, Segmented, Stepper } from '@/components/ui';
import { saveHabit } from '@/services/actions';
import type { Habit, HabitSchedule } from '@/types';
import { WEEKDAYS_INITIAL } from '@/utils/date';
import { cx } from '@/utils/misc';
import { HABIT_HUES, HABIT_ICONS } from './HabitRow';

export function HabitEditor({ habit, onDone }: { habit: Habit; onDone: (saved: Habit | null) => void }) {
  const [h, setH] = useState<Habit>(habit);
  const set = (p: Partial<Habit>) => setH((x) => ({ ...x, ...p }));
  const type = h.schedule.type;
  const days = h.schedule.type === 'weekdays' ? h.schedule.days : [1, 2, 3, 4, 5];
  const perWeek = h.schedule.type === 'times' ? h.schedule.perWeek : 3;

  return (
    <form
      className="stack-lg"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!h.name.trim()) return;
        const saved = { ...h, name: h.name.trim() };
        await saveHabit(saved);
        onDone(saved);
      }}
    >
      <input className="input" placeholder="Nombre — «Leer 20 minutos»" value={h.name} onChange={(e) => set({ name: e.target.value })} data-autofocus />

      <div>
        <p className="field-label">Frecuencia</p>
        <div className="mt-2">
          <Segmented<HabitSchedule['type']>
            label="Frecuencia"
            value={type}
            onChange={(t) => set({ schedule: t === 'daily' ? { type: 'daily' } : t === 'weekdays' ? { type: 'weekdays', days } : { type: 'times', perWeek } })}
            options={[{ value: 'daily', label: 'Cada día' }, { value: 'weekdays', label: 'Algunos días' }, { value: 'times', label: 'Veces/semana' }]}
          />
        </div>
        {type === 'weekdays' && (
          <div className="day-picker mt-4">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={days.includes(d)}
                aria-label={['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][d]}
                onClick={() => set({ schedule: { type: 'weekdays', days: days.includes(d) ? days.filter((x) => x !== d) : [...days, d] } })}
              >
                {WEEKDAYS_INITIAL[d]}
              </button>
            ))}
          </div>
        )}
        {type === 'times' && (
          <div className="row mt-2" style={{ padding: '8px 4px' }}>
            <span className="row-main"><span className="row-label">Veces por semana</span></span>
            <Stepper label="Veces por semana" value={perWeek} min={1} max={7} onChange={(v) => set({ schedule: { type: 'times', perWeek: v } })} />
          </div>
        )}
      </div>

      <div className="row" style={{ padding: '0 4px' }}>
        <span className="row-main">
          <span className="row-label">Meta diaria</span>
          <span className="row-sub">Toques para darlo por hecho (p. ej. 8 vasos de agua)</span>
        </span>
        <Stepper label="Meta" value={h.target} min={1} max={50} onChange={(v) => set({ target: v })} />
      </div>

      <div>
        <p className="field-label">Color</p>
        <div className="swatches mt-2">
          {Object.entries(HABIT_HUES).map(([name, hue]) => (
            <button key={name} type="button" aria-label={name} aria-pressed={h.color === name} className="swatch" style={{ '--hue': hue } as React.CSSProperties} onClick={() => set({ color: name })} />
          ))}
        </div>
      </div>

      <div>
        <p className="field-label">Ícono</p>
        <div className="icon-picker mt-2">
          {HABIT_ICONS.map((i) => (
            <button key={i} type="button" aria-label={i} aria-pressed={h.icon === i} className={cx('icon-pick', h.icon === i && 'is-on')} style={{ '--hue': HABIT_HUES[h.color] ?? 275 } as React.CSSProperties} onClick={() => set({ icon: i })}>
              <Icon name={i} size={20} />
            </button>
          ))}
        </div>
      </div>

      <button type="submit" className="btn btn-primary" disabled={!h.name.trim() || (type === 'weekdays' && !days.length)}>Guardar</button>
    </form>
  );
}
