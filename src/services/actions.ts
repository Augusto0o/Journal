/** Acciones de dominio. La UI llama a estas funciones; nunca escribe en el almacén directamente. */
import type { Folder, Habit, JournalEntry, Note, NoteType, Priority, Reminder, Task } from '@/types';
import { store } from '@/database/store';
import { parseTask, addDaysISO, type CaptureType } from '@shared/parser.ts';
import { nextDate, parseCtx, habitCount } from './queries';
import { nowISO, uuid } from '@/utils/misc';
import { todayISO } from '@/utils/date';
import { isHtmlEmpty, sanitizeHtml, textToHtml } from '@/utils/html';

const base = () => {
  const now = nowISO();
  return { id: uuid(), createdAt: now, updatedAt: now, deletedAt: null };
};

// ---------------- Journal ----------------

export function newEntry(entryDate = todayISO(), content = ''): JournalEntry {
  return { ...base(), kind: 'journal', title: null, content, entryDate, tags: [], isFavorite: false, paper: null };
}

export async function saveEntry(e: JournalEntry): Promise<boolean> {
  const exists = !!store.raw(e.id);
  if (!exists && !e.title?.trim() && isHtmlEmpty(e.content)) return false;
  await store.put({ ...e, content: sanitizeHtml(e.content), title: e.title?.trim() ? e.title.trim() : null });
  return true;
}

export async function deleteEntry(id: string) {
  await store.remove(id, (r) => ({ ...(r as JournalEntry), title: null, content: '', tags: [] }));
}

export async function patchEntry(id: string, patch: Partial<JournalEntry>) {
  const cur = store.get('journal', id);
  if (cur) await store.put({ ...cur, ...patch });
}

// ---------------- Notas ----------------

export function newNote(noteType: NoteType = 'note', folderId: string | null = null): Note {
  return {
    ...base(), kind: 'note', title: null, content: '', noteType, url: null, folderId, category: null, tags: [],
    isFavorite: false, isPinned: false, isArchived: false, linkedIds: [], paper: null,
  };
}

export async function saveNote(n: Note): Promise<boolean> {
  const exists = !!store.raw(n.id);
  if (!exists && !n.title?.trim() && isHtmlEmpty(n.content) && !n.url) return false;
  await store.put({ ...n, content: sanitizeHtml(n.content), title: n.title?.trim() ? n.title.trim() : null });
  return true;
}

export async function patchNote(id: string, patch: Partial<Note>) {
  const cur = store.get('note', id);
  if (cur) await store.put({ ...cur, ...patch });
}

export async function deleteNote(id: string) {
  await store.remove(id, (r) => ({ ...(r as Note), title: null, content: '', linkedIds: [], tags: [] }));
}

export async function saveFolder(name: string, id?: string) {
  const cur = id ? store.get('folder', id) : undefined;
  const f: Folder = cur ? { ...cur, name } : { ...base(), kind: 'folder', name };
  await store.put(f);
  return f;
}

export async function deleteFolder(id: string) {
  const notes = store.getSnapshot().note.filter((n) => n.folderId === id).map((n) => ({ ...n, folderId: null }));
  if (notes.length) await store.put(notes);
  await store.remove(id);
}

// ---------------- Tareas ----------------

export function newTask(partial: Partial<Task> = {}): Task {
  return {
    ...base(), kind: 'task', title: '', notes: '', isDone: false, completedAt: null, dueDate: null, dueTime: null,
    priority: 0, repeat: 'never', category: null, subtasks: [], sourceId: null, ...partial,
  };
}

export async function createTask(text: string, defaults: Partial<Task> = {}): Promise<Task> {
  const p = parseTask(text, parseCtx());
  const t = newTask({
    title: p.title, dueDate: p.dueDate ?? defaults.dueDate ?? null, dueTime: p.dueTime,
    priority: (p.priority || defaults.priority || 0) as Priority, category: p.category ?? defaults.category ?? null,
    sourceId: defaults.sourceId ?? null,
  });
  await store.put(t);
  return t;
}

