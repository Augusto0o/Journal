/**
 * Sincronización local-first con la tabla `pos_items` de Supabase.
 *  - PUSH: lo pendiente del outbox se sube con upsert.
 *  - PULL: filas con server_updated_at posterior al último cursor.
 *  - Conflictos: gana el updatedAt más reciente.
 *  - Las capturas creadas desde Atajos llegan por esta misma vía.
 */
import type { AnyRecord, Kind } from '@/types';
import { KINDS } from '@/types';
import { store } from '@/database/store';
import { getSupabase, isSupabaseConfigured } from './supabaseClient';

export type SyncState = 'disabled' | 'signed-out' | 'idle' | 'syncing' | 'error' | 'offline';

export interface SyncStatus {
  configured: boolean;
  state: SyncState;
  email: string | null;
  userId: string | null;
  lastSyncedAt: string | null;
  error: string | null;
}

let status: SyncStatus = { configured: false, state: 'disabled', email: null, userId: null, lastSyncedAt: null, error: null };
const listeners = new Set<() => void>();

function set(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}

export const syncStatusStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  getSnapshot: () => status,
};

let started = false;
let authUnsub: (() => void) | null = null;

export async function initSync() {
  const configured = isSupabaseConfigured();
  set({ configured, state: configured ? 'signed-out' : 'disabled' });
  const sb = await getSupabase();
  if (!sb) return;
  const { data } = await sb.auth.getSession();
  await onSession(data.session?.user ?? null);
  authUnsub?.();
  const sub = sb.auth.onAuthStateChange((_e, session) => void onSession(session?.user ?? null));
  authUnsub = () => sub.data.subscription.unsubscribe();

  if (started) return;
  started = true;
  store.onLocalChange(() => schedule(2500));
  window.addEventListener('online', () => schedule(300));
  window.addEventListener('offline', () => status.userId && set({ state: 'offline' }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(400);
  });
  setInterval(() => schedule(0), 60_000);
}

async function onSession(user: { id: string; email?: string } | null) {
  if (!user) {
    set({ state: status.configured ? 'signed-out' : 'disabled', email: null, userId: null });
    return;
  }
  if (status.userId === user.id) return;
  set({ userId: user.id, email: user.email ?? null, state: navigator.onLine ? 'idle' : 'offline' });
  const last = await store.getMeta<string>('syncUser');
  if (last !== user.id) {
    await store.queueEverything();
    await store.setMeta('syncUser', user.id);
    await store.setMeta(`cursor:${user.id}`, null);
  }
  set({ lastSyncedAt: (await store.getMeta<string>(`lastSynced:${user.id}`)) ?? null });
  schedule(0);
}

export async function signIn(email: string, password: string) {
  const sb = await getSupabase();
  if (!sb) throw new Error('Supabase no está configurado.');
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(translate(error.message));
}

export async function signUp(email: string, password: string) {
  const sb = await getSupabase();
  if (!sb) throw new Error('Supabase no está configurado.');
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw new Error(translate(error.message));
  return { needsConfirmation: !data.session };
}

export async function signOut() {
  const sb = await getSupabase();
  await sb?.auth.signOut();
}

export async function accessToken(): Promise<string | null> {
  const sb = await getSupabase();
  const { data } = (await sb?.auth.getSession()) ?? { data: { session: null } };
  return data.session?.access_token ?? null;
}

function translate(msg: string) {
  if (/invalid login/i.test(msg)) return 'Email o contraseña incorrectos.';
  if (/email not confirmed/i.test(msg)) return 'Confirma tu email antes de iniciar sesión.';
  if (/password/i.test(msg) && /6/.test(msg)) return 'La contraseña debe tener al menos 6 caracteres.';
  if (/already registered/i.test(msg)) return 'Ese email ya tiene una cuenta.';
  if (/fetch/i.test(msg)) return 'No se pudo conectar con el servidor.';
  return msg;
}

// ---------------- Ciclo ----------------

let timer: ReturnType<typeof setTimeout> | null = null;
let running: Promise<void> | null = null;
let again = false;

export function schedule(delay = 0) {
  if (!status.userId) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void syncNow();
  }, delay);
}

export async function syncNow(): Promise<void> {
  if (!status.userId) return;
  if (!navigator.onLine) {
    set({ state: 'offline' });
    return;
  }
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    set({ state: 'syncing', error: null });
    try {
      await push();
      await pull();
      const now = new Date().toISOString();
      await store.setMeta(`lastSynced:${status.userId}`, now);
      set({ state: 'idle', lastSyncedAt: now });
    } catch (e) {
      console.error('[sync]', e);
      set({ state: navigator.onLine ? 'error' : 'offline', error: (e as Error).message || 'Error de sincronización' });
    } finally {
      running = null;
      if (again) {
        again = false;
        schedule(1000);
      }
    }
  })();
  return running;
}

async function push() {
  const sb = (await getSupabase())!;
  const items = store.pending();
  for (let i = 0; i < items.length; i += 200) {
    const chunk = items.slice(i, i + 200);
    const rows = chunk
      .map((it) => store.raw(it.id))
      .filter((r): r is AnyRecord => !!r)
      .map((r) => ({ id: r.id, kind: r.kind, payload: r, updated_at: r.updatedAt, deleted_at: r.deletedAt ?? null }));
    if (rows.length) {
      const { error } = await sb.from('pos_items').upsert(rows, { onConflict: 'id' });
      if (error) throw error;
    }
    await store.ack(chunk);
  }
}

async function pull() {
  const sb = (await getSupabase())!;
  const key = `cursor:${status.userId}`;
  let cursor = (await store.getMeta<string>(key)) ?? '1970-01-01T00:00:00Z';
  for (;;) {
    const { data, error } = await sb
      .from('pos_items')
      .select('id,kind,payload,server_updated_at')
      .gt('server_updated_at', cursor)
      .order('server_updated_at', { ascending: true })
      .limit(500);
    if (error) throw error;
    const rows = (data ?? []) as { id: string; kind: Kind; payload: AnyRecord; server_updated_at: string }[];
    if (!rows.length) break;
    const accepted = rows
      .filter((r) => KINDS.includes(r.kind) && r.payload && typeof r.payload === 'object')
      .map((r) => ({ ...r.payload, id: r.id, kind: r.kind }) as AnyRecord)
      .filter((remote) => {
        const local = store.raw(remote.id);
        if (!local) return true;
        if (store.hasPending(local.kind, local.id) && local.updatedAt > remote.updatedAt) return false;
        return remote.updatedAt >= local.updatedAt;
      });
    await store.applyRemote(accepted);
    cursor = rows[rows.length - 1].server_updated_at;
    await store.setMeta(key, cursor);
    if (rows.length < 500) break;
  }
}
