/**
 * Capa de IA transversal. Todas las llamadas van a la Edge Function `ai` de tu Supabase,
 * que usa un proveedor GRATUITO (Gemini o Groq) o Claude si configuras su clave.
 * Las claves viven en el servidor; nunca en el teléfono.
 */
import type { Priority } from '@/types';
import type { CaptureSuggestion } from '@shared/parser.ts';
import { store } from '@/database/store';
import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import { syncStatusStore } from './sync';
import { DEFAULT_SETTINGS, PREF } from './prefs';
import { todayISO } from '@/utils/date';
import type { CefrLevel, MapType, Settings } from '@/types';
import type { TreeNode } from './maps';
import type { Lesson } from './englishLessons';

export type TextAction = 'summarize' | 'simplify' | 'reformulate' | 'correct' | 'structure' | 'explain' | 'translate_en' | 'translate_es';

export const TEXT_ACTIONS: { id: TextAction; label: string; detail: string }[] = [
  { id: 'summarize', label: 'Resumir', detail: 'Las ideas principales en pocas líneas' },
  { id: 'simplify', label: 'Simplificar', detail: 'Explicado de forma sencilla' },
  { id: 'reformulate', label: 'Reformular', detail: 'Más claro, mismo significado' },
  { id: 'correct', label: 'Corregir', detail: 'Ortografía, gramática y puntuación' },
  { id: 'structure', label: 'Estructurar', detail: 'Títulos, listas e ideas principales' },
  { id: 'explain', label: 'Explicar', detail: 'Como si fuera principiante' },
  { id: 'translate_en', label: 'Pasar a inglés', detail: 'Traducción natural' },
  { id: 'translate_es', label: 'Pasar a español', detail: 'Traducción natural' },
];

export const REPLACES: TextAction[] = ['simplify', 'reformulate', 'correct', 'structure', 'translate_en', 'translate_es'];

export interface AITask {
  title: string;
  dueDate: string | null;
  dueTime: string | null;
  priority: Priority;
}

export interface VoiceAnalysis {
  summary: string;
  ideas: string[];
  tasks: AITask[];
  dates: string[];
  people: string[];
  places: string[];
  decisions: string[];
}

export class AIUnavailable extends Error {}

function settings(): Settings {
  return { ...DEFAULT_SETTINGS, ...store.pref<Partial<Settings>>(PREF.settings, {}) };
}

export function aiProblem(): string | null {
  if (!isSupabaseConfigured()) return 'Conecta tu Supabase en Ajustes → Sincronización para usar la IA.';
  if (!syncStatusStore.getSnapshot().userId) return 'Inicia sesión en Ajustes → Sincronización para usar la IA.';
  if (!settings().aiEnabled) return 'Activa la IA en Ajustes → IA.';
  if (!navigator.onLine) return 'La IA necesita conexión a internet.';
  return null;
}

export const aiAvailable = () => aiProblem() === null;

async function call<T = Record<string, unknown>>(action: string, payload: Record<string, unknown>): Promise<T> {
  const problem = aiProblem();
  if (problem) throw new AIUnavailable(problem);
  const sb = await getSupabase();
  if (!sb) throw new AIUnavailable('Supabase no está configurado.');
  const { data, error } = await sb.functions.invoke('ai', {
    body: {
      action,
      provider: settings().aiProvider,
      today: todayISO(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...payload,
    },
  });
  if (error) {
    let msg = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) msg = ((await ctx.json()) as { error?: string }).error ?? msg;
    } catch {
      /* no-op */
    }
    throw new Error(msg || 'La IA no respondió.');
  }
  if (data && typeof data === 'object' && 'error' in data) throw new Error(String((data as { error: unknown }).error));
  return data as T;
}

export async function transform(action: TextAction, text: string): Promise<string> {
  const r = await call<{ text: string }>(action, { text: text.slice(0, 24000) });
  if (!r.text?.trim()) throw new Error('Respuesta vacía de la IA.');
  return r.text.trim();
}