export async function saveTask(t: Task) {
  await store.put(t);
}

export async function toggleTask(id: string) {
  const t = store.get('task', id);
  if (!t) return;
  const done = !t.isDone;
  const list: Task[] = [{ ...t, isDone: done, completedAt: done ? nowISO() : null }];
  if (done && t.repeat !== 'never' && t.dueDate) {
    const next = nextDate(t.dueDate, t.repeat);
    if (next) list.push(newTask({ title: t.title, notes: t.notes, dueDate: next, dueTime: t.dueTime, priority: t.priority,
      repeat: t.repeat, category: t.category, subtasks: t.subtasks.map((s) => ({ ...s, id: uuid(), isDone: false })), sourceId: t.sourceId }));
  }
  await store.put(list);
}

export async function postponeTask(id: string, days = 1) {
  const t = store.get('task', id);
  if (t) await store.put({ ...t, dueDate: addDaysISO(t.dueDate && t.dueDate > todayISO() ? t.dueDate : todayISO(), days) });
}

export async function deleteTask(id: string) {
  await store.remove(id);
}

export async function addTasks(items: { title: string; dueDate: string | null; dueTime: string | null; priority: Priority }[], sourceId: string | null = null) {
  await store.put(items.map((i) => newTask({ ...i, sourceId })));
}

// ---------------- Recordatorios ----------------

export function newReminder(partial: Partial<Reminder> = {}): Reminder {
  const d = new Date(Date.now() + 3600_000);
  return {
    ...base(), kind: 'reminder', title: '', notes: '', date: todayISO(),
    time: `${String(d.getHours()).padStart(2, '0')}:00`, repeat: 'never', priority: 0, category: null, isDone: false,
    completedAt: null, ...partial,
  };
}

export async function saveReminder(r: Reminder) {
  await store.put(r);
}

export async function completeReminder(id: string) {
  const r = store.get('reminder', id);
  if (!r) return;
  if (r.repeat !== 'never') {
    let next = nextDate(r.date, r.repeat);
    const today = todayISO();
    while (next && next < today) next = nextDate(next, r.repeat);
    if (next) return store.put({ ...r, date: next });
  }
  await store.put({ ...r, isDone: true, completedAt: nowISO() });
}

