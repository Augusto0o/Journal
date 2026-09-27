export * from '@shared/types.ts';
import type { PaperStyle } from '@shared/types.ts';

// ---------------- Apariencia ----------------

export type ThemePref = 'light' | 'dark' | 'system';
export type Accent = 'crimson' | 'terracotta' | 'ink' | 'indigo' | 'violet' | 'blue' | 'teal' | 'green' | 'amber' | 'rose';
export type ContentFont = 'system' | 'newYork' | 'georgia' | 'iowan' | 'avenir' | 'rounded' | 'mono';
export type Weight = 300 | 400 | 500 | 600;
export type CardStyle = 'flat' | 'bordered' | 'elevated' | 'glass';
export type Backdrop = 'plain' | 'warm' | 'cool' | 'aurora';
export type ReaderTheme = 'app' | 'white' | 'sepia' | 'night';
export type Preset = 'minimal' | 'paper' | 'dark' | 'focus' | 'glass' | 'custom';

export interface Appearance {
  preset: Preset;
  theme: ThemePref;
  accent: Accent;
  font: ContentFont;
  fontInInterface: boolean;
  /** Tamaño base del contenido en px. */
  fontSize: number;
  weight: Weight;
  lineHeight: number;
  radius: number;
  backdrop: Backdrop;
  paper: PaperStyle;
  cardStyle: CardStyle;
  justify: boolean;
  ligatures: boolean;
  readerTheme: ReaderTheme;
  editorWidth: 'narrow' | 'medium' | 'wide';
}

// ---------------- Inicio ----------------

export type HomeModule = 'capture' | 'journal' | 'tasks' | 'habits' | 'reminders' | 'pomodoro' | 'english' | 'week' | 'notes' | 'books' | 'videos' | 'music' | 'artwork' | 'quote';

export interface HomeLayout {
  modules: { id: HomeModule; enabled: boolean }[];
  usage: Partial<Record<HomeModule, number>>;
  adaptive: boolean;
}

// ---------------- Ajustes ----------------

export type AIProvider = 'auto' | 'gemini' | 'groq' | 'anthropic';

export interface Settings {
  userName: string;
  weekStartsOn: 0 | 1;
  dateFormat: 'long' | 'short' | 'numeric';
  aiEnabled: boolean;
  aiConsentAt: string | null;
  aiProvider: AIProvider;
  onboarded: boolean;
  /** Abrir el Atajo de iOS para crear recordatorios nativos. */
  iosReminderShortcut: boolean;
  /** Iniciar también el temporizador de iOS al empezar un Pomodoro. */
  iosTimerShortcut: boolean;
  lastBackupAt: string | null;
}

// ---------------- Pomodoro ----------------

export type PomodoroPhase = 'idle' | 'focus' | 'short' | 'long';

export interface PomodoroSettings {
  focus: number;
  short: number;
  long: number;
  rounds: number;
  autoBreaks: boolean;
  autoFocus: boolean;
  habitId: string | null;
  sound: boolean;
}

export interface PomodoroState {
  phase: PomodoroPhase;
  endsAt: number | null;
  pausedRemaining: number | null;
  duration: number;
  startedAt: number | null;
  label: string;
  taskId: string | null;
  completedInCycle: number;
}

export interface Quote {
  text: string;
  author: string;
  context: string;
  meaning: string;
}

export type DateFormat = 'long' | 'short' | 'numeric';

export interface EnglishSettings {
  level: import('@shared/types.ts').CefrLevel;
  /** Tarjetas nuevas por día. */
  newPerDay: number;
  /** Velocidad de la voz (0.6–1.1). */
  rate: number;
  /** Hábito que se suma al completar una sesión. */
  habitId: string | null;
}
