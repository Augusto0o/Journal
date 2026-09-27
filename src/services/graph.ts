/**
 * Grafo de conocimiento personal.
 * Aristas explícitas (enlaces, origen de un mapa, notas de un libro) +
 * aristas automáticas (etiquetas compartidas y palabras poco comunes en común).
 */
import type { AnyRecord } from '@/types';
import type { Snapshot } from '@/database/store';
import { htmlToText, normalize } from '@/utils/html';
import { searchTerms } from './queries';

export type GraphKind = 'journal' | 'note' | 'idea' | 'map' | 'doc' | 'book' | 'video' | 'music' | 'art' | 'task';

export interface GNode {
  id: string;
  kind: GraphKind;
  label: string;
  path: string;
  date: string;
}

export interface GEdge {
  a: string;
  b: string;
  weight: number;
  reason: string;
}

export const KIND_LABEL: Record<GraphKind, string> = {
  journal: 'Journal', note: 'Nota', idea: 'Idea', map: 'Mapa', doc: 'PDF', book: 'Libro', video: 'Video', music: 'Música', art: 'Obra', task: 'Tarea',
};

export const KIND_HUE: Record<GraphKind, number> = {
  journal: 22, note: 245, idea: 75, map: 300, doc: 15, book: 60, video: 350, music: 330, art: 45, task: 150,
};

function nodeOf(r: AnyRecord): GNode | null {
  switch (r.kind) {
    case 'journal': return { id: r.id, kind: 'journal', label: r.title || r.entryDate, path: `/journal/${r.id}/leer`, date: r.entryDate };
    case 'note': return r.isArchived ? null : { id: r.id, kind: r.noteType === 'idea' ? 'idea' : 'note', label: r.title || 'Nota', path: `/biblioteca/nota/${r.id}`, date: r.updatedAt.slice(0, 10) };
    case 'map': return { id: r.id, kind: 'map', label: r.title, path: `/mapas/${r.id}`, date: r.updatedAt.slice(0, 10) };
    case 'doc': return { id: r.id, kind: 'doc', label: r.title, path: `/pdf/${r.id}`, date: r.createdAt.slice(0, 10) };
    case 'media':
      if (r.status === 'dismissed') return null;
      return { id: r.id, kind: r.mediaType === 'book' ? 'book' : r.mediaType === 'video' ? 'video' : r.mediaType === 'music' ? 'music' : 'art', label: r.title, path: r.mediaType === 'book' ? '/biblioteca?tab=libros' : r.mediaType === 'video' ? '/biblioteca?tab=videos' : r.mediaType === 'music' ? '/biblioteca?tab=musica' : '/arte', date: r.createdAt.slice(0, 10) };
    case 'task': return r.sourceId ? { id: r.id, kind: 'task', label: r.title, path: '/', date: r.createdAt.slice(0, 10) } : null;
    default: return null;
  }
}

function textOf(r: AnyRecord): string {
  switch (r.kind) {
    case 'journal':
    case 'note': return `${r.title ?? ''} ${htmlToText(r.content, `${r.id}:${r.updatedAt}`)} ${r.tags.join(' ')}`;
    case 'map': return `${r.title} ${r.nodes.map((n) => n.text).join(' ')}`;
    case 'doc': return `${r.title} ${r.text.slice(0, 8000)}`;
    case 'media': return `${r.title} ${r.creator} ${r.genre ?? ''} ${r.notes ?? ''}`;
    case 'task': return r.title;
    default: return '';
  }
}

function tagsOf(r: AnyRecord): string[] {
  if (r.kind === 'journal' || r.kind === 'note' || r.kind === 'doc') return r.tags.map((t) => normalize(t));
  return [];
}

function explicitLinks(r: AnyRecord): string[] {
  const out: string[] = [];
  if (r.kind === 'note') out.push(...r.linkedIds);
  if (r.kind === 'journal' && r.links) out.push(...r.links);
  if ((r.kind === 'map' || r.kind === 'task') && r.sourceId) out.push(r.sourceId);
  if ((r.kind === 'map' || r.kind === 'doc' || r.kind === 'media') && r.links) out.push(...r.links);
  return out;
}

let cache: { version: number; graph: { nodes: GNode[]; edges: GEdge[] } } | null = null;

