/**
 * Almacén local-first genérico.
 *
 * - Todos los registros (journal, notas, tareas…) viven en memoria para lecturas instantáneas
 *   y se persisten en IndexedDB (store "records").
 * - Cada cambio local se anota en el outbox para sincronizar con Supabase (tabla pos_items).
 * - Las preferencias (apariencia, inicio, ajustes, pomodoro) viven en el store "prefs"
 *   y NO se sincronizan (son por dispositivo).
 */
import type { AnyRecord, Kind, RecordByKind } from '@/types';
import { KINDS } from '@/types';
import { idb, requestPersistentStorage } from './idb';
import { nowISO } from '@/utils/misc';

export interface OutboxItem {
  key: string;
  kind: Kind;
  id: string;
  queuedAt: string;
}

type Collections = { [K in Kind]: RecordByKind[K][] };

export interface Snapshot extends Collections {
  ready: boolean;
  error: string | null;
  prefs: Record<string, unknown>;
  pendingCount: number;
  version: number;
}

const records = new Map<string, AnyRecord>();
const prefs = new Map<string, unknown>();
const outbox = new Map<string, OutboxItem>();

const emptyCollections = (): Collections => ({ journal: [], note: [], folder: [], task: [], reminder: [], habit: [], focus: [], card: [], lesson: [], map: [], doc: [], media: [] });

let snapshot: Snapshot = { ...emptyCollections(), ready: false, error: null, prefs: {}, pendingCount: 0, version: 0 };
const listeners = new Set<() => void>();
const changeListeners = new Set<() => void>();
let dirtyKinds = new Set<Kind>(KINDS);

function rebuild() {
  const next = { ...snapshot } as Snapshot;
  if (dirtyKinds.size) {
    const byKind = emptyCollections() as Record<Kind, AnyRecord[]>;
    for (const r of records.values()) {
      if (!r.deletedAt && dirtyKinds.has(r.kind)) byKind[r.kind].push(r);
    }
    for (const k of dirtyKinds) (next as unknown as Record<Kind, AnyRecord[]>)[k] = byKind[k];
  }
  next.prefs = Object.fromEntries(prefs);
  next.pendingCount = outbox.size;
  next.ready = true;
  next.version = snapshot.version + 1;
  snapshot = next;
  dirtyKinds = new Set();
  listeners.forEach((l) => l());
}

function markDirty(kinds: Iterable<Kind>) {
  for (const k of kinds) dirtyKinds.add(k);
}

function queue(kind: Kind, id: string): OutboxItem {
  const item: OutboxItem = { key: `${kind}:${id}`, kind, id, queuedAt: nowISO() };
  outbox.set(item.key, item);
  return item;
}

function notifyLocalChange() {
  changeListeners.forEach((l) => l());
}

let initPromise: Promise<void> | null = null;