export async function snoozeReminder(id: string, minutes = 60) {
  const r = store.get('reminder', id);
  if (!r) return;
  const d = new Date(Date.now() + minutes * 60_000);
  await store.put({ ...r, isDone: false, date: todayISO(), time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` });
}

export async function deleteReminder(id: string) {
  await store.remove(id);
}

// ---------------- Hábitos ----------------

export function newHabit(partial: Partial<Habit> = {}): Habit {
  return {
    ...base(), kind: 'habit', name: '', icon: 'circle', color: 'indigo', schedule: { type: 'daily' }, target: 1,
    reminderTime: null, log: {}, isArchived: false, order: Date.now(), ...partial,
  };
}

export async function saveHabit(h: Habit) {
  await store.put(h);
}

/** Suma una vez; si ya se cumplió la meta, vuelve a cero. */
export async function tapHabit(id: string, day = todayISO()) {
  const h = store.get('habit', id);
  if (!h) return;
  const c = habitCount(h, day);
  const log = { ...h.log };
  if (c >= h.target) delete log[day];
  else log[day] = c + 1;
  await store.put({ ...h, log });
}

export async function setHabitCount(id: string, day: string, count: number) {
  const h = store.get('habit', id);
  if (!h) return;
  const log = { ...h.log };
  if (count <= 0) delete log[day];
  else log[day] = count;
  await store.put({ ...h, log });
}

export async function incrementHabit(id: string, day = todayISO()) {
  const h = store.get('habit', id);
  if (h) await store.put({ ...h, log: { ...h.log, [day]: habitCount(h, day) + 1 } });
}

export async function deleteHabit(id: string) {
  await store.remove(id);
}

export async function reorderHabits(ids: string[]) {
  const list = ids.map((id) => store.get('habit', id)).filter(Boolean).map((h, i) => ({ ...h!, order: i }));
  await store.put(list);
}

// ---------------- Foco ----------------

export async function logFocus(start: number, end: number, minutes: number, label: string, taskId: string | null) {
  await store.put({ ...base(), kind: 'focus', start: new Date(start).toISOString(), end: new Date(end).toISOString(), minutes, label, taskId });
}

// ---------------- Captura rápida ----------------

export interface CaptureInput {
  text: string;
  type: CaptureType;
  category?: string | null;
  title?: string | null;
  imageDataUrl?: string | null;
}

export async function saveCapture(c: CaptureInput): Promise<{ kind: string; id: string }> {
  const text = c.text.trim();
  const imageHtml = c.imageDataUrl ? `<img src="${c.imageDataUrl}" alt="">` : '';
  const bodyHtml = imageHtml + (text ? textToHtml(text) : '');
  // Un enlace de YouTube / YouTube Music va a la Biblioteca.
  if ((c.type === 'link' || c.type === 'note') && !c.imageDataUrl) {
    const { saveYouTubeLink, youtubeKind } = await import('./media');
    if (youtubeKind(text) && text.split(/\s+/).length <= 12) {
      const m = await saveYouTubeLink(text);
      if (m) return { kind: 'media', id: m.id };
    }
  }
  switch (c.type) {
    case 'task': {
      const t = await createTask(text, { category: c.category ?? null });
      if (c.title) await saveTask({ ...t, title: c.title });
      return { kind: 'task', id: t.id };
    }
    case 'reminder': {
      // Un recordatorio es una tarea con hora y alarma.
      const cleaned = text.replace(/^(recordame|recuerdame|recordarme|avisame)\s+(que\s+)?/i, '');
      const p = parseTask(cleaned, parseCtx());
      const d = new Date(Date.now() + 3600_000);
      const t = newTask({
        title: c.title || p.title, category: c.category ?? p.category ?? null, priority: p.priority,
        dueDate: p.dueDate ?? todayISO(), dueTime: p.dueTime ?? (p.dueDate ? '09:00' : `${String(d.getHours()).padStart(2, '0')}:00`), alarm: true,
      });
      await store.put(t);
      return { kind: 'task', id: t.id };
    }
    case 'journal': {
      const today = store.getSnapshot().journal.find((e) => e.entryDate === todayISO());
      if (today) {
        await store.put({ ...today, content: today.content + (isHtmlEmpty(today.content) ? '' : '<hr>') + bodyHtml });
        return { kind: 'journal', id: today.id };
      }
      const e = newEntry(todayISO(), bodyHtml);
      e.title = c.title ?? null;
      await store.put(e);
      return { kind: 'journal', id: e.id };
    }
    default: {
      const n = newNote(c.type === 'idea' ? 'idea' : c.type === 'link' ? 'link' : 'note');
      n.category = c.category ?? null;
      if (c.type === 'link') {
        n.url = text;
        try {
          n.title = c.title || new URL(text.startsWith('http') ? text : `https://${text}`).hostname;
        } catch {
          n.title = text;
        }
        n.content = imageHtml;
      } else {
        const firstLine = text.split('\n')[0] ?? '';
        n.title = c.title || (firstLine.length <= 60 ? firstLine : firstLine.slice(0, 57) + '…') || null;
        const rest = c.title ? text : text.split('\n').slice(firstLine.length <= 60 ? 1 : 0).join('\n');
        n.content = imageHtml + (rest.trim() ? textToHtml(rest.trim()) : '');
      }
      await store.put(n);
      return { kind: 'note', id: n.id };
    }
  }
}