export async function extractTasks(text: string): Promise<AITask[]> {
  const r = await call<{ tasks: AITask[] }>('extract_tasks', { text });
  return (r.tasks ?? []).filter((t) => t.title?.trim()).map((t) => ({
    title: t.title.trim(),
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate ?? '') ? t.dueDate : null,
    dueTime: /^\d{2}:\d{2}$/.test(t.dueTime ?? '') ? t.dueTime : null,
    priority: ([0, 1, 2, 3].includes(Number(t.priority)) ? Number(t.priority) : 0) as Priority,
  }));
}

export async function classify(text: string): Promise<CaptureSuggestion> {
  const r = await call<CaptureSuggestion>('classify', { text });
  return { type: r.type ?? 'note', category: r.category ?? null, title: r.title ?? null };
}

export async function semanticSearch(query: string, docs: { id: string; type: string; title: string; date: string; excerpt: string }[]) {
  return call<{ ids: string[]; answer: string }>('search', { text: query, documents: docs.slice(0, 160) });
}

export async function analyzeVoice(transcript: string): Promise<VoiceAnalysis> {
  const r = await call<Partial<VoiceAnalysis>>('voice_extract', { text: transcript });
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  return {
    summary: r.summary ?? '',
    ideas: arr(r.ideas),
    tasks: (r.tasks ?? []).filter((t) => t?.title),
    dates: arr(r.dates),
    people: arr(r.people),
    places: arr(r.places),
    decisions: arr(r.decisions),
  };
}

/** Voz → texto (Whisper en Groq o Gemini). Requiere conexión. */
export async function transcribe(audio: Blob, language?: 'es' | 'en'): Promise<string> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] ?? '');
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(audio);
  });
  const r = await call<{ text: string }>('transcribe', { text: 'audio', audio: base64, mimeType: audio.type || 'audio/mp4', language });
  return r.text?.trim() ?? '';
}

// ---------------- Inglés ----------------


export interface EnglishCorrection {
  corrected: string;
  changes: { type: 'grammar' | 'vocabulary' | 'spelling' | 'naturalness'; original: string; fix: string; note: string }[];
  score: number;
  comment: string;
}

export interface SpeakingFeedback extends EnglishCorrection {
  fluency: string;
}

export interface DayInEnglish {
  model: string;
  vocab: { en: string; es: string; example: string }[];
  prompts: string[];
}

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export async function correctEnglish(text: string, level: CefrLevel): Promise<EnglishCorrection> {
  const r = await call<Partial<EnglishCorrection>>('english_correct', { text, level });
  return { corrected: r.corrected ?? text, changes: arr(r.changes), score: Number(r.score ?? 0), comment: r.comment ?? '' };
}

export async function speakingFeedback(transcript: string, prompt: string, level: CefrLevel): Promise<SpeakingFeedback> {
  const r = await call<Partial<SpeakingFeedback>>('english_speaking', { text: transcript, prompt, level });
  return { corrected: r.corrected ?? transcript, changes: arr(r.changes), score: Number(r.score ?? 0), comment: r.comment ?? '', fluency: r.fluency ?? '' };
}

export async function dayInEnglish(journalText: string, level: CefrLevel): Promise<DayInEnglish> {
  const r = await call<Partial<DayInEnglish>>('english_day', { text: journalText, level });
  return { model: r.model ?? '', vocab: arr(r.vocab), prompts: arr<string>(r.prompts) };
}

export async function generateLesson(topic: string, level: CefrLevel): Promise<Lesson> {
  const r = await call<Partial<Lesson>>('english_lesson', { text: topic, level });
  if (!r.vocab?.length || !r.dialogue?.length) throw new Error('La IA no devolvió una lección completa. Probá de nuevo.');
  return {
    id: `ai-${Date.now().toString(36)}`,
    level,
    title: r.title ?? topic,
    topic: r.topic ?? topic,
    minutes: Number(r.minutes ?? 8),
    vocab: arr(r.vocab),
    grammar: { title: r.grammar?.title ?? '', explain: r.grammar?.explain ?? '', examples: arr(r.grammar?.examples), exercises: arr(r.grammar?.exercises) },
    dialogue: arr(r.dialogue),
    questions: arr(r.questions),
    speak: arr(r.speak),
  };
}

