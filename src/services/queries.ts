/** Consultas puras sobre los registros (sin dependencia del almacenamiento). */
import type { DocFile, Habit, JournalEntry, MediaItem, MindMap, Note, Reminder, Task } from '@/types';
import { addDaysISO, normalize, weekdayISO } from '@shared/parser.ts';
import { todayISO, toISODate } from '@/utils/date';
import { htmlToText } from '@/utils/html';

export const nowHM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const parseCtx = () => ({ today: todayISO(), now: nowHM() });

// ---------------- Tareas ----------------

export type Bucket = 'inbox' | 'today' | 'upcoming' | 'done';

export function bucketOf(t: Task, today = todayISO()): Bucket {
  if (t.isDone) return 'done';
  if (!t.dueDate) return 'inbox';
  return t.dueDate <= today ? 'today' : 'upcoming';
}

export function isOverdue(t: Task, today = todayISO(), now = nowHM()): boolean {
  if (t.isDone || !t.dueDate) return false;
  if (t.dueDate < today) return true;
  return t.dueDate === today && !!t.dueTime && t.dueTime < now;
}

export function sortTasks(list: Task[]): Task[] {
  return [...list].sort((a, b) => {
    if (a.isDone !== b.isDone) return a.isDone ? 1 : -1;
    if (a.isDone) return (b.completedAt ?? '').localeCompare(a.completedAt ?? '');
    if ((a.dueDate ?? '9') !== (b.dueDate ?? '9')) return (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (!!a.dueTime !== !!b.dueTime) return a.dueTime ? -1 : 1;
    if (a.dueTime && b.dueTime && a.dueTime !== b.dueTime) return a.dueTime.localeCompare(b.dueTime);
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function reminderKey(r: Reminder) {
  return `${r.date}T${r.time}`;
}

export function isReminderOverdue(r: Reminder, today = todayISO(), now = nowHM()) {
  return !r.isDone && reminderKey(r) < `${today}T${now}`;
}

// ---------------- Repetición ----------------

export function nextDate(date: string, repeat: Task['repeat']): string | null {
  switch (repeat) {
    case 'daily':
      return addDaysISO(date, 1);
    case 'weekly':
      return addDaysISO(date, 7);
    case 'weekdays': {
      let d = addDaysISO(date, 1);
      while ([0, 6].includes(weekdayISO(d))) d = addDaysISO(d, 1);
      return d;
    }
    case 'monthly': {
      const [y, m, day] = date.split('-').map(Number);
      const last = new Date(y, m + 1, 0).getDate();
      return toISODate(new Date(y, m, Math.min(day, last), 12));
    }
    case 'yearly': {
      const [y, m, day] = date.split('-').map(Number);
      return toISODate(new Date(y + 1, m - 1, day, 12));
    }
    default:
      return null;
  }
}

// ---------------- Hábitos ----------------

export const habitCount = (h: Habit, day: string) => h.log[day] ?? 0;
export const habitDone = (h: Habit, day: string) => habitCount(h, day) >= h.target;
export const habitProgress = (h: Habit, day: string) => Math.min(1, habitCount(h, day) / Math.max(1, h.target));

export function habitScheduled(h: Habit, day: string): boolean {
  if (h.schedule.type === 'weekdays') return h.schedule.days.includes(weekdayISO(day));
  return true;
}

export function weekOf(day: string, weekStartsOn: 0 | 1 = 1): string[] {
  const wd = weekdayISO(day);
  const offset = (wd - weekStartsOn + 7) % 7;
  const start = addDaysISO(day, -offset);
  return Array.from({ length: 7 }, (_, i) => addDaysISO(start, i));
}

export function habitStreak(h: Habit, today = todayISO(), weekStartsOn: 0 | 1 = 1): { value: number; unit: 'días' | 'semanas' } {
  if (h.schedule.type === 'times') {
    const goal = h.schedule.perWeek;
    let weeks = 0;
    let start = weekOf(today, weekStartsOn)[0];
    const doneIn = (s: string) => Array.from({ length: 7 }, (_, i) => addDaysISO(s, i)).filter((d) => habitDone(h, d)).length;
    if (doneIn(start) >= goal) weeks++;
    start = addDaysISO(start, -7);
    while (doneIn(start) >= goal && weeks < 520) {
      weeks++;
      start = addDaysISO(start, -7);
    }
    return { value: weeks, unit: 'semanas' };
  }
  const earliest = [h.createdAt.slice(0, 10), ...Object.keys(h.log)].sort()[0] ?? today;
  let cursor = habitDone(h, today) ? today : addDaysISO(today, -1);
  let streak = 0;
  let guard = 0;
  while (cursor >= earliest && guard < 3650) {
    if (habitScheduled(h, cursor)) {
      if (habitDone(h, cursor)) streak++;
      else break;
    }
    cursor = addDaysISO(cursor, -1);
    guard++;
  }
  return { value: streak, unit: 'días' };
}

export function habitBest(h: Habit): number {
  const days = Object.keys(h.log).filter((d) => habitDone(h, d)).sort();
  if (!days.length) return 0;
  let best = 1, cur = 1;
  for (let i = 1; i < days.length; i++) {
    let gap = addDaysISO(days[i - 1], 1);
    while (gap < days[i] && !habitScheduled(h, gap)) gap = addDaysISO(gap, 1);
    cur = gap === days[i] ? cur + 1 : 1;
    best = Math.max(best, cur);
  }
  return best;
}

export function habitRate(h: Habit, days = 30, today = todayISO()): number {
  const created = [h.createdAt.slice(0, 10), ...Object.keys(h.log)].sort()[0];
  let d = addDaysISO(today, -(days - 1));
  if (d < created) d = created;
  let scheduled = 0, done = 0;
  while (d <= today) {
    if (habitScheduled(h, d)) {
      scheduled++;
      if (habitDone(h, d)) done++;
    }
    d = addDaysISO(d, 1);
  }
  if (h.schedule.type === 'times') return Math.min(1, done / (Math.max(1, days / 7) * h.schedule.perWeek));
  return scheduled ? done / scheduled : 0;
}

export function scheduleLabel(h: Habit): string {
  const s = h.schedule;
  if (s.type === 'daily') return 'Cada día';
  if (s.type === 'times') return `${s.perWeek} veces por semana`;
  const names = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
  return [1, 2, 3, 4, 5, 6, 0].filter((d) => s.days.includes(d)).map((d) => names[d]).join(' ');
}

// ---------------- Journal ----------------

export function journalStreak(entries: JournalEntry[], today = todayISO()): number {
  const days = new Set(entries.map((e) => e.entryDate));
  let cursor = days.has(today) ? today : addDaysISO(today, -1);
  let n = 0;
  while (days.has(cursor)) {
    n++;
    cursor = addDaysISO(cursor, -1);
  }
  return n;
}

export function sortEntries<T extends { entryDate: string; createdAt: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => (a.entryDate !== b.entryDate ? (a.entryDate < b.entryDate ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1));
}

export function docText(d: { id: string; updatedAt: string; content: string }) {
  return htmlToText(d.content, `${d.id}:${d.updatedAt}`);
}

// ---------------- Búsqueda ----------------

export type SearchKind = 'journal' | 'note' | 'task' | 'reminder' | 'habit' | 'quote' | 'map' | 'doc' | 'media';

export interface SearchDoc {
  kind: SearchKind;
  id: string;
  title: string;
  body: string;
  tags: string[];
  date: string | null;
}

export interface SearchHit extends SearchDoc {
  score: number;
  snippet: string;
}

export interface DateIntent {
  from: string;
  to: string;
  label: string;
}

const STOP = new Set(('el la los las un una unos unas de del al a en y o que por para con sin sobre donde cuando como habia hable escribi ' +
  'escrito algo mi mis me lo le se es fue era tema cosas semana pasada mes ayer hoy este esta ese esa hace dias anterior ultimo ultima todo todos').split(' '));

const SYN: Record<string, string[]> = {
  programacion: ['programar', 'codigo', 'code', 'javascript', 'python', 'swift', 'app', 'desarrollo'],
  programar: ['programacion', 'codigo', 'desarrollo'],
  ejercicio: ['gym', 'gimnasio', 'entrenar', 'correr', 'deporte'],
  gym: ['gimnasio', 'entrenar', 'ejercicio'],
  trabajo: ['laburo', 'oficina', 'cliente', 'proyecto', 'reunion'],
  proyecto: ['proyectos', 'idea', 'app'],
  ingles: ['english', 'vocabulario', 'speaking'],
  dinero: ['plata', 'pago', 'gastos', 'finanzas', 'contador'],
  salud: ['medico', 'dormir', 'sueno', 'ejercicio'],
  familia: ['mama', 'papa', 'hermano', 'hermana', 'hijos'],
  libro: ['libros', 'leer', 'lectura'],
  leer: ['lectura', 'libro', 'libros'],
};

const MONTHS_N = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function dateIntent(query: string, today = todayISO(), weekStartsOn: 0 | 1 = 1): DateIntent | null {
  const q = normalize(query);
  const week = weekOf(today, weekStartsOn);
  if (q.includes('semana pasada')) return { from: addDaysISO(week[0], -7), to: addDaysISO(week[0], -1), label: 'La semana pasada' };
  if (q.includes('esta semana')) return { from: week[0], to: week[6], label: 'Esta semana' };
  const [y, m] = today.split('-').map(Number);
  const monthRange = (yy: number, mm: number) => {
    const last = new Date(yy, mm, 0).getDate();
    return { from: `${yy}-${String(mm).padStart(2, '0')}-01`, to: `${yy}-${String(mm).padStart(2, '0')}-${last}` };
  };
  if (q.includes('mes pasado')) {
    const mm = m === 1 ? 12 : m - 1;
    const yy = m === 1 ? y - 1 : y;
    return { ...monthRange(yy, mm), label: 'El mes pasado' };
  }
  if (q.includes('este mes')) return { ...monthRange(y, m), label: 'Este mes' };
  if (/\bayer\b/.test(q)) return { from: addDaysISO(today, -1), to: addDaysISO(today, -1), label: 'Ayer' };
  if (/\bhoy\b/.test(q)) return { from: today, to: today, label: 'Hoy' };
  const hace = q.match(/hace (\d+) dias/);
  if (hace) {
    const n = +hace[1];
    return { from: addDaysISO(today, -n - 1), to: addDaysISO(today, -n + 1), label: `Hace ${n} días` };
  }
  if (q.includes('ultimos dias')) return { from: addDaysISO(today, -6), to: today, label: 'Últimos días' };
  for (let i = 0; i < 12; i++) {
    if (new RegExp(`\\b${MONTHS_N[i]}\\b`).test(q)) {
      const yy = i + 1 > m ? y - 1 : y;
      return { ...monthRange(yy, i + 1), label: MONTHS_N[i][0].toUpperCase() + MONTHS_N[i].slice(1) };
    }
  }
  return null;
}

export function searchTerms(query: string): string[] {
  return Array.from(new Set(normalize(query).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1 && !STOP.has(w))));
}

function snippet(text: string, terms: string[], radius = 70): string {
  const flat = text.replace(/\n+/g, ' ');
  const norm = normalize(flat);
  let idx = -1;
  for (const t of terms) {
    const i = norm.indexOf(t);
    if (i >= 0 && (idx < 0 || i < idx)) idx = i;
  }
  if (idx < 0 || norm.length !== flat.length) return flat.slice(0, radius * 2) + (flat.length > radius * 2 ? '…' : '');
  const s = Math.max(0, idx - radius);
  const e = Math.min(flat.length, idx + radius);
  return (s > 0 ? '…' : '') + flat.slice(s, e) + (e < flat.length ? '…' : '');
}

export function search(query: string, docs: SearchDoc[], weekStartsOn: 0 | 1 = 1): { hits: SearchHit[]; intent: DateIntent | null } {
  const intent = dateIntent(query, todayISO(), weekStartsOn);
  const base = searchTerms(query);
  const expanded = new Map<string, number>();
  for (const t of base) {
    expanded.set(t, 1);
    if (t.length > 5) expanded.set(t.slice(0, -2), Math.max(expanded.get(t.slice(0, -2)) ?? 0, 0.7));
    for (const e of SYN[t] ?? []) expanded.set(e, Math.max(expanded.get(e) ?? 0, 0.5));
  }
  const hits: SearchHit[] = [];
  for (const d of docs) {
    if (intent && (!d.date || d.date < intent.from || d.date > intent.to)) continue;
    const title = normalize(d.title);
    const body = normalize(d.body);
    const tags = normalize(d.tags.join(' '));
    let score = 0;
    let matchedBase = 0;
    for (const [term, w] of expanded) {
      let hit = false;
      if (title.includes(term)) { score += 3 * w; hit = true; }
      if (tags.includes(term)) { score += 2 * w; hit = true; }
      if (body.includes(term)) { score += w * Math.min(3, body.split(term).length - 1); hit = true; }
      if (hit && w === 1) matchedBase++;
    }
    if (!base.length) {
      if (!intent) continue;
      score = 1;
    } else {
      if (score <= 0) continue;
      score *= 1 + matchedBase / base.length;
    }
    hits.push({ ...d, score, snippet: snippet(d.body, [...expanded.keys()]) });
  }
  hits.sort((a, b) => b.score - a.score || (b.date ?? '').localeCompare(a.date ?? ''));
  return { hits: hits.slice(0, 80), intent };
}

export function buildDocs(data: { journal: JournalEntry[]; note: Note[]; task: Task[]; reminder: Reminder[]; habit: Habit[]; map?: MindMap[]; doc?: DocFile[]; media?: MediaItem[] },
  quotes: { text: string; author: string; context: string; meaning: string }[], scope: SearchKind | 'all' = 'all'): SearchDoc[] {
  const docs: SearchDoc[] = [];
  const want = (k: SearchKind) => scope === 'all' || scope === k;
  if (want('journal')) for (const e of data.journal) docs.push({ kind: 'journal', id: e.id, title: e.title || '', body: docText(e), tags: e.tags, date: e.entryDate });
  if (want('note')) for (const n of data.note) docs.push({ kind: 'note', id: n.id, title: n.title || '', body: docText(n) + ' ' + (n.url ?? ''), tags: [...n.tags, n.category ?? '', n.noteType], date: n.updatedAt.slice(0, 10) });
  if (want('task')) for (const t of data.task) docs.push({ kind: 'task', id: t.id, title: t.title, body: t.notes + ' ' + t.subtasks.map((s) => s.title).join(' '), tags: [t.category ?? ''], date: t.dueDate ?? t.createdAt.slice(0, 10) });
  if (want('reminder')) for (const r of data.reminder) docs.push({ kind: 'reminder', id: r.id, title: r.title, body: r.notes, tags: [r.category ?? ''], date: r.date });
  if (want('habit')) for (const h of data.habit) docs.push({ kind: 'habit', id: h.id, title: h.name, body: scheduleLabel(h), tags: [], date: null });
  if (want('map')) for (const m of data.map ?? []) docs.push({ kind: 'map', id: m.id, title: m.title, body: m.nodes.map((n) => n.text).join(' · ') + ' ' + m.edges.map((e) => e.label ?? '').join(' '), tags: [m.mapType], date: m.updatedAt.slice(0, 10) });
  if (want('doc')) for (const d of data.doc ?? []) docs.push({ kind: 'doc', id: d.id, title: d.title, body: d.text.slice(0, 60000), tags: d.tags, date: d.createdAt.slice(0, 10) });
  if (want('media')) for (const m of data.media ?? []) if (m.status !== 'dismissed') docs.push({ kind: 'media', id: m.id, title: m.title, body: `${m.creator} ${m.genre ?? ''} ${m.category ?? ''} ${m.notes ?? ''} ${m.mediaType === 'book' ? 'libro' : m.mediaType === 'video' ? 'video' : m.mediaType === 'music' ? 'música canción' : 'arte obra'}`, tags: [m.mediaType], date: m.createdAt.slice(0, 10) });
  if (want('quote')) quotes.forEach((q, i) => docs.push({ kind: 'quote', id: `quote-${i}`, title: q.text, body: `${q.author} ${q.context} ${q.meaning}`, tags: [], date: null }));
  return docs;
}
