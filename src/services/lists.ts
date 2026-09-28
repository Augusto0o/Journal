/**
 * Listas de la Biblioteca: videos, reels y enlaces guardados, separados por tema
 * («Videos de IA», «Música», «Recomendaciones»…). Se guardan como carpetas con scope 'media'
 * y se sincronizan como el resto. Una lista puede vincularse a una playlist de YouTube.
 */
import { store } from '@/database/store';
import type { Folder, MediaItem } from '@/types';
import { nowISO, uuid } from '@/utils/misc';

export type MediaList = Folder & { scope: 'media' };

export const mediaLists = (folders: Folder[]) =>
  folders.filter((f): f is MediaList => f.scope === 'media').sort((a, b) => a.name.localeCompare(b.name, 'es'));

export async function saveList(name: string, patch: Partial<Folder> = {}, id?: string): Promise<MediaList> {
  const cur = id ? store.get('folder', id) : undefined;
  const now = nowISO();
  const f = (cur
    ? { ...cur, ...patch, name, updatedAt: now }
    : { id: uuid(), createdAt: now, updatedAt: now, deletedAt: null, kind: 'folder', scope: 'media', name, ...patch }) as MediaList;
  await store.put(f);
  return f;
}

export async function deleteList(id: string) {
  const items = store.getSnapshot().media.filter((m) => m.listId === id).map((m) => ({ ...m, listId: null, updatedAt: nowISO() }));
  if (items.length) await store.put(items);
  await store.remove(id);
}

/** De dónde viene un enlace (para el ícono y para saber si se puede reproducir acá). */
export function sourceOf(m: Pick<MediaItem, 'url' | 'meta'>): 'youtube' | 'instagram' | 'tiktok' | 'web' {
  const u = m.url ?? '';
  if (m.meta?.videoId || /youtu\.?be/.test(u)) return 'youtube';
  if (/instagram\.com/.test(u)) return 'instagram';
  if (/tiktok\.com/.test(u)) return 'tiktok';
  return 'web';
}

export const SOURCE_LABEL = { youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok', web: 'Web' } as const;

/** Mueve un elemento a una lista. Si la lista está vinculada a una playlist de YouTube, también lo suma allá. */
export async function moveToList(m: MediaItem, list: MediaList | null) {
  await store.put({ ...m, listId: list?.id ?? null, updatedAt: nowISO() });
  if (list?.ytPlaylistId && m.meta?.videoId) {
    const { ytAdd } = await import('./youtube');
    await ytAdd(m, { id: list.ytPlaylistId, title: list.ytPlaylistTitle ?? list.name }).catch(() => undefined);
  }
}