export const store = {
  init(): Promise<void> {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      try {
        const [rs, ps, ob] = await Promise.all([
          idb.getAll<AnyRecord>('records'),
          idb.getAll<{ key: string; value: unknown }>('prefs'),
          idb.getAll<OutboxItem>('outbox'),
        ]);
        rs.forEach((r) => records.set(r.id, r));
        ps.forEach((p) => prefs.set(p.key, p.value));
        ob.forEach((o) => outbox.set(o.key, o));
        requestPersistentStorage();
      } catch (err) {
        console.error(err);
        snapshot = { ...snapshot, error: 'No se pudieron cargar tus datos locales.' };
      }
      markDirty(KINDS);
      rebuild();
    })();
    return initPromise;
  },

  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  getSnapshot: () => snapshot,
  onLocalChange(l: () => void) {
    changeListeners.add(l);
    return () => changeListeners.delete(l);
  },

  // ---- Lectura ----
  get<K extends Kind>(kind: K, id: string): RecordByKind[K] | undefined {
    const r = records.get(id);
    return r && r.kind === kind && !r.deletedAt ? (r as RecordByKind[K]) : undefined;
  },
  raw: (id: string) => records.get(id),
  all: () => Array.from(records.values()),

  // ---- Escritura local ----
  async put(list: AnyRecord | AnyRecord[], opts: { touch?: boolean } = {}): Promise<void> {
    const arr = Array.isArray(list) ? list : [list];
    if (!arr.length) return;
    const now = nowISO();
    const ops: Parameters<typeof idb.batch>[0] = [];
    for (const r0 of arr) {
      const r = opts.touch === false ? r0 : ({ ...r0, updatedAt: now } as AnyRecord);
      records.set(r.id, r);
      ops.push({ store: 'records', type: 'put', value: r });
      ops.push({ store: 'outbox', type: 'put', value: queue(r.kind, r.id) });
      markDirty([r.kind]);
    }
    rebuild();
    notifyLocalChange();
    await idb.batch(ops);
  },

  /** Borrado lógico (se propaga al sincronizar). */
  async remove(id: string, scrub?: (r: AnyRecord) => AnyRecord): Promise<void> {
    const cur = records.get(id);
    if (!cur || cur.deletedAt) return;
    const now = nowISO();
    const base = scrub ? scrub(cur) : cur;
    await store.put({ ...base, deletedAt: now, updatedAt: now } as AnyRecord, { touch: false });
  },

  // ---- Remoto (no encola) ----
  async applyRemote(list: AnyRecord[]): Promise<void> {
    if (!list.length) return;
    const ops: Parameters<typeof idb.batch>[0] = [];
    for (const r of list) {
      records.set(r.id, r);
      ops.push({ store: 'records', type: 'put', value: r });
      markDirty([r.kind]);
    }
    rebuild();
    await idb.batch(ops);
  },

  // ---- Preferencias ----
  pref<T>(key: string, fallback: T): T {
    const v = prefs.get(key);
    return v === undefined ? fallback : (v as T);
  },
  async setPref<T>(key: string, value: T): Promise<void> {
    prefs.set(key, value);
    rebuild();
    await idb.put('prefs', { key, value });
  },

  // ---- Outbox ----
  pending: () => Array.from(outbox.values()),
  hasPending: (kind: Kind, id: string) => outbox.has(`${kind}:${id}`),
  async ack(items: OutboxItem[]): Promise<void> {
    const ops: Parameters<typeof idb.batch>[0] = [];
    for (const it of items) {
      const cur = outbox.get(it.key);
      if (cur && cur.queuedAt === it.queuedAt) {
        outbox.delete(it.key);
        ops.push({ store: 'outbox', type: 'delete', key: it.key });
      }
    }
    rebuild();
    await idb.batch(ops);
  },
  async queueEverything(): Promise<void> {
    const ops: Parameters<typeof idb.batch>[0] = [];
    for (const r of records.values()) ops.push({ store: 'outbox', type: 'put', value: queue(r.kind, r.id) });
    rebuild();
    await idb.batch(ops);
  },

  // ---- Meta ----
  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await idb.get<{ key: string; value: T }>('meta', key))?.value;
  },
  async setMeta<T>(key: string, value: T): Promise<void> {
    await idb.put('meta', { key, value });
  },

  /** Importación masiva (restaurar copia). */
  async bulkImport(list: AnyRecord[], mode: 'merge' | 'replace'): Promise<number> {
    const now = nowISO();
    const toPut: AnyRecord[] = [];
    if (mode === 'replace') {
      const incoming = new Set(list.map((r) => r.id));
      for (const r of records.values()) {
        if (!incoming.has(r.id) && !r.deletedAt) toPut.push({ ...r, deletedAt: now, updatedAt: now } as AnyRecord);
      }
    }
    for (const r of list) {
      const cur = records.get(r.id);
      if (mode === 'merge' && cur && !cur.deletedAt && cur.updatedAt > r.updatedAt) continue;
      toPut.push({ ...r, deletedAt: null, updatedAt: r.updatedAt > now ? now : r.updatedAt } as AnyRecord);
    }
    await store.put(toPut, { touch: false });
    return toPut.filter((r) => !r.deletedAt).length;
  },

  async wipe(): Promise<void> {
    records.clear();
    outbox.clear();
    await idb.batch([
      { store: 'records', type: 'clear' },
      { store: 'outbox', type: 'clear' },
      { store: 'meta', type: 'clear' },
    ]);
    markDirty(KINDS);
    rebuild();
  },
};
