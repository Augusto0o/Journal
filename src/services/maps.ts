/**
 * Mapas mentales, conceptuales, diagramas de sistema y flujos.
 * La estructura se guarda como nodos + aristas; la posición se calcula con
 * un diseño automático según el tipo y después el usuario puede mover todo.
 */
import type { MapEdge, MapNode, MapType, MindMap } from '@/types';
import { store } from '@/database/store';
import { nowISO, uuid } from '@/utils/misc';

export const MAP_TYPES: { id: MapType; label: string; detail: string; icon: 'mindmap' | 'graph' | 'system' | 'flow' }[] = [
  { id: 'mind', label: 'Mapa mental', detail: 'Idea central → conceptos → subconceptos → detalles', icon: 'mindmap' },
  { id: 'concept', label: 'Mapa conceptual', detail: 'Conceptos unidos por relaciones con nombre', icon: 'graph' },
  { id: 'system', label: 'Diagrama de sistema', detail: 'Componentes y cómo se conectan', icon: 'system' },
  { id: 'flow', label: 'Flujo', detail: 'Un proceso paso a paso', icon: 'flow' },
];

export interface TreeNode {
  id: string;
  text: string;
  parent: string | null;
}

export function newMap(mapType: MapType = 'mind', title = 'Idea central'): MindMap {
  const now = nowISO();
  const root: MapNode = { id: uuid(), text: title, x: 0, y: 0, depth: 0 };
  return { id: uuid(), kind: 'map', createdAt: now, updatedAt: now, deletedAt: null, title, mapType, nodes: [root], edges: [], sourceId: null };
}

export async function saveMap(m: MindMap) {
  await store.put(m);
}

export async function deleteMap(id: string) {
  await store.remove(id);
}

// ---------------- Medidas ----------------

export function wrapText(text: string, max = 20): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 5);
}

export function nodeSize(n: Pick<MapNode, 'text' | 'depth'>) {
  const max = n.depth === 0 ? 16 : 20;
  const lines = wrapText(n.text || ' ', max);
  const longest = Math.max(...lines.map((l) => l.length), 4);
  const fs = n.depth === 0 ? 17 : 14;
  return { w: Math.min(240, Math.max(76, longest * fs * 0.56 + 28)), h: lines.length * fs * 1.3 + 22, lines, fs };
}

// ---------------- Diseño automático ----------------

function childrenOf(edges: MapEdge[], nodes: MapNode[]) {
  const ids = new Set(nodes.map((n) => n.id));
  const kids = new Map<string, string[]>();
  const hasParent = new Set<string>();
  for (const e of edges) {
    if (!ids.has(e.from) || !ids.has(e.to) || hasParent.has(e.to)) continue;
    kids.set(e.from, [...(kids.get(e.from) ?? []), e.to]);
    hasParent.add(e.to);
  }
  const roots = nodes.filter((n) => !hasParent.has(n.id));
  return { kids, roots };
}

/** Recalcula posiciones para el tipo de mapa. Devuelve nodos nuevos (no muta). */
export function layout(nodes: MapNode[], edges: MapEdge[], type: MapType): MapNode[] {
  if (!nodes.length) return nodes;
  const { kids, roots } = childrenOf(edges, nodes);
  const pos = new Map<string, { x: number; y: number; depth: number }>();
  const byId = new Map(nodes.map((n) => [n.id, n]));

  if (type === 'flow') {
    // Recorrido en orden: cada nivel baja; ramas en paralelo.
    let y = 0;
    const visit = (id: string, x: number, depth: number) => {
      if (pos.has(id)) return;
      pos.set(id, { x, y, depth });
      y += nodeSize(byId.get(id)!).h + 56;
      const k = kids.get(id) ?? [];
      k.forEach((c, i) => visit(c, x + (i > 0 ? i * 260 : 0), depth + 1));
    };
    roots.forEach((r, i) => visit(r.id, i * 280, 0));
  } else if (type === 'system') {
    const order: string[] = [];
    const seen = new Set<string>();
    const walk = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      order.push(id);
      (kids.get(id) ?? []).forEach(walk);
    };
    roots.forEach((r) => walk(r.id));
    nodes.forEach((n) => walk(n.id));
    const cols = Math.max(2, Math.ceil(Math.sqrt(order.length)));
    order.forEach((id, i) => pos.set(id, { x: (i % cols) * 250, y: Math.floor(i / cols) * 170, depth: i === 0 ? 0 : 1 }));
  } else {
    // Radial (mapa mental y conceptual): cada hijo ocupa un sector proporcional a sus hojas.
    const leaves = (id: string, guard = new Set<string>()): number => {
      if (guard.has(id)) return 1;
      guard.add(id);
      const k = kids.get(id) ?? [];
      return k.length ? k.reduce((a, c) => a + leaves(c, guard), 0) : 1;
    };
    const R = [0, 230, 420, 590, 740];
    const place = (id: string, a0: number, a1: number, depth: number) => {
      if (pos.has(id)) return;
      const a = (a0 + a1) / 2;
      const r = R[Math.min(depth, R.length - 1)] + (depth > 4 ? (depth - 4) * 150 : 0);
      pos.set(id, { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.78, depth });
      const k = kids.get(id) ?? [];
      const total = k.reduce((s, c) => s + leaves(c), 0) || 1;
      let cur = a0;
      for (const c of k) {
        const span = ((a1 - a0) * leaves(c)) / total;
        place(c, cur, cur + span, depth + 1);
        cur += span;
      }
    };
    const main = roots[0];
    place(main.id, -Math.PI / 2, Math.PI * 1.5, 0);
    roots.slice(1).forEach((r, i) => place(r.id, 0, 0.001, 1 + (i % 2)));
    nodes.forEach((n, i) => !pos.has(n.id) && pos.set(n.id, { x: 600 + (i % 3) * 200, y: Math.floor(i / 3) * 120, depth: 2 }));
  }

  return nodes.map((n) => {
    const p = pos.get(n.id) ?? { x: n.x, y: n.y, depth: n.depth ?? 1 };
    return { ...n, x: Math.round(p.x), y: Math.round(p.y), depth: p.depth };
  });
}

