import { useMemo, useState } from 'react';
import { BottomSheet, Icon, IconButton, NavBar, Row, SheetAction, Stepper, SwitchRow } from '@/components/ui';
import { useNow, usePomodoro, usePomodoroSettings, useSettings, useStore, useToday } from '@/hooks/useData';
import { clock, isPaused, isRunning, PHASE_LABEL, remaining, skip, startFocus, stop, toggle } from '@/services/pomodoro';
import { store } from '@/database/store';
import { PREF } from '@/services/prefs';
import { cx } from '@/utils/misc';

export default function Pomodoro() {
  const s = usePomodoro();
  const [cfg, setCfg] = usePomodoroSettings();
  const [settings, setSettings] = useSettings();
  const snap = useStore();
  const today = useToday();
  const running = isRunning(s);
  const active = running || isPaused(s);
  const now = useNow(250, running);
  const [sheet, setSheet] = useState<null | 'settings' | 'task'>(null);

  const rem = active ? remaining(s, now) : cfg.focus * 60_000;
  const total = active ? s.duration : cfg.focus * 60_000;
  const frac = total ? 1 - rem / total : 0;
  const phase = active ? s.phase : 'focus';

  const todaySessions = useMemo(() => snap.focus.filter((f) => f.start.slice(0, 10) === today || new Date(f.start).toDateString() === new Date().toDateString()), [snap.focus, today]);
  const minutesToday = todaySessions.reduce((a, f) => a + f.minutes, 0);
  const openTasks = snap.task.filter((t) => !t.isDone && t.dueDate && t.dueDate <= today).slice(0, 12);

  return (
    <main className={cx('page pomodoro', phase !== 'focus' && 'is-break')}>
      <NavBar back="/" backLabel="Volver" end={<IconButton icon="settings" label="Ajustes del Pomodoro" onClick={() => setSheet('settings')} />} />

      <section className="pomo-stage" aria-live="polite">
        <p className="pomo-phase">{PHASE_LABEL[phase]}{active && isPaused(s) ? ' · en pausa' : ''}</p>
        <p className="pomo-clock num" role="timer">{clock(rem)}</p>
        <div className="pomo-track" aria-hidden="true"><i style={{ transform: `scaleX(${frac})` }} /></div>
        <p className="pomo-rounds" aria-label={`Bloque ${Math.min(s.completedInCycle + 1, cfg.rounds)} de ${cfg.rounds}`}>
          {Array.from({ length: cfg.rounds }, (_, i) => <i key={i} className={cx(i < s.completedInCycle && 'is-done')} />)}
        </p>
        <button type="button" className="pomo-label" onClick={() => setSheet('task')}>
          {s.label ? s.label : 'Elegir en qué enfocarte'}
          <Icon name="chevronDown" size={16} />
        </button>
      </section>

      <div className="pomo-controls">
        <button type="button" className="pomo-side" aria-label="Terminar" onClick={() => void stop()} disabled={!active}>
          <Icon name="stop" size={20} filled strokeWidth={0} />
        </button>
        <button type="button" className="pomo-main" aria-label={running ? 'Pausar' : 'Empezar'} onClick={() => void (active ? toggle() : startFocus())}>
          <Icon name={running ? 'pause' : 'play'} size={30} filled strokeWidth={0} />
        </button>
        <button type="button" className="pomo-side" aria-label="Saltar fase" onClick={() => void skip()} disabled={!active}>
          <Icon name="skip" size={20} filled strokeWidth={0} />
        </button>
      </div>

      <section className="group">
        <h2 className="group-title"><span>Hoy</span><span className="faint num">{minutesToday} min</span></h2>
        {todaySessions.length ? (
          <div className="group-body">
            {todaySessions.slice(-6).reverse().map((f) => (
              <Row key={f.id} label={f.label || 'Foco'} value={`${f.minutes} min`} sub={new Date(f.start).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} />
            ))}
          </div>
        ) : (
          <p className="home-quiet">Todavía no completaste bloques hoy.</p>
        )}
      </section>

      <BottomSheet open={sheet === 'task'} onClose={() => setSheet(null)} title="¿En qué te enfocás?">
        <form className="stack" onSubmit={(e) => { e.preventDefault(); setSheet(null); }}>
          <input className="input" placeholder="Escribir, estudiar, diseñar…" value={s.label} onChange={(e) => void store.setPref(PREF.pomodoro, { ...s, label: e.target.value, taskId: null })} />
        </form>
        {openTasks.length > 0 && (
          <div className="group-body mt-4">
            {openTasks.map((t) => (
              <SheetAction key={t.id} label={t.title} checked={s.taskId === t.id} onClick={() => { void store.setPref(PREF.pomodoro, { ...s, label: t.title, taskId: t.id }); setSheet(null); }} />
            ))}
          </div>
        )}
      </BottomSheet>

      <BottomSheet open={sheet === 'settings'} onClose={() => setSheet(null)} title="Pomodoro">
        <div className="group-body">
          <div className="row"><span className="row-main"><span className="row-label">Foco</span></span><Stepper label="Foco" value={cfg.focus} min={5} max={120} step={5} onChange={(v) => void setCfg({ focus: v })} format={(v) => `${v} min`} /></div>
          <div className="row"><span className="row-main"><span className="row-label">Descanso</span></span><Stepper label="Descanso" value={cfg.short} min={1} max={30} onChange={(v) => void setCfg({ short: v })} format={(v) => `${v} min`} /></div>
          <div className="row"><span className="row-main"><span className="row-label">Descanso largo</span></span><Stepper label="Descanso largo" value={cfg.long} min={5} max={60} step={5} onChange={(v) => void setCfg({ long: v })} format={(v) => `${v} min`} /></div>
          <div className="row"><span className="row-main"><span className="row-label">Bloques por ciclo</span></span><Stepper label="Bloques" value={cfg.rounds} min={2} max={8} onChange={(v) => void setCfg({ rounds: v })} /></div>
        </div>
        <div className="group-body mt-4">
          <SwitchRow label="Empezar descansos solo" checked={cfg.autoBreaks} onChange={(v) => void setCfg({ autoBreaks: v })} />
          <SwitchRow label="Empezar foco tras el descanso" checked={cfg.autoFocus} onChange={(v) => void setCfg({ autoFocus: v })} />
          <SwitchRow label="Sonido al terminar" checked={cfg.sound} onChange={(v) => void setCfg({ sound: v })} />
          <SwitchRow label="Temporizador de iOS" sub="Abre el Atajo «POS Temporizador» para que suene aunque la app esté cerrada." checked={settings.iosTimerShortcut} onChange={(v) => void setSettings({ iosTimerShortcut: v })} />
        </div>
        <p className="field-label mt-6">Sumar a un hábito al completar un bloque</p>
        <div className="group-body mt-2">
          <SheetAction label="Ninguno" checked={!cfg.habitId} onClick={() => void setCfg({ habitId: null })} />
          {snap.habit.filter((h) => !h.isArchived).map((h) => <SheetAction key={h.id} label={h.name} checked={cfg.habitId === h.id} onClick={() => void setCfg({ habitId: h.id })} />)}
        </div>
      </BottomSheet>
    </main>
  );
}
