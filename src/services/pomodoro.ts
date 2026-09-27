import { cancelPush, schedulePush } from './push';
import type { PomodoroPhase, PomodoroSettings, PomodoroState, Settings } from '@/types';
import { store } from '@/database/store';
import { DEFAULT_POMODORO_SETTINGS, DEFAULT_POMODORO_STATE, DEFAULT_SETTINGS, PREF } from './prefs';
import { incrementHabit, logFocus } from './actions';
import { runShortcut, SHORTCUT_NAMES } from './shortcuts';
import { todayISO } from '@/utils/date';

export const PHASE_LABEL: Record<PomodoroPhase, string> = { idle: 'Listo', focus: 'Foco', short: 'Descanso', long: 'Descanso largo' };
export const PHASE_SHORT: Record<PomodoroPhase, string> = { idle: 'FOCUS', focus: 'FOCUS', short: 'BREAK', long: 'LONG BREAK' };

export const pomoState = (): PomodoroState => ({ ...DEFAULT_POMODORO_STATE, ...store.pref<Partial<PomodoroState>>(PREF.pomodoro, {}) });
export const pomoSettings = (): PomodoroSettings => ({ ...DEFAULT_POMODORO_SETTINGS, ...store.pref<Partial<PomodoroSettings>>(PREF.pomodoroSettings, {}) });

const minutesFor = (p: PomodoroPhase, s: PomodoroSettings) => (p === 'short' ? s.short : p === 'long' ? s.long : s.focus);

export const remaining = (s: PomodoroState, now = Date.now()) =>
  s.endsAt ? Math.max(0, s.endsAt - now) : s.pausedRemaining ?? s.duration;

export const isRunning = (s: PomodoroState) => s.phase !== 'idle' && s.endsAt !== null;
export const isPaused = (s: PomodoroState) => s.phase !== 'idle' && s.endsAt === null;

export function clock(ms: number) {
  const total = Math.ceil(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

async function save(s: PomodoroState) {
  const prev = pomoState();
  await store.setPref(PREF.pomodoro, s);
  // Aviso push al terminar el bloque, aunque la app esté cerrada.
  if (s.endsAt && s.phase !== 'idle') {
    if (s.endsAt !== prev.endsAt || s.phase !== prev.phase) schedulePush('pomodoro', s.endsAt, s.phase === 'focus' ? 'Terminó el foco' : 'Terminó el descanso', s.phase === 'focus' ? 'Tomate un descanso.' : 'Volvamos al foco.', '/pomodoro');
  } else if (prev.endsAt) cancelPush('pomodoro');
}

function maybeIosTimer(ms: number) {
  const st = { ...DEFAULT_SETTINGS, ...store.pref<Partial<Settings>>(PREF.settings, {}) };
  if (st.iosTimerShortcut) runShortcut(SHORTCUT_NAMES.timer, String(Math.round(ms / 60000)));
}

export async function startFocus(opts: { label?: string; taskId?: string | null } = {}) {
  const s = pomoState();
  const cfg = pomoSettings();
  const now = Date.now();
  const next: PomodoroState = { ...s };
  if (opts.label !== undefined) next.label = opts.label;
  if (opts.taskId !== undefined) {
    next.taskId = opts.taskId;
    const t = opts.taskId ? store.get('task', opts.taskId) : undefined;
    if (t && opts.label === undefined) next.label = t.title;
  }
  if (s.phase === 'focus' && s.endsAt) return save(next);
  if (s.phase === 'focus' && s.pausedRemaining) {
    next.endsAt = now + s.pausedRemaining;
  } else {
    next.phase = 'focus';
    next.duration = cfg.focus * 60_000;
    next.endsAt = now + next.duration;
    next.startedAt = now;
  }
  next.pausedRemaining = null;
  await save(next);
  maybeIosTimer(next.endsAt! - now);
}

export async function pause() {
  const s = pomoState();
  if (!isRunning(s)) return;
  await save({ ...s, pausedRemaining: remaining(s), endsAt: null });
}

export async function resume() {
  const s = pomoState();
  if (!isPaused(s)) return;
  const now = Date.now();
  const rem = s.pausedRemaining ?? s.duration;
  await save({ ...s, endsAt: now + rem, pausedRemaining: null, startedAt: s.startedAt ?? now });
  maybeIosTimer(rem);
}

export async function toggle() {
  const s = pomoState();
  if (s.phase === 'idle') return startFocus();
  return isRunning(s) ? pause() : resume();
}

export async function stop() {
  const s = pomoState();
  if (s.phase === 'focus' && s.startedAt) {
    const elapsed = s.duration - remaining(s);
    if (elapsed >= 60_000) await logFocus(s.startedAt, Date.now(), Math.round(elapsed / 60_000), s.label || 'Foco', s.taskId);
  }
  await save({ ...DEFAULT_POMODORO_STATE, label: s.label, taskId: s.taskId, duration: pomoSettings().focus * 60_000 });
}

export async function skip() {
  await save(await advance(pomoState(), Date.now(), false, true));
}

/** Avanza la fase si terminó. Devuelve la fase que terminó (para avisar), o null. */
export async function reconcile(now = Date.now()): Promise<PomodoroPhase | null> {
  let s = pomoState();
  let finished: PomodoroPhase | null = null;
  let guard = 0;
  while (s.endsAt && s.endsAt <= now && s.phase !== 'idle' && guard < 12) {
    finished = s.phase;
    s = await advance(s, s.endsAt, true, null);
    guard++;
  }
  if (finished) await save(s);
  return finished;
}

async function advance(s: PomodoroState, at: number, completed: boolean, autoStart: boolean | null): Promise<PomodoroState> {
  const cfg = pomoSettings();
  const next: PomodoroState = { ...s };
  if (s.phase === 'focus') {
    if (completed && s.startedAt) {
      await logFocus(s.startedAt, at, Math.round(s.duration / 60_000), s.label || 'Foco', s.taskId);
      if (cfg.habitId) await incrementHabit(cfg.habitId, todayISO());
    }
    next.completedInCycle = completed ? s.completedInCycle + 1 : s.completedInCycle;
    next.phase = next.completedInCycle > 0 && next.completedInCycle % Math.max(1, cfg.rounds) === 0 ? 'long' : 'short';
    configure(next, cfg, at, autoStart ?? cfg.autoBreaks);
  } else if (s.phase === 'short' || s.phase === 'long') {
    if (s.phase === 'long') next.completedInCycle = 0;
    next.phase = 'focus';
    configure(next, cfg, at, autoStart ?? cfg.autoFocus);
  }
  return next;
}

function configure(s: PomodoroState, cfg: PomodoroSettings, at: number, running: boolean) {
  s.duration = minutesFor(s.phase, cfg) * 60_000;
  if (running) {
    s.startedAt = at;
    s.endsAt = at + s.duration;
    s.pausedRemaining = null;
  } else {
    s.startedAt = null;
    s.endsAt = null;
    s.pausedRemaining = s.duration;
  }
}

export function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.25, 0.5].forEach((t, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = [660, 880, 990][i];
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.4);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.45);
    });
  } catch {
    /* no-op */
  }
}
