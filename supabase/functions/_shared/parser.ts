// Interpretación de lenguaje natural en español (sin IA).
// Compartido por la PWA y la función `capture` de los Atajos.
// Todo trabaja con fechas locales en texto (YYYY-MM-DD / HH:mm) para no depender de la zona horaria del servidor.

import type { Priority } from './types.ts';

export interface ParseContext {
  /** Hoy en la zona del usuario, YYYY-MM-DD. */
  today: string;
  /** Hora actual del usuario, HH:mm. */
  now: string;
}

export interface ParsedTask {
  title: string;
  dueDate: string | null;
  dueTime: string | null;
  priority: Priority;
  category: string | null;
}

export const pad = (n: number) => String(n).padStart(2, '0');

export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Suma días a una fecha YYYY-MM-DD (aritmética en UTC, sin DST). */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** 0 = domingo … 6 = sábado */
export function weekdayISO(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Fecha y hora locales en una zona IANA. */
export function localNow(timeZone?: string, date = new Date()): ParseContext {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
    const hour = get('hour') === '24' ? '00' : get('hour');
    return { today: `${get('year')}-${get('month')}-${get('day')}`, now: `${hour}:${get('minute')}` };
  } catch {
    return { today: date.toISOString().slice(0, 10), now: date.toISOString().slice(11, 16) };
  }
}

const WEEKDAYS: Record<string, number> = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };

/** Reemplaza un tramo (índices de la versión normalizada, misma longitud) por un espacio. */
function cut(text: string, start: number, end: number): string {
  return text.slice(0, start) + ' ' + text.slice(end);
}

