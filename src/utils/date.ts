import type { DateFormat } from '@/types';

export const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
export const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** Índice 0 = domingo. */
export const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const WEEKDAYS_INITIAL = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

/** Convierte YYYY-MM-DD a Date local (mediodía para evitar saltos por DST). */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12);
}

export function isValidISODate(iso: unknown): iso is string {
  return typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(parseISODate(iso).getTime());
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatEntryDate(iso: string, format: DateFormat = 'long'): string {
  const d = parseISODate(iso);
  const day = d.getDate();
  const month = d.getMonth();
  const year = d.getFullYear();
  switch (format) {
    case 'short':
      return `${day} ${MONTHS_SHORT[month]} ${year}`;
    case 'numeric':
      return `${pad(day)}/${pad(month + 1)}/${year}`;
    default:
      return `${day} de ${MONTHS[month]} de ${year}`;
  }
}

/** "Hoy", "Ayer" o la fecha formateada. */
export function formatRelativeDay(iso: string, format: DateFormat = 'long'): string {
  const today = todayISO();
  if (iso === today) return 'Hoy';
  if (iso === addDays(today, -1)) return 'Ayer';
  if (iso === addDays(today, 1)) return 'Mañana';
  const diff = Math.round((parseISODate(iso).getTime() - parseISODate(today).getTime()) / 86_400_000);
  if (diff > 1 && diff < 7) return capitalize(WEEKDAYS[parseISODate(iso).getDay()]);
  const sameYear = iso.slice(0, 4) === today.slice(0, 4);
  if (sameYear && format !== 'numeric') {
    const d = parseISODate(iso);
    return format === 'short' ? `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}` : `${d.getDate()} de ${MONTHS[d.getMonth()]}`;
  }
  return formatEntryDate(iso, format);
}

export function formatDayMonth(iso: string): string {
  const d = parseISODate(iso);
  return `${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

export function formatWeekdayDayMonth(iso: string): string {
  const d = parseISODate(iso);
  return `${capitalize(WEEKDAYS[d.getDay()])}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

export function monthLabel(year: number, month: number): string {
  return `${capitalize(MONTHS[month])} ${year}`;
}

export function formatTime(isoDateTime: string): string {
  const d = new Date(isoDateTime);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function relativeTime(isoDateTime: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(isoDateTime).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'ayer';
  if (d < 30) return `hace ${d} días`;
  const dt = new Date(isoDateTime);
  return `el ${dt.getDate()} de ${MONTHS[dt.getMonth()]} de ${dt.getFullYear()}`;
}

export function getGreeting(date = new Date()): string {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'Buenos días';
  if (h >= 12 && h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

/** Matriz de semanas para un mes. Cada celda es YYYY-MM-DD o null (relleno). */
export function buildMonthMatrix(year: number, month: number, weekStartsOn: 0 | 1): (string | null)[][] {
  const first = new Date(year, month, 1, 12);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = (first.getDay() - weekStartsOn + 7) % 7;
  const cells: (string | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(toISODate(new Date(year, month, d, 12)));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function weekdayHeaders(weekStartsOn: 0 | 1): string[] {
  return Array.from({ length: 7 }, (_, i) => WEEKDAYS_INITIAL[(i + weekStartsOn) % 7]);
}
