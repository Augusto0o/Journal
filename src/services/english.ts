/**
 * Motor de inglés: voz (TTS), reconocimiento de habla, pronunciación,
 * repetición espaciada (SM-2 simplificado) y registro de sesiones.
 */
import type { CefrLevel, EnglishCard, EnglishLog, EnglishSettings } from '@/types';
import { store } from '@/database/store';
import { DEFAULT_ENGLISH, PREF } from './prefs';
import { incrementHabit } from './actions';
import { todayISO } from '@/utils/date';
import { nowISO, uuid } from '@/utils/misc';
import { addDaysISO } from '@shared/parser.ts';
import { LESSONS, type Lesson, type VocabItem } from './englishLessons';

export const englishSettings = (): EnglishSettings => ({ ...DEFAULT_ENGLISH, ...store.pref<Partial<EnglishSettings>>(PREF.english, {}) });

// ---------------- Voz ----------------

let voiceCache: SpeechSynthesisVoice | null | undefined;
function englishVoice(): SpeechSynthesisVoice | null {
  if (voiceCache !== undefined && voiceCache !== null) return voiceCache;
  const voices = window.speechSynthesis?.getVoices() ?? [];
  const prefer = ['Samantha', 'Ava', 'Allison', 'Karen', 'Daniel', 'Google US English'];
  voiceCache = voices.find((v) => prefer.some((p) => v.name.includes(p)) && v.lang.startsWith('en')) ?? voices.find((v) => v.lang === 'en-US') ?? voices.find((v) => v.lang.startsWith('en')) ?? null;
  return voiceCache;
}

export const ttsAvailable = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Lee un texto en inglés. Resuelve al terminar. */
export function say(text: string, rate = englishSettings().rate): Promise<void> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth) return resolve();
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = englishVoice();
    u.lang = v?.lang ?? 'en-US';
    if (v) u.voice = v;
    u.rate = rate;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    synth.speak(u);
  });
}

export const stopSpeaking = () => window.speechSynthesis?.cancel();

// ---------------- Reconocimiento ----------------

type Recognizer = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

export function recognitionAvailable() {
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/** Escucha en inglés con el reconocimiento del sistema (Safari/Chrome). Devuelve un control para detener. */
export function listenEnglish(onText: (text: string, final: boolean) => void, onEnd: (error?: string) => void) {
  const w = window as unknown as { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) {
    onEnd('unsupported');
    return { stop: () => undefined };
  }
  const r = new Ctor();
  r.lang = 'en-US';
  r.interimResults = true;
  r.maxAlternatives = 1;
  r.continuous = true;
  let text = '';
  r.onresult = (e) => {
    let finalText = '';
    let interim = '';
    for (let i = 0; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) finalText += res[0].transcript;
      else interim += res[0].transcript;
    }
    text = (finalText + interim).trim();
    onText(text, !interim);
  };
  r.onerror = (e) => onEnd(e.error);
  r.onend = () => onEnd();
  r.start();
  return { stop: () => r.stop() };
}

// ---------------- Pronunciación ----------------

const words = (s: string) =>
  s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);