export function parseTask(input: string, ctx: ParseContext): ParsedTask {
  // Se trabaja con la forma NFC para que el texto y su versión normalizada tengan la misma longitud.
  let text = ' ' + input.normalize('NFC').trim() + ' ';
  let priority: Priority = 0;
  let category: string | null = null;
  let dueDate: string | null = null;
  let dueTime: string | null = null;

  const prio: [RegExp, Priority][] = [[/\s!alta\b/i, 3], [/\s!media\b/i, 2], [/\s!baja\b/i, 1], [/\s!!!/, 3], [/\s!!/, 2]];
  for (const [re, p] of prio) {
    if (re.test(text)) {
      priority = p;
      text = text.replace(re, ' ');
      break;
    }
  }

  const cat = text.match(/\s#([\p{L}\p{N}_-]+)/u);
  if (cat) {
    category = cat[1];
    text = text.replace(cat[0], ' ');
  }

  // Hora
  const timeRes: RegExp[] = [
    /\s(?:a\s+las|a\s+la)\s+(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|hs|h)?(?:\s+de\s+la\s+(manana|tarde|noche))?(?=\s)/,
    /\s(\d{1,2})[:.](\d{2})\s*(am|pm|hs|h)?(?=\s)/,
    /\s(\d{1,2})\s*(am|pm)(?=\s)/,
    /\s(\d{1,2})\s*(hs|h)(?=\s)/,
  ];
  for (let i = 0; i < timeRes.length; i++) {
    const norm = normalize(text);
    const m = timeRes[i].exec(norm);
    if (!m) continue;
    let h = 0, min = 0;
    let suffix: string | undefined;
    let period: string | undefined;
    if (i === 0) { h = +m[1]; min = m[2] ? +m[2] : 0; suffix = m[3]; period = m[4]; }
    else if (i === 1) { h = +m[1]; min = +m[2]; suffix = m[3]; }
    else { h = +m[1]; suffix = m[2]; }
    if (suffix === 'pm' && h < 12) h += 12;
    if (suffix === 'am' && h === 12) h = 0;
    if ((period === 'tarde' || period === 'noche') && h < 12) h += 12;
    if (h <= 23 && min <= 59) {
      dueTime = `${pad(h)}:${pad(min)}`;
      text = cut(text, m.index, m.index + m[0].length);
    }
    break;
  }

  // Día
  const dayWords: [RegExp, number, string | null][] = [
    [/\bpasado\s+manana\b/, 2, null],
    [/\bmanana\b/, 1, null],
    [/\bhoy\b/, 0, null],
    [/\besta\s+noche\b/, 0, '21:00'],
    [/\besta\s+tarde\b/, 0, '17:00'],
  ];
  for (const [re, offset, defTime] of dayWords) {
    const norm = normalize(text);
    const m = re.exec(norm);
    if (m) {
      dueDate = addDaysISO(ctx.today, offset);
      if (defTime && !dueTime) dueTime = defTime;
      text = cut(text, m.index, m.index + m[0].length);
      break;
    }
  }
  if (!dueDate) {
    const norm = normalize(text);
    const m = /\b(?:el\s+|este\s+|el\s+proximo\s+|proximo\s+)?(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/.exec(norm);
    if (m) {
      const target = WEEKDAYS[m[1]];
      let diff = (target - weekdayISO(ctx.today) + 7) % 7;
      if (diff === 0) diff = 7;
      dueDate = addDaysISO(ctx.today, diff);
      text = cut(text, m.index, m.index + m[0].length);
    }
  }
  if (!dueDate) {
    const norm = normalize(text);
    const m = /\s(?:el\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=\s)/.exec(norm);
    if (m) {
      const [ty] = ctx.today.split('-').map(Number);
      let year = m[3] ? +m[3] : ty;
      if (year < 100) year += 2000;
      let iso = `${year}-${pad(+m[2])}-${pad(+m[1])}`;
      if (!m[3] && iso < ctx.today) iso = `${year + 1}-${pad(+m[2])}-${pad(+m[1])}`;
      dueDate = iso;
      text = cut(text, m.index, m.index + m[0].length);
    }
  }
  if (!dueDate) {
    const norm = normalize(text);
    const m = /\ben\s+(\d{1,2})\s+dias?\b/.exec(norm);
    if (m) {
      dueDate = addDaysISO(ctx.today, +m[1]);
      text = cut(text, m.index, m.index + m[0].length);
    }
  }

  if (dueTime && !dueDate) {
    // Solo hora: hoy, o mañana si ya pasó.
    dueDate = dueTime > ctx.now ? ctx.today : addDaysISO(ctx.today, 1);
  }

  let title = text.replace(/\s{2,}/g, ' ').trim();
  title = title.replace(/\s+(y|el|la|a|para|de)$/i, '').trim();
  title = title.charAt(0).toUpperCase() + title.slice(1);
  if (!title) title = input.trim();
  return { title, dueDate, dueTime, priority, category };
}

// ------------------------------------------------------------------
// Clasificación de captura rápida (heurística)
// ------------------------------------------------------------------

export type CaptureType = 'note' | 'idea' | 'task' | 'reminder' | 'journal' | 'link';

export interface CaptureSuggestion {
  type: CaptureType;
  category: string | null;
  title: string | null;
}

export function classifyCapture(text: string, ctx: ParseContext): CaptureSuggestion {
  const t = text.trim();
  const n = normalize(t);
  if (/^https?:\/\/\S+$/i.test(t) || /^www\.\S+$/i.test(t)) return { type: 'link', category: null, title: null };
  if (/(recordame|recuerdame|recordar |no olvidar|no te olvides|avisame)/.test(n)) return { type: 'reminder', category: null, title: null };
  if (/(\bidea\b|se me ocurrio|\by si\b|podria hacer|estaria bueno|\bproyecto\b|app para|concepto)/.test(n)) {
    const category = /(app|aplicacion|proyecto|negocio|startup)/.test(n) ? 'Proyectos' : null;
    return { type: 'idea', category, title: null };
  }
  if (/(hoy me senti|hoy fue|me siento|estoy cansad|estoy content|fue un dia|hoy estuve|hoy fui|hoy aprendi)/.test(n)) {
    return { type: 'journal', category: null, title: null };
  }
  const verbs = ['comprar', 'llamar', 'enviar', 'mandar', 'pagar', 'terminar', 'revisar', 'hacer', 'escribir', 'preparar', 'reservar',
    'buscar', 'responder', 'contestar', 'agendar', 'limpiar', 'arreglar', 'entregar', 'leer', 'estudiar', 'sacar', 'renovar'];
  const first = n.split(/\s+/)[0] ?? '';
  const parsed = parseTask(t, ctx);
  if (verbs.includes(first) || parsed.dueDate || /^(tengo que|hay que|debo)\b/.test(n)) {
    return { type: 'task', category: parsed.category, title: parsed.title };
  }
  if (t.length > 280) return { type: 'journal', category: null, title: null };
  return { type: 'note', category: null, title: null };
}
