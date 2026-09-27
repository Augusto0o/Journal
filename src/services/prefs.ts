import type { EnglishSettings, Appearance, HomeLayout, PomodoroSettings, PomodoroState, Preset, Settings } from '@/types';

export const DEFAULT_APPEARANCE: Appearance = {
  preset: 'minimal',
  theme: 'dark',
  accent: 'blue',
  font: 'system',
  fontInInterface: false,
  fontSize: 18,
  weight: 400,
  lineHeight: 1.55,
  radius: 18,
  backdrop: 'plain',
  paper: 'plain',
  cardStyle: 'flat',
  justify: false,
  ligatures: true,
  readerTheme: 'app',
  editorWidth: 'medium',
};

export function presetAppearance(p: Preset): Appearance {
  const a: Appearance = { ...DEFAULT_APPEARANCE, preset: p };
  switch (p) {
    case 'paper':
      return { ...a, font: 'iowan', backdrop: 'warm', paper: 'lined', accent: 'amber', readerTheme: 'sepia', radius: 14 };
    case 'dark':
      return { ...a, theme: 'dark', accent: 'indigo', backdrop: 'cool', font: 'newYork', cardStyle: 'bordered' };
    case 'focus':
      return { ...a, font: 'georgia', fontSize: 19, lineHeight: 1.85, cardStyle: 'flat', accent: 'ink', radius: 12, editorWidth: 'narrow' };
    case 'glass':
      return { ...a, backdrop: 'aurora', cardStyle: 'glass', accent: 'violet', font: 'system', radius: 16 };
    default:
      return a;
  }
}

export const PRESETS: { id: Preset; label: string }[] = [
  { id: 'minimal', label: 'Journal' },
  { id: 'paper', label: 'Paper' },
  { id: 'dark', label: 'Dark' },
  { id: 'focus', label: 'Focus' },
  { id: 'glass', label: 'Glass' },
];

export const DEFAULT_HOME: HomeLayout = {
  modules: [
    { id: 'capture', enabled: true },
    { id: 'journal', enabled: true },
    { id: 'tasks', enabled: true },
    { id: 'habits', enabled: true },
    { id: 'reminders', enabled: true },
    { id: 'pomodoro', enabled: true },
    { id: 'english', enabled: true },
    { id: 'week', enabled: false },
    { id: 'notes', enabled: true },
    { id: 'books', enabled: true },
    { id: 'videos', enabled: false },
    { id: 'music', enabled: false },
    { id: 'artwork', enabled: true },
    { id: 'quote', enabled: true },
  ],
  usage: {},
  adaptive: false,
};

export const HOME_LABELS: Record<string, string> = {
  capture: 'Captura rápida',
  journal: 'Journal de hoy',
  tasks: 'Tareas',
  habits: 'Hábitos',
  reminders: 'Recordatorios',
  pomodoro: 'Pomodoro',
  english: 'Inglés',
  week: 'Semana',
  notes: 'Notas recientes',
  books: 'Libros',
  videos: 'Videos',
  music: 'Música',
  artwork: 'Obra del día',
  quote: 'Frase del día',
};

export function normalizeHome(l: HomeLayout): HomeLayout {
  const ids = new Set(l.modules.map((m) => m.id));
  const modules = [...l.modules, ...DEFAULT_HOME.modules.filter((m) => !ids.has(m.id)).map((m) => ({ ...m, enabled: false }))];
  return { ...DEFAULT_HOME, ...l, modules };
}

export function visibleModules(l: HomeLayout) {
  const enabled = l.modules.filter((m) => m.enabled).map((m) => m.id);
  if (!l.adaptive) return enabled;
  const head = enabled.filter((m) => m === 'capture');
  const rest = enabled
    .filter((m) => m !== 'capture')
    .map((m, i) => ({ m, i, u: l.usage[m] ?? 0 }))
    .sort((a, b) => b.u - a.u || a.i - b.i)
    .map((x) => x.m);
  return [...head, ...rest];
}

export const DEFAULT_SETTINGS: Settings = {
  userName: '',
  weekStartsOn: 1,
  dateFormat: 'long',
  aiEnabled: false,
  aiConsentAt: null,
  aiProvider: 'auto',
  onboarded: false,
  iosReminderShortcut: false,
  iosTimerShortcut: false,
  lastBackupAt: null,
};

export const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
  focus: 25,
  short: 5,
  long: 15,
  rounds: 4,
  autoBreaks: true,
  autoFocus: false,
  habitId: null,
  sound: true,
};

export const DEFAULT_POMODORO_STATE: PomodoroState = {
  phase: 'idle',
  endsAt: null,
  pausedRemaining: null,
  duration: 25 * 60_000,
  startedAt: null,
  label: '',
  taskId: null,
  completedInCycle: 0,
};

export const DEFAULT_ENGLISH: EnglishSettings = { level: 'A1', newPerDay: 8, rate: 0.9, habitId: null };

export const PREF = {
  english: 'english',
  englishLessons: 'englishCustomLessons',
  appearance: 'appearance',
  home: 'homeLayout',
  settings: 'settings',
  pomodoro: 'pomodoroState',
  pomodoroSettings: 'pomodoroSettings',
  favoriteQuotes: 'favoriteQuotes',
  generator: 'passwordGenerator',
} as const;