// ---------------- Transformación visual ----------------


export interface VisualResult {
  type: MapType;
  title: string;
  nodes: TreeNode[];
  edges: { from: string; to: string; label?: string | null }[];
}

export async function visualize(text: string, type: MapType | 'auto'): Promise<VisualResult> {
  const r = await call<Partial<VisualResult>>('visualize', { text: text.slice(0, 20000), mapType: type });
  const nodes = arr<TreeNode>(r.nodes).filter((n) => n && n.id && n.text).map((n) => ({ id: String(n.id), text: String(n.text).slice(0, 90), parent: n.parent ? String(n.parent) : null }));
  if (!nodes.length) throw new Error('La IA no devolvió nodos.');
  const t = (['mind', 'concept', 'system', 'flow'] as MapType[]).includes(r.type as MapType) ? (r.type as MapType) : type === 'auto' ? 'mind' : type;
  return { type: t, title: r.title ?? nodes[0].text, nodes, edges: arr(r.edges) };
}

// ---------------- Documentos, imágenes y asistente ----------------

export async function askDocument(question: string, context: string): Promise<{ answer: string; quotes: string[] }> {
  const r = await call<{ answer?: string; quotes?: string[] }>('ask', { text: question, context: context.slice(0, 60000) });
  return { answer: r.answer ?? '', quotes: arr<string>(r.quotes) };
}

export async function analyzeImage(dataUrl: string, prompt = ''): Promise<string> {
  const [meta, data] = dataUrl.split(',');
  const mimeType = meta.match(/data:(.*?);/)?.[1] ?? 'image/jpeg';
  const r = await call<{ text: string }>('image', { text: prompt || 'Describí y analizá la imagen', image: data, mimeType });
  return r.text ?? '';
}

export interface AssistantAction {
  type: 'create_task' | 'create_reminder' | 'create_note' | 'create_map' | 'search' | 'open';
  title?: string;
  text?: string;
  date?: string | null;
  time?: string | null;
  mapType?: MapType;
  query?: string;
  path?: string;
}

export async function assistant(messages: { role: 'user' | 'assistant'; content: string }[], context: string): Promise<{ reply: string; actions: AssistantAction[] }> {
  const r = await call<{ reply?: string; actions?: AssistantAction[] }>('assistant', { text: messages[messages.length - 1]?.content ?? '', messages: messages.slice(-12), context: context.slice(0, 40000) });
  return { reply: r.reply ?? '', actions: arr<AssistantAction>(r.actions) };
}

export interface RecItem {
  title: string;
  creator: string;
  genre?: string;
  why?: string;
  category?: string;
  year?: string;
}

export async function recommend(kind: 'music' | 'books' | 'videos' | 'topics' | 'movies', profile: string): Promise<RecItem[]> {
  const r = await call<{ items?: RecItem[] }>('recommend', { text: profile, mediaKind: kind });
  return arr<RecItem>(r.items).filter((x) => x && x.title);
}

/** Proxy de solo lectura a TMDB a través de tu función (necesita TMDB_API_KEY en Supabase). */
export async function tmdb<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  return call<T>('tmdb', { path, params });
}

/** De qué trata un libro o una película (resumen sin spoilers + a quién le puede gustar). */
export async function aboutWork(kind: 'libro' | 'película', title: string, creator: string, year?: string | null, synopsis?: string) {
  const text = `${kind === 'libro' ? 'Libro' : 'Película'}: «${title}»${creator ? ` de ${creator}` : ''}${year ? ` (${year})` : ''}.${synopsis ? `\nSinopsis: ${synopsis.slice(0, 2000)}` : ''}`;
  return call<{ summary: string; forWho?: string }>('about', { text });
}
