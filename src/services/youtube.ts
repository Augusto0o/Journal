import type { MediaItem } from '@/types';
import { getSupabase } from './supabaseClient';
import { syncStatusStore } from './sync';

/**
 * YouTube Music: agregar canciones a una lista tuya. La autorización de Google queda en tu
 * Supabase (función «youtube»); la app nunca ve tus claves.
 */
export interface YtStatus { configured: boolean; connected: boolean; playlist: { id: string; title: string } | null; auto: boolean }
export interface YtPlaylist { id: string; title: string; count: number; thumb: string | null }

const CACHE = 'pos-youtube';

export function ytCached(): YtStatus | null {
  try {
    return JSON.parse(localStorage.getItem(CACHE) ?? 'null');
  } catch {
    return null;
  }
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const sb = await getSupabase();
  if (!sb || !syncStatusStore.getSnapshot().userId) throw new Error('Conectá Supabase e iniciá sesión en Ajustes → Sincronización.');
  const { data, error } = await sb.functions.invoke('youtube', { body });
  if (error) {
    let msg = error.message;
    try {
      const j = await (error as { context?: Response }).context?.json();
      if (j?.error) msg = j.error;
    } catch {
      /* sin detalle */
    }
    if (/failed to send|fetch/i.test(msg)) msg = 'Falta publicar la función «youtube» en Supabase.';
    throw new Error(msg);
  }
  return data as T;
}

export async function ytStatus() {
  const s = await call<YtStatus>({ action: 'status' });
  localStorage.setItem(CACHE, JSON.stringify(s));
  return s;
}

export async function ytConnect() {
  const { url } = await call<{ url: string }>({ action: 'auth-url', returnTo: `${location.origin}/ajustes?youtube=ok#youtube` });
  location.href = url;
}

let listsCache: YtPlaylist[] | null = null;
export async function ytPlaylists(fresh = false) {
  if (listsCache && !fresh) return listsCache;
  listsCache = await call<{ items: YtPlaylist[] }>({ action: 'playlists' }).then((r) => r.items);
  return listsCache;
}

/** Lo que escuchás en YouTube Music (me gusta + tus listas), para recomendar a partir de eso. */
let tasteCache: { at: number; items: { title: string; artist: string }[] } | null = null;
export async function ytTaste() {
  if (tasteCache && Date.now() - tasteCache.at < 30 * 60_000) return tasteCache.items;
  const r = await call<{ items: { title: string; artist: string }[] }>({ action: 'taste' });
  tasteCache = { at: Date.now(), items: r.items };
  return r.items;
}

/** Busca un video (por ejemplo, el tráiler de una película). */
export const ytFind = (query: string) => call<{ videoId: string | null; title: string | null }>({ action: 'find', query });

export const ytConnected = () => Boolean(ytCached()?.connected);

export async function ytSetPlaylist(p: { id: string; title: string } | null, auto?: boolean) {
  await call({ action: 'set-playlist', id: p?.id ?? null, title: p?.title ?? null, auto });
  return ytStatus();
}

export async function ytDisconnect() {
  await call({ action: 'disconnect' });
  localStorage.removeItem(CACHE);
}

function videoIdOf(m: MediaItem): string | null {
  const id = (m.meta as Record<string, unknown> | undefined)?.videoId;
  return typeof id === 'string' ? id : null;
}

/** Agrega la canción a tu lista. Con un enlace de YouTube usa ese video; si no, la busca por título y artista. */
export async function ytAdd(m: Pick<MediaItem, 'title' | 'creator' | 'meta'>, list?: { id: string; title: string }) {
  const videoId = videoIdOf(m as MediaItem);
  const target = list ? { playlistId: list.id, playlistTitle: list.title } : {};
  return call<{ ok: boolean; playlist: string }>(videoId ? { action: 'add', videoId, ...target } : { action: 'add', query: `${m.title} ${m.creator}`.trim(), ...target });
}

export const ytReady = () => {
  const s = ytCached();
  return Boolean(s?.connected && s.playlist);
};

/** Si activaste «agregar solas», cada canción nueva que guardás va también a tu lista. */
export function ytAutoAdd(m: MediaItem, notify?: (msg: string) => void) {
  const s = ytCached();
  if (m.mediaType !== 'music' || !s?.connected || !s.playlist || !s.auto) return;
  if (m.category && !/canci/i.test(m.category)) return; // álbumes, artistas y playlists no
  void ytAdd(m).then(() => notify?.(`También en «${s.playlist!.title}»`)).catch(() => undefined);
}