/** Compara lo dicho con la frase objetivo (alineación LCS por palabras). */
export function scorePronunciation(target: string, heard: string) {
  const t = words(target);
  const h = words(heard);
  const dp = Array.from({ length: t.length + 1 }, () => Array(h.length + 1).fill(0));
  for (let i = t.length - 1; i >= 0; i--)
    for (let j = h.length - 1; j >= 0; j--)
      dp[i][j] = t[i] === h[j] || t[i].replace(/'/g, '') === h[j].replace(/'/g, '') ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const matched = new Set<number>();
  let i = 0, j = 0;
  while (i < t.length && j < h.length) {
    if (t[i] === h[j] || t[i].replace(/'/g, '') === h[j].replace(/'/g, '')) { matched.add(i); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  const display = target.split(/\s+/).map((w, k) => ({ word: w, ok: matched.has(k) }));
  const score = t.length ? Math.round((matched.size / t.length) * 100) : 0;
  return { score, display };
}

// ---------------- Repetición espaciada ----------------

export type Grade = 0 | 1 | 2 | 3; // otra vez · difícil · bien · fácil

export function newCard(item: VocabItem, level: CefrLevel, lessonId: string | null = null): EnglishCard {
  const now = nowISO();
  return { id: uuid(), kind: 'card', createdAt: now, updatedAt: now, deletedAt: null, en: item.en, es: item.es, example: item.example, level, lessonId, due: todayISO(), interval: 0, ease: 2.5, reps: 0, lapses: 0 };
}

export function schedule(card: EnglishCard, grade: Grade, today = todayISO()): EnglishCard {
  let { interval, ease, reps, lapses } = card;
  if (grade === 0) {
    lapses++;
    reps = 0;
    interval = 0;
    ease = Math.max(1.3, ease - 0.2);
  } else {
    if (grade === 1) {
      interval = Math.max(1, Math.round(Math.max(1, interval) * 1.2));
      ease = Math.max(1.3, ease - 0.15);
    } else {
      interval = reps === 0 ? (grade === 3 ? 3 : 1) : reps === 1 ? (grade === 3 ? 6 : 3) : Math.round(interval * ease * (grade === 3 ? 1.3 : 1));
      if (grade === 3) ease += 0.15;
    }
    reps++;
  }
  return { ...card, interval, ease: Math.round(ease * 100) / 100, reps, lapses, due: addDaysISO(today, interval) };
}

/** Intervalo que produciría cada respuesta (para mostrar en los botones). */
export function previewIntervals(card: EnglishCard): string[] {
  return ([0, 1, 2, 3] as Grade[]).map((g) => {
    const d = schedule(card, g).interval;
    return d === 0 ? 'hoy' : d === 1 ? '1 día' : d < 30 ? `${d} días` : `${Math.round(d / 30)} m`;
  });
}

export async function reviewCard(card: EnglishCard, grade: Grade) {
  await store.put(schedule(card, grade));
}

export function dueCards(cards: EnglishCard[], today = todayISO()) {
  return cards.filter((c) => c.due <= today).sort((a, b) => a.due.localeCompare(b.due) || a.reps - b.reps);
}

/** Agrega al mazo las palabras de una lección que todavía no estén. */
export async function addLessonCards(lesson: Pick<Lesson, 'id' | 'level' | 'vocab'>) {
  const have = new Set(store.getSnapshot().card.map((c) => c.en.toLowerCase()));
  const fresh = lesson.vocab.filter((v) => !have.has(v.en.toLowerCase())).map((v) => newCard(v, lesson.level, lesson.id));
  if (fresh.length) await store.put(fresh);
  return fresh.length;
}

export async function addCard(item: VocabItem, level: CefrLevel) {
  const exists = store.getSnapshot().card.find((c) => c.en.toLowerCase() === item.en.trim().toLowerCase());
  if (exists) return false;
  await store.put(newCard({ en: item.en.trim(), es: item.es.trim(), example: item.example.trim() }, level));
  return true;
}

export async function deleteCard(id: string) {
  await store.remove(id);
}

// ---------------- Sesiones y progreso ----------------

export async function logSession(p: { lessonId: string; title: string; level: CefrLevel; minutes: number; score: number; mode: EnglishLog['mode'] }) {
  const now = nowISO();
  const rec: EnglishLog = { id: uuid(), kind: 'lesson', createdAt: now, updatedAt: now, deletedAt: null, date: todayISO(), ...p };
  await store.put(rec);
  const habitId = englishSettings().habitId;
  const alreadyToday = store.getSnapshot().lesson.filter((l) => l.date === rec.date).length > 1;
  if (habitId && !alreadyToday) await incrementHabit(habitId, rec.date);
}

export function englishStats(logs: EnglishLog[], cards: EnglishCard[], today = todayISO()) {
  const days = new Set(logs.map((l) => l.date));
  let streak = 0;
  let cursor = days.has(today) ? today : addDaysISO(today, -1);
  while (days.has(cursor)) {
    streak++;
    cursor = addDaysISO(cursor, -1);
  }
  return {
    streak,
    minutes: logs.reduce((a, l) => a + l.minutes, 0),
    lessonsDone: new Set(logs.filter((l) => l.mode === 'lesson').map((l) => l.lessonId)),
    learned: cards.filter((c) => c.reps > 0).length,
    mastered: cards.filter((c) => c.interval >= 21).length,
    todayDone: logs.some((l) => l.date === today),
  };
}

// ---------------- Lecciones propias (generadas con IA) ----------------

export const customLessons = (): Lesson[] => store.pref<Lesson[]>(PREF.englishLessons, []);

export async function saveCustomLesson(l: Lesson) {
  await store.setPref(PREF.englishLessons, [l, ...customLessons().filter((x) => x.id !== l.id)].slice(0, 40));
}

export async function deleteCustomLesson(id: string) {
  await store.setPref(PREF.englishLessons, customLessons().filter((x) => x.id !== id));
}

export const findLesson = (id: string) => LESSONS.find((l) => l.id === id) ?? customLessons().find((l) => l.id === id);

/** Próxima lección sugerida: la primera sin completar del nivel elegido. */
export function nextLesson(level: CefrLevel, done: Set<string>): Lesson {
  const pool = [...customLessons().filter((l) => l.level === level), ...LESSONS.filter((l) => l.level === level)];
  return pool.find((l) => !done.has(l.id)) ?? pool[0] ?? LESSONS[0];
}