/** Construye un mapa desde un árbol (IA o heurística). */
export function fromTree(tree: TreeNode[], extraEdges: { from: string; to: string; label?: string | null }[], type: MapType, title: string, sourceId: string | null = null): MindMap {
  const m = newMap(type, title);
  const idMap = new Map<string, string>();
  const nodes: MapNode[] = tree.map((t) => {
    const id = uuid();
    idMap.set(t.id, id);
    return { id, text: t.text, x: 0, y: 0 };
  });
  const edges: MapEdge[] = [];
  for (const t of tree) {
    if (t.parent && idMap.has(t.parent)) edges.push({ id: uuid(), from: idMap.get(t.parent)!, to: idMap.get(t.id)!, label: null });
  }
  for (const e of extraEdges) {
    const a = idMap.get(e.from);
    const b = idMap.get(e.to);
    if (!a || !b || a === b) continue;
    const existing = edges.find((x) => x.from === a && x.to === b);
    if (existing) existing.label = e.label ?? existing.label;
    else edges.push({ id: uuid(), from: a, to: b, label: e.label ?? null });
  }
  return { ...m, nodes: layout(nodes, edges, type), edges, sourceId, title };
}

/**
 * Mapa sin IA: usa la estructura del texto (títulos, listas, oraciones).
 * Título/primera línea = idea central; títulos o párrafos = conceptos; listas y oraciones = subconceptos.
 */
export function heuristicTree(text: string, fallbackTitle = 'Idea central'): { title: string; tree: TreeNode[] } {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const title = (lines[0] ?? fallbackTitle).replace(/^#+\s*/, '').slice(0, 60);
  const tree: TreeNode[] = [{ id: 'root', text: title, parent: null }];
  let current: string | null = null;
  let n = 0;
  for (const raw of lines.slice(1)) {
    const isHeading = /^#{1,6}\s/.test(raw) || (raw.length < 48 && !/[.,;:]$/.test(raw) && !/^[-*•\d]/.test(raw));
    const isBullet = /^([-*•]|\d+[.)])\s+/.test(raw);
    const clean = raw.replace(/^#+\s*|^([-*•]|\d+[.)])\s+/g, '').trim();
    if (!clean) continue;
    if (isHeading && !isBullet) {
      current = `n${n++}`;
      tree.push({ id: current, text: clean.slice(0, 60), parent: 'root' });
    } else if (isBullet && current) {
      tree.push({ id: `n${n++}`, text: clean.slice(0, 70), parent: current });
    } else {
      // Párrafo: una rama por párrafo con sus oraciones como detalles.
      const sentences = clean.split(/(?<=[.!?])\s+/).filter((s) => s.length > 3);
      const head = sentences[0].replace(/[.!?]$/, '');
      const id = `n${n++}`;
      tree.push({ id, text: head.length > 60 ? head.slice(0, 57) + '…' : head, parent: current ?? 'root' });
      sentences.slice(1, 4).forEach((s) => tree.push({ id: `n${n++}`, text: s.replace(/[.!?]$/, '').slice(0, 70), parent: id }));
    }
    if (tree.length > 40) break;
  }
  return { title, tree };
}

/** Sugerencia local del tipo de diagrama más adecuado. */
export function suggestType(text: string): MapType {
  const t = text.toLowerCase();
  if (/(primero|después|luego|paso \d|finalmente|a continuación|step|then|first)/.test(t) || /^\s*\d+[.)]/m.test(text)) return 'flow';
  if (/(componente|sistema|módulo|servidor|api|base de datos|usuario envía|se conecta|input|output)/.test(t)) return 'system';
  if (/(causa|provoca|genera|depende|relación|implica|produce|se compone)/.test(t)) return 'concept';
  return 'mind';
}