export function buildGraph(snap: Snapshot): { nodes: GNode[]; edges: GEdge[] } {
  if (cache?.version === snap.version) return cache.graph;
  const recs: AnyRecord[] = [...snap.journal, ...snap.note, ...snap.map, ...snap.doc, ...snap.media, ...snap.task];
  const nodes: GNode[] = [];
  const byId = new Map<string, AnyRecord>();
  for (const r of recs) {
    const n = nodeOf(r);
    if (n) {
      nodes.push(n);
      byId.set(r.id, r);
    }
  }
  const edges = new Map<string, GEdge>();
  const add = (a: string, b: string, w: number, reason: string) => {
    if (a === b || !byId.has(a) || !byId.has(b)) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    const cur = edges.get(key);
    if (!cur || cur.weight < w) edges.set(key, { a, b, weight: w, reason });
  };

  // 1) Enlaces explícitos
  for (const r of byId.values()) for (const l of explicitLinks(r)) add(r.id, l, 3, r.kind === 'map' ? 'Mapa creado a partir de este contenido' : r.kind === 'task' ? 'Tarea salida de este texto' : 'Vinculado');

  // 2) Etiquetas compartidas
  const byTag = new Map<string, string[]>();
  for (const r of byId.values()) for (const t of tagsOf(r)) byTag.set(t, [...(byTag.get(t) ?? []), r.id]);
  for (const [t, ids] of byTag) if (ids.length <= 12) for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) add(ids[i], ids[j], 2, `#${t}`);

  // 3) Palabras poco comunes en común
  const terms = new Map<string, Set<string>>();
  const df = new Map<string, number>();
  for (const r of byId.values()) {
    const set = new Set(searchTerms(textOf(r)).filter((w) => w.length > 4));
    terms.set(r.id, set);
    for (const w of set) df.set(w, (df.get(w) ?? 0) + 1);
  }
  const N = byId.size;
  const rare = (w: string) => (df.get(w) ?? 0) >= 2 && (df.get(w) ?? 0) <= Math.max(3, N * 0.15);
  const byWord = new Map<string, string[]>();
  for (const [id, set] of terms) for (const w of set) if (rare(w)) byWord.set(w, [...(byWord.get(w) ?? []), id]);
  const shared = new Map<string, string[]>();
  for (const [w, ids] of byWord) for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const key = ids[i] < ids[j] ? `${ids[i]}|${ids[j]}` : `${ids[j]}|${ids[i]}`;
    shared.set(key, [...(shared.get(key) ?? []), w]);
  }
  for (const [key, words] of shared) {
    if (words.length < 2) continue;
    const [a, b] = key.split('|');
    add(a, b, Math.min(2, words.length / 3), `Temas en común: ${words.slice(0, 3).join(', ')}`);
  }

  // Limita aristas débiles por nodo para que el grafo sea legible.
  const list = [...edges.values()].sort((x, y) => y.weight - x.weight);
  const degree = new Map<string, number>();
  const kept: GEdge[] = [];
  for (const e of list) {
    const da = degree.get(e.a) ?? 0, db = degree.get(e.b) ?? 0;
    if (e.weight < 2 && (da >= 4 || db >= 4)) continue;
    kept.push(e);
    degree.set(e.a, da + 1);
    degree.set(e.b, db + 1);
  }
  const graph = { nodes, edges: kept };
  cache = { version: snap.version, graph };
  return graph;
}

export function related(snap: Snapshot, id: string, limit = 8) {
  const g = buildGraph(snap);
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  return g.edges
    .filter((e) => e.a === id || e.b === id)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map((e) => ({ node: byId.get(e.a === id ? e.b : e.a)!, reason: e.reason }))
    .filter((x) => x.node);
}

/** Posiciones con una simulación de fuerzas simple (determinista). */
export function forceLayout(nodes: GNode[], edges: GEdge[], iterations = 220) {
  const n = nodes.length;
  const idx = new Map(nodes.map((x, i) => [x.id, i]));
  const px = new Float64Array(n), py = new Float64Array(n), vx = new Float64Array(n), vy = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996;
    const r = 30 * Math.sqrt(i + 1);
    px[i] = Math.cos(a) * r;
    py[i] = Math.sin(a) * r;
  }
  const links = edges.map((e) => [idx.get(e.a)!, idx.get(e.b)!, e.weight] as const).filter(([a, b]) => a !== undefined && b !== undefined);
  for (let it = 0; it < iterations; it++) {
    const alpha = 1 - it / iterations;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      let dx = px[j] - px[i], dy = py[j] - py[i];
      let d2 = dx * dx + dy * dy;
      if (d2 < 0.01) { dx = 0.1; dy = 0.1; d2 = 0.02; }
      if (d2 > 250000) continue;
      const f = (1800 / d2) * alpha;
      vx[i] -= dx * f; vy[i] -= dy * f; vx[j] += dx * f; vy[j] += dy * f;
    }
    for (const [a, b, w] of links) {
      const dx = px[b] - px[a], dy = py[b] - py[a];
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = ((d - 90) / d) * 0.04 * (0.6 + w * 0.3) * alpha;
      vx[a] += dx * f; vy[a] += dy * f; vx[b] -= dx * f; vy[b] -= dy * f;
    }
    for (let i = 0; i < n; i++) {
      vx[i] -= px[i] * 0.012 * alpha; vy[i] -= py[i] * 0.012 * alpha;
      px[i] += vx[i]; py[i] += vy[i];
      vx[i] *= 0.6; vy[i] *= 0.6;
    }
  }
  return nodes.map((x, i) => ({ ...x, x: px[i], y: py[i] }));
}
