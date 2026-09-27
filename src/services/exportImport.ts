import type { AnyRecord } from '@/types';
import { KINDS } from '@/types';
import { store } from '@/database/store';
import { formatEntryDate, todayISO } from '@/utils/date';
import { htmlToMarkdown, htmlToText } from '@/utils/html';
import { shareOrDownload } from '@/utils/misc';
import { PREF } from './prefs';

export type ExportFormat = 'json' | 'markdown' | 'csv';

export interface Backup {
  app: 'personal-os';
  version: 1;
  exportedAt: string;
  records: AnyRecord[];
}

export function buildExport(format: ExportFormat): { blob: Blob; filename: string } {
  const snap = store.getSnapshot();
  const stamp = todayISO();
  if (format === 'json') {
    const records = KINDS.flatMap((k) => snap[k] as AnyRecord[]);
    const data: Backup = { app: 'personal-os', version: 1, exportedAt: new Date().toISOString(), records };
    return { blob: new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), filename: `personal-os-${stamp}.json` };
  }
  if (format === 'markdown') {
    const parts: string[] = ['# Personal OS', '', `_Exportado el ${formatEntryDate(stamp)}_`, '', '## Journal', ''];
    for (const e of [...snap.journal].sort((a, b) => a.entryDate.localeCompare(b.entryDate))) {
      parts.push(`### ${e.title || formatEntryDate(e.entryDate)}`, '', `_${formatEntryDate(e.entryDate)}_${e.tags.length ? ' · ' + e.tags.map((t) => '#' + t).join(' ') : ''}`, '', htmlToMarkdown(e.content), '');
    }
    parts.push('## Notas', '');
    for (const n of snap.note) {
      parts.push(`### ${n.title || 'Sin título'}`, '', n.url ? `<${n.url}>` : '', htmlToMarkdown(n.content), '');
    }
    parts.push('## Tareas', '');
    for (const t of snap.task) parts.push(`- [${t.isDone ? 'x' : ' '}] ${t.title}${t.dueDate ? ` (${t.dueDate}${t.dueTime ? ' ' + t.dueTime : ''})` : ''}`);
    return { blob: new Blob([parts.join('\n')], { type: 'text/markdown;charset=utf-8' }), filename: `personal-os-${stamp}.md` };
  }
  const cell = (v: string) => (/[",\n\r;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rows = [['tipo', 'fecha', 'titulo', 'contenido', 'etiquetas'].join(',')];
  for (const e of snap.journal) rows.push(['journal', e.entryDate, e.title ?? '', htmlToText(e.content), e.tags.join(' ')].map(cell).join(','));
  for (const n of snap.note) rows.push([n.noteType, n.updatedAt.slice(0, 10), n.title ?? '', htmlToText(n.content), n.tags.join(' ')].map(cell).join(','));
  for (const t of snap.task) rows.push(['tarea', t.dueDate ?? '', t.title, t.notes, t.category ?? ''].map(cell).join(','));
  return { blob: new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' }), filename: `personal-os-${stamp}.csv` };
}

export async function exportData(format: ExportFormat) {
  const { blob, filename } = buildExport(format);
  const r = await shareOrDownload(blob, filename);
  if (format === 'json' && r !== 'cancelled') {
    const s = store.pref<Record<string, unknown>>(PREF.settings, {});
    await store.setPref(PREF.settings, { ...s, lastBackupAt: new Date().toISOString() });
  }
  return r;
}

export interface ImportPreview {
  records: AnyRecord[];
  counts: Record<string, number>;
  exportedAt: string | null;
}

export async function parseBackup(file: File): Promise<ImportPreview> {
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }
  const data = raw as Partial<Backup> & { entries?: unknown[] };
  let records: AnyRecord[] = [];
  if (Array.isArray(data.records)) {
    records = data.records.filter((r): r is AnyRecord => !!r && typeof r === 'object' && KINDS.includes((r as AnyRecord).kind) && typeof (r as AnyRecord).id === 'string');
  } else if (Array.isArray(data.entries)) {
    // Copia del Journal anterior: se convierte al formato nuevo.
    const tagNames = new Map<string, string>(((raw as { tags?: { id: string; name: string }[] }).tags ?? []).map((t) => [t.id, t.name]));
    records = (data.entries as Record<string, unknown>[]).map((e) => ({
      id: String(e.id),
      kind: 'journal',
      title: (e.title as string) ?? null,
      content: String(e.content ?? ''),
      entryDate: String(e.entryDate ?? todayISO()),
      tags: ((e.tagIds as string[]) ?? []).map((id) => tagNames.get(id)).filter(Boolean) as string[],
      isFavorite: !!e.isFavorite,
      createdAt: String(e.createdAt ?? new Date().toISOString()),
      updatedAt: String(e.updatedAt ?? new Date().toISOString()),
      deletedAt: null,
    })) as AnyRecord[];
  } else {
    throw new Error('El archivo no parece una copia de Personal OS.');
  }
  const counts: Record<string, number> = {};
  for (const r of records) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
  return { records, counts, exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : null };
}
