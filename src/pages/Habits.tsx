import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BottomSheet, Empty, IconButton, NavBar } from '@/components/ui';
import { HabitRow } from '@/components/entries/HabitRow';
import { HabitEditor } from '@/components/entries/HabitEditor';
import { useSettings, useStore, useToday } from '@/hooks/useData';
import { newHabit } from '@/services/actions';
import { habitDone, habitScheduled, weekOf } from '@/services/queries';
import { formatRelativeDay, parseISODate, WEEKDAYS_INITIAL } from '@/utils/date';
import { cx } from '@/utils/misc';

export default function Habits() {
  const snap = useStore();
  const today = useToday();
  const [settings] = useSettings();
  const [day, setDay] = useState(today);
  const [editing, setEditing] = useState(false);
  const [params, setParams] = useSearchParams();

  useEffect(() => {
    if (params.get('nuevo')) {
      setEditing(true);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const active = useMemo(() => snap.habit.filter((h) => !h.isArchived).sort((a, b) => a.order - b.order), [snap.habit]);
  const scheduled = active.filter((h) => habitScheduled(h, day));
  const other = active.filter((h) => !habitScheduled(h, day));
  const week = weekOf(today, settings.weekStartsOn);

  return (
    <main className="page">
      <NavBar back="/" backLabel="Hoy" title="Hábitos" end={<IconButton icon="plus" label="Nuevo hábito" tone="accent" onClick={() => setEditing(true)} />} />
      <div className="page-head">
        <div>
          <h1>Hábitos</h1>
          <p className="page-sub">{day === today ? 'Hoy' : formatRelativeDay(day)} · {scheduled.filter((h) => habitDone(h, day)).length} de {scheduled.length}</p>
        </div>
      </div>

      {active.length > 0 && (
        <div className="week-strip surface-card" role="tablist" aria-label="Día">
          {week.map((d) => {
            const sched = active.filter((h) => habitScheduled(h, d));
            const frac = sched.length ? sched.filter((h) => habitDone(h, d)).length / sched.length : 0;
            return (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={d === day}
                disabled={d > today}
                className={cx('week-day', d === today && 'is-today', d === day && 'is-selected')}
                onClick={() => setDay(d)}
              >
                <span className="week-day-name">{WEEKDAYS_INITIAL[parseISODate(d).getDay()]}</span>
                <span className="week-day-num num">{parseISODate(d).getDate()}</span>
                <span className="week-day-bar" aria-hidden="true"><i style={{ transform: `scaleX(${frac})` }} /></span>
              </button>
            );
          })}
        </div>
      )}

      {!active.length ? (
        <Empty
          title="Pequeño y todos los días"
          message="Elegí uno o dos hábitos concretos. Se marcan con un toque, desde acá o desde Inicio."
          action={<button type="button" className="btn btn-primary" onClick={() => setEditing(true)}>Crear un hábito</button>}
        />
      ) : (
        <>
          {scheduled.length > 0 && <section className="group"><div className="group-body">{scheduled.map((h) => <HabitRow key={h.id} habit={h} day={day} />)}</div></section>}
          {other.length > 0 && (
            <section className="group">
              <h2 className="group-title"><span>No toca {day === today ? 'hoy' : 'ese día'}</span></h2>
              <div className="group-body">{other.map((h) => <HabitRow key={h.id} habit={h} day={day} />)}</div>
            </section>
          )}
        </>
      )}

      <BottomSheet open={editing} onClose={() => setEditing(false)} title="Nuevo hábito">
        {editing && <HabitEditor habit={newHabit({ order: active.length })} onDone={() => setEditing(false)} />}
      </BottomSheet>
    </main>
  );
}
