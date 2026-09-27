/**
 * Envoltorio mínimo de IndexedDB. Si IndexedDB no está disponible
 * (algunos modos privados), cae a memoria para no bloquear al usuario.
 */

const DB_NAME = 'personal-os';
const DB_VERSION = 2;

export type StoreName = 'records' | 'prefs' | 'outbox' | 'meta' | 'vault' | 'files';

const STORES: { name: StoreName; keyPath: string }[] = [
  { name: 'records', keyPath: 'id' },
  { name: 'prefs', keyPath: 'key' },
  { name: 'outbox', keyPath: 'key' },
  { name: 'meta', keyPath: 'key' },
  { name: 'vault', keyPath: 'id' },
  { name: 'files', keyPath: 'id' },
];

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memory: Record<StoreName, Map<string, unknown>> = {
  records: new Map(),
  prefs: new Map(),
  outbox: new Map(),
  meta: new Map(),
  vault: new Map(),
  files: new Map(),
};
export let persistent = true;

function open(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      persistent = false;
      resolve(null);
      return;
    }
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORES) {
          if (!db.objectStoreNames.contains(s.name)) db.createObjectStore(s.name, { keyPath: s.keyPath });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      req.onerror = () => {
        persistent = false;
        resolve(null);
      };
      req.onblocked = () => {
        /* otra pestaña con versión vieja; esperamos */
      };
    } catch {
      persistent = false;
      resolve(null);
    }
  });
  return dbPromise;
}

function keyOf(store: StoreName, value: unknown): string {
  const kp = STORES.find((s) => s.name === store)!.keyPath;
  return (value as Record<string, string>)[kp];
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transacción abortada'));
  });
}

export const idb = {
  async getAll<T>(store: StoreName): Promise<T[]> {
    const db = await open();
    if (!db) return Array.from(memory[store].values()) as T[];
    return reqToPromise(db.transaction(store).objectStore(store).getAll()) as Promise<T[]>;
  },

  async get<T>(store: StoreName, key: string): Promise<T | undefined> {
    const db = await open();
    if (!db) return memory[store].get(key) as T | undefined;
    return reqToPromise(db.transaction(store).objectStore(store).get(key)) as Promise<T | undefined>;
  },

  async put<T>(store: StoreName, value: T): Promise<void> {
    const db = await open();
    if (!db) {
      memory[store].set(keyOf(store, value), value);
      return;
    }
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    return txDone(tx);
  },

  async delete(store: StoreName, key: string): Promise<void> {
    const db = await open();
    if (!db) {
      memory[store].delete(key);
      return;
    }
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    return txDone(tx);
  },

  /** Escribe varios registros (en varios stores) en una única transacción. */
  async batch(ops: { store: StoreName; type: 'put' | 'delete' | 'clear'; value?: unknown; key?: string }[]): Promise<void> {
    if (!ops.length) return;
    const db = await open();
    if (!db) {
      for (const op of ops) {
        if (op.type === 'put') memory[op.store].set(keyOf(op.store, op.value), op.value);
        else if (op.type === 'delete') memory[op.store].delete(op.key!);
        else memory[op.store].clear();
      }
      return;
    }
    const names = Array.from(new Set(ops.map((o) => o.store)));
    const tx = db.transaction(names, 'readwrite');
    for (const op of ops) {
      const os = tx.objectStore(op.store);
      if (op.type === 'put') os.put(op.value);
      else if (op.type === 'delete') os.delete(op.key!);
      else os.clear();
    }
    return txDone(tx);
  },
};

/** Pide al navegador que no borre los datos bajo presión de espacio. */
export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* no-op */
  }
}
