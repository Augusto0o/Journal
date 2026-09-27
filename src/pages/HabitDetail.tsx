import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BottomSheet, Group, Icon, IconButton, NavBar, Row, SheetAction, useFeedback } from '@/components/ui';
import { HabitTap, habitIcon, hueOf } from '@/components/entries/HabitRow';
import { HabitEditor } from '@/components/entries/HabitEditor';
import { useSettings, useStore, useToday } from '@/hooks/useData';
import { deleteHabit, saveHabit, setHabitCount } from '@/services/actions';
import { habitBest, habitCount, habitRate, habitScheduled, habitStreak, scheduleLabel, weekOf } from '@/services/queries';
import { addDaysISO } from '@shared/parser.ts';
import { formatEntryDate, MONTHS_SHORT, parseISODate, weekdayHeaders } from '@/utils/date';

const WEEKS = 18;

export default function HabitDetail() {
  const { id = '' } = useParams();
  const snap = useStore();
  const today = useToday();
  const [settings] = useSettings();
  const navigate = useNavigate();
  const { confirm } = useFeedback();
  const [sheet, setSheet] = useState<null | 'menu' | 'edit'>(null);
  const h = snap.habit.find((x) => x.id === id);

  const grid = useMemo(() => {
    const start = addDaysISO(weekOf(today, settings.weekStartsOn)[0], -(WEEKS - 1) * 7);
    return Array.from({ length: WEEKS }, (_, w) => Array.from({ length: 7 }, (_, d) => addDaysISO(start, w * 7 + d)));
  }, [today, settings.weekStartsOn]);

  if (!h) return <main className="page"><NavBar back="/habitos" backLabel="Hábitos" /><p className="muted">No se encontró el hábito.</p></main>;

  const streak = habitStreak(h, today, settings.weekStartsOn);
  const best = habitBest(h);
  const rate = Math.round(habitRate(h, 30, today) * 100);
  const total = Object.values(h.log).reduce((a, b) => a + b, 0);

  return (
    <main className="page" style={{ '--hue': hueOf(h) } as React.CSSProperties}>
      <NavBar back="/habitos" backLabel="Hábitos" end={<IconButton icon="more" label="Opciones" onClick={() => setSheet('menu')} />} />
      <header className="habit-hero">
        <span className="habit-hero-icon"><Icon name={habitIcon(h)} size={26} /></span>
        <div className="grow">
          <h1>{h.name}</h1>
          <p className="page-sub">{scheduleLabel(h)}{h.target > 1 ? ` · meta ${h.target} por día` : ''}</p>
        </div>
        {habitScheduled(h, today) && <HabitTap habit={h} day={today} />}
      </header>

      <dl className="habit-stats">
        <div><dt>Racha</dt><dd className="num">{streak.value}<small> {streak.unit}</small></dd></div>
        <div><dt>Mejor racha</dt><dd className="num">{best}<small> días</small></dd></div>
        <div><dt>Últimos 30 días</dt><dd className="num">{rate}<small>%</small></dd></div>
      </dl>

      <section className="group">
        <h2 className="group-title"><span>Historial</span><span className="faint">{total} registros</span></h2>
        <div className="heatmap surface-card">
          <div className="heatmap-days" aria-hidden="true"><span />{weekdayHeaders(settings.weekStartsOn).map((d, i) => <span key={i}>{i % 2 === 0 ? d : ''}</span>)}</div>
          <div className="heatmap-grid">
            {grid.map((week, wi) => (
              <div key={wi} className="heatmap-col">
                <span className="heatmap-month" aria-hidden="true">{parseISODate(week[0]).getDate() <= 7 ? MONTHS_SHORT[parseISODate(week[0]).getMonth()] : ''}</span>
                {week.map((d) => {
                  const c = habitCount(h, d);
                  const level = d > today ? -1 : Math.min(1, c / Math.max(1, h.target));
                  return (
                    <button
                      key={d}
                      type="button"
                      className="heat"
                      disabled={d > today}
                      data-off={!habitScheduled(h, d) || undefined}
                      style={{ '--l': level } as React.CSSProperties}
                      aria-label={`${formatEntryDate(d)}: ${c} de ${h.target}`}
                      title={`${formatEntryDate(d)} · ${c}/${h.target}`}
                      onClick={() => void setHabitCount(h.id, d, c >= h.target ? 0 : h.target)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <p className="group-foot">Tocá un día para marcarlo o desmarcarlo.</p>
      </section>

      <Group>
        <Row icon="calendar" label="Creado" value={formatEntryDate(h.createdAt.slice(0, 10), 'short')} />
      </Group>

      <BottomSheet open={sheet === 'menu'} onClose={() => setSheet(null)} title={h.name} hideTitle initialFocus="none">
        <div className="group-body">
          <SheetAction icon={<Icon name="pencil" size={20} />} label="Editar" onClick={() => setSheet('edit')} />
          <SheetAction icon={<Icon name="archive" size={20} />} label={h.isArchived ? 'Reactivar' : 'Archivar'} onClick={() => { void saveHabit({ ...h, isArchived: !h.isArchived }); setSheet(null); }} />
          <SheetAction
            icon={<Icon name="trash" size={20} />}
            label="Eliminar"
            danger
            onClick={async () => {
              setSheet(null);
              if (await confirm({ title: '¿Eliminar el hábito?', message: 'Se borra también su historial.', confirmLabel: 'Eliminar', danger: true })) {
                await deleteHabit(h.id);
                navigate('/habitos', { replace: true });
              }
            }}
          />
        </div>
      </BottomSheet>
      <BottomSheet open={sheet === 'edit'} onClose={() => setSheet(null)} title="Editar hábito">
        {sheet === 'edit' && <HabitEditor habit={h} onDone={() => setSheet(null)} />}
      </BottomSheet>
    </main>
  );
}
