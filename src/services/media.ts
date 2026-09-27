/**
 * Biblioteca multimedia: libros, videos, música y obras de arte guardadas.
 * Solo se guardan referencias, enlaces y metadatos (nunca contenido protegido).
 * Portadas: Open Library (libros), YouTube (videos), iTunes (música), Art Institute of Chicago (arte).
 */
import type { MediaItem, MediaStatus, MediaType } from '@/types';
import { store } from '@/database/store';
import { nowISO, uuid } from '@/utils/misc';

export const BOOK_STATUS: { id: MediaStatus; label: string }[] = [
  { id: 'want', label: 'Quiero leer' },
  { id: 'reading', label: 'Leyendo' },
  { id: 'finished', label: 'Terminado' },
];

export const VIDEO_CATEGORIES = ['Ver más tarde', 'Aprender', 'Entretenimiento', 'Ideas'];
export const VIDEO_STATUS: { id: MediaStatus; label: string }[] = [
  { id: 'later', label: 'Pendiente' },
  { id: 'watched', label: 'Visto' },
];
export const MUSIC_CATEGORIES = ['Canción', 'Álbum', 'Artista', 'Playlist'];
export const MUSIC_STATUS: { id: MediaStatus; label: string }[] = [
  { id: 'later', label: 'Para escuchar' },
  { id: 'listened', label: 'Escuchado' },
  { id: 'liked', label: 'Favorito' },
];

export function newMedia(mediaType: MediaType, p: Partial<MediaItem> = {}): MediaItem {
  const now = nowISO();
  const status: MediaStatus = mediaType === 'book' ? 'want' : mediaType === 'art' ? 'saved' : 'later';
  return { id: uuid(), kind: 'media', createdAt: now, updatedAt: now, deletedAt: null, mediaType, title: '', creator: '', url: null, cover: null, genre: null, category: null, status, progress: 0, notes: '', plays: 0, ...p };
}

export const saveMedia = (m: MediaItem) => store.put(m);
export const deleteMedia = (id: string) => store.remove(id);

async function direct<T>(url: string, ms: number): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(String(r.status));
    return (await r.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Pide metadatos públicos directo desde el teléfono; si el servicio bloquea el pedido
 * (CORS) y tenés Supabase conectado, lo intenta a través de tu función `ai` (acción lookup).
 */
async function getJSON<T>(url: string, ms = 8000): Promise<T> {
  try {
    return await direct<T>(url, ms);
  } catch (err) {
    const { getSupabase } = await import('./supabaseClient');
    const sb = await getSupabase();
    if (!sb) throw err;
    const { data, error } = await sb.functions.invoke('ai', { body: { action: 'lookup', url } });
    if (error || !data || (data as { error?: string }).error) throw err;
    return data as T;
  }
}

// ---------------- Libros ----------------

export interface BookHit { title: string; creator: string; year: string | null; cover: string | null; genre: string | null; url: string | null }

export async function searchBooks(q: string): Promise<BookHit[]> {
  const r = await getJSON<{ docs: { title: string; author_name?: string[]; first_publish_year?: number; cover_i?: number; subject?: string[]; key?: string }[] }>(
    `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=8&fields=title,author_name,first_publish_year,cover_i,subject,key`,
  );
  return r.docs.map((d) => ({
    title: d.title,
    creator: d.author_name?.[0] ?? '',
    year: d.first_publish_year ? String(d.first_publish_year) : null,
    cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
    genre: d.subject?.find((s) => s.length < 24) ?? null,
    url: d.key ? `https://openlibrary.org${d.key}` : null,
  }));
}

// ---------------- Videos ----------------

export function parseYouTube(url: string): { videoId: string | null; listId: string | null } {
  try {
    const u = new URL(url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`);
    const listId = u.searchParams.get('list');
    let videoId = u.searchParams.get('v');
    if (!videoId && u.hostname.includes('youtu.be')) videoId = u.pathname.slice(1).split('/')[0] || null;
    if (!videoId) videoId = u.pathname.match(/\/(shorts|embed|live)\/([\w-]{6,})/)?.[2] ?? null;
    return { videoId, listId };
  } catch {
    return { videoId: null, listId: null };
  }
}

/** ¿Es un enlace de YouTube o YouTube Music? Devuelve el tipo de medio que corresponde. */
export function youtubeKind(text: string): { url: string; type: 'video' | 'music' } | null {
  const url = text.match(/https?:\/\/[^\s<>"]+/i)?.[0]?.replace(/[).,;]+$/, '');
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\.|^m\./, '');
    if (host === 'music.youtube.com') return { url, type: 'music' };
    if (host === 'youtube.com' || host === 'youtu.be') return { url, type: 'video' };
  } catch {
    /* no es una URL */
  }
  return null;
}

/** Guarda un enlace compartido de YouTube / YouTube Music en la Biblioteca, con título y miniatura. */
export async function saveYouTubeLink(text: string, force?: 'video' | 'music'): Promise<MediaItem | null> {
  const yt = youtubeKind(text);
  if (!yt) return null;
  const type = force ?? yt.type;
  const { videoId, listId } = parseYouTube(yt.url);
  const canonical = videoId ? `https://www.youtube.com/watch?v=${videoId}` : listId ? `https://www.youtube.com/playlist?list=${listId}` : yt.url;
  const meta = await fetchLinkMeta(canonical);
  const m = newMedia(type, {
    url: yt.url,
    title: meta.title || (type === 'music' ? 'Canción de YouTube Music' : 'Video de YouTube'),
    creator: meta.creator.replace(/\s*-\s*Topic$/i, ''),
    cover: meta.cover,
    category: type === 'music' ? (videoId ? 'Canción' : 'Playlist') : 'Ver más tarde',
    notes: text.replace(yt.url, '').trim(),
    meta: { ...(videoId ? { videoId } : {}), ...(listId ? { listId } : {}), source: 'share' },
  });
  await saveMedia(m);
  if (type === 'music') void import('./youtube').then((y) => y.ytAutoAdd(m));
  return m;
}

export async function fetchLinkMeta(url: string): Promise<{ title: string; creator: string; cover: string | null }> {
  const { videoId } = parseYouTube(url);
  try {
    const r = await getJSON<{ title?: string; author_name?: string; thumbnail_url?: string; error?: string }>(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
    if (r.error) throw new Error(r.error);
    return { title: r.title ?? '', creator: r.author_name ?? '', cover: r.thumbnail_url ?? (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null) };
  } catch {
    return { title: '', creator: '', cover: videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null };
  }
}

// ---------------- Música ----------------

export interface MusicHit { title: string; creator: string; album: string | null; cover: string | null; genre: string | null; previewUrl: string | null; url: string | null; year: string | null; category: string }

type ITunes = { wrapperType: string; kind?: string; trackName?: string; collectionName?: string; artistName: string; artworkUrl100?: string; previewUrl?: string; primaryGenreName?: string; trackViewUrl?: string; collectionViewUrl?: string; artistLinkUrl?: string; releaseDate?: string };

const toHit = (x: ITunes): MusicHit => ({
  title: x.trackName ?? x.collectionName ?? x.artistName,
  creator: x.artistName,
  album: x.collectionName ?? null,
  cover: x.artworkUrl100 ? x.artworkUrl100.replace('100x100bb', '400x400bb') : null,
  genre: x.primaryGenreName ?? null,
  previewUrl: x.previewUrl ?? null,
  url: x.trackViewUrl ?? x.collectionViewUrl ?? x.artistLinkUrl ?? null,
  year: x.releaseDate?.slice(0, 4) ?? null,
  category: x.wrapperType === 'track' ? 'Canción' : x.wrapperType === 'collection' ? 'Álbum' : 'Artista',
});

export async function searchMusic(term: string, entity: 'song' | 'album' | 'musicArtist' = 'song', limit = 10): Promise<MusicHit[]> {
  const r = await getJSON<{ results: ITunes[] }>(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=${entity}&limit=${limit}&country=AR`);
  return r.results.map(toHit);
}

/** Link para abrir en YouTube Music (búsqueda), sin depender de su API. */
export const ytMusicSearch = (title: string, creator: string) => `https://music.youtube.com/search?q=${encodeURIComponent(`${title} ${creator}`)}`;

// ---------------- Señales de gusto (recomendaciones) ----------------

export function tasteProfile(items: MediaItem[], extra: string[] = []): string {
  const music = items.filter((m) => m.mediaType === 'music');
  const liked = music.filter((m) => m.status === 'liked' || (m.plays ?? 0) > 1);
  const saved = music.filter((m) => m.status === 'later' || m.status === 'listened');
  const disliked = music.filter((m) => m.status === 'dismissed');
  const count = (arr: string[]) => Object.entries(arr.reduce<Record<string, number>>((a, x) => ((a[x] = (a[x] ?? 0) + 1), a), {})).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} (${n})`);
  const artists = count(music.filter((m) => m.status !== 'dismissed').map((m) => m.creator).filter(Boolean)).slice(0, 12);
  const genres = count(items.filter((m) => m.status !== 'dismissed').map((m) => m.genre ?? '').filter(Boolean)).slice(0, 10);
  const books = items.filter((m) => m.mediaType === 'book').map((b) => `${b.title} — ${b.creator} [${b.status}]`).slice(0, 15);
  const videos = items.filter((m) => m.mediaType === 'video').map((v) => `${v.title} (${v.category ?? ''})`).slice(0, 12);
  return [
    `Artistas guardados: ${artists.join(', ') || '—'}`,
    `Géneros: ${genres.join(', ') || '—'}`,
    `Canciones que le gustan o repite: ${liked.map((m) => `${m.title} — ${m.creator}`).slice(0, 15).join('; ') || '—'}`,
    `Para escuchar después: ${saved.map((m) => `${m.title} — ${m.creator}`).slice(0, 15).join('; ') || '—'}`,
    `Descartadas (no recomendar parecido): ${disliked.map((m) => `${m.title} — ${m.creator}`).slice(0, 15).join('; ') || '—'}`,
    `Libros: ${books.join('; ') || '—'}`,
    `Videos: ${videos.join('; ') || '—'}`,
    extra.length ? `Temas que consultó: ${extra.join(', ')}` : '',
  ].filter(Boolean).join('\n');
}

// ---------------- Obra del día (Cleveland Museum of Art, Open Access CC0) ----------------
// Antes se usaba el Art Institute of Chicago, pero su servidor de imágenes bloquea
// (403) las imágenes enlazadas desde otras apps. Cleveland sirve imágenes abiertas.

export interface Artwork { id: number | string; title: string; artist: string; year: string; museum: string; image: string; thumb: string; story: string; context: string; url: string }

type CmaArt = {
  id: number;
  title: string;
  creation_date?: string;
  creators?: { description?: string; role?: string }[];
  culture?: string[];
  technique?: string;
  description?: string | null;
  did_you_know?: string | null;
  url?: string;
  images?: { web?: { url?: string }; print?: { url?: string } };
};

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** Traduce al español: con tu IA si está activa; si no, con un traductor público gratuito. */
export async function toSpanish(texts: string[]): Promise<string[]> {
  const items = texts.map((t) => t.trim());
  const one = async (t: string): Promise<string> => {
    if (!t) return t;
    try {
      const { aiAvailable, transform } = await import('./ai');
      if (aiAvailable()) return (await transform('translate_es', t)).trim() || t;
    } catch {
      /* sigue con el traductor público */
    }
    try {
      const r = await direct<unknown[]>(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=es&dt=t&q=${encodeURIComponent(t)}`, 8000);
      const parts = (r[0] as [string][] | null) ?? [];
      const out = parts.map((p) => p[0]).join('').trim();
      if (out) return out;
    } catch {
      /* siguiente opción */
    }
    try {
      const r = await direct<{ responseData?: { translatedText?: string } }>(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(t.slice(0, 480))}&langpair=en|es`, 8000);
      return r.responseData?.translatedText?.trim() || t;
    } catch {
      return t;
    }
  };
  return Promise.all(items.map(one));
}

/** Nombre del artista a partir de «Claude Monet (French, 1840–1926)». */
function artistName(d?: string) {
  if (!d) return 'Artista desconocido';
  return d.split(/\s*\(/)[0].trim() || d;
}

let cmaTotal = 0;

const CMA_BASE = 'https://openaccess-api.clevelandart.org/api/artworks/?type=Painting&has_image=1&cc0=1';
const CMA_FIELDS = '&fields=id,title,creation_date,creators,culture,technique,description,did_you_know,url,images';

/** Una página de obras (sin traducir) a partir de una semilla. */
async function artPage(seed: number): Promise<CmaArt[]> {
  // Cuántas pinturas hay, para no pedir una página vacía.
  if (!cmaTotal) {
    try {
      const info = await getJSON<{ info?: { total?: number } }>(`${CMA_BASE}&limit=1&fields=id`);
      cmaTotal = info.info?.total ?? 0;
    } catch {
      cmaTotal = 0;
    }
  }
  const pages = Math.max(1, Math.floor((cmaTotal || 1000) / 25));
  const page = Math.abs(seed * 7919) % pages;
  let r = await getJSON<{ data: CmaArt[] }>(`${CMA_BASE}&limit=25&skip=${page * 25}${CMA_FIELDS}`);
  if (!r.data?.length) r = await getJSON<{ data: CmaArt[] }>(`${CMA_BASE}&limit=25&skip=0${CMA_FIELDS}`);
  const pool = r.data.filter((a) => a.images?.web?.url);
  const withText = pool.filter((a) => a.description || a.did_you_know);
  return withText.length >= 4 ? withText : pool;
}

/** Traduce y arma la ficha de una obra. */
async function toArtwork(a: CmaArt): Promise<Artwork> {
  const desc = stripHtml(a.description ?? '');
  const fact = stripHtml(a.did_you_know ?? '');
  const creator = a.creators?.find((c) => c.role === 'artist') ?? a.creators?.[0];
  const origin = creator?.description?.match(/\(([^)]+)\)/)?.[1] ?? a.culture?.[0] ?? '';
  const [title, story, context, technique, from] = await toSpanish([a.title, desc, fact, a.technique ?? '', origin]);
  return {
    id: a.id,
    title,
    artist: artistName(creator?.description),
    year: a.creation_date ?? '',
    museum: 'Cleveland Museum of Art',
    image: a.images?.print?.url ?? a.images!.web!.url!,
    thumb: a.images!.web!.url!,
    story,
    context: [[technique, from].filter(Boolean).join(' · '), context ? `¿Sabías que…? ${context}` : ''].filter(Boolean).join('\n\n'),
    url: a.url ?? `https://www.clevelandart.org/art/${a.id}`,
  };
}

export interface ArtThumb { id: number; title: string; artist: string; thumb: string; seed: number; index: number }

export async function fetchArtwork(seed: number, index?: number): Promise<Artwork> {
  const list = await artPage(seed);
  const a = list[(index ?? Math.abs(seed)) % Math.max(1, list.length)] ?? list[0];
  if (!a) throw new Error('Sin obra disponible');
  return toArtwork(a);
}

/** Otras obras de la misma tanda, para explorar (miniaturas). */
export async function moreArtworks(seed: number, excludeId?: number | string): Promise<ArtThumb[]> {
  const list = await artPage(seed);
  return list
    .map((a, index) => ({ a, index }))
    .filter(({ a }) => a.id !== excludeId)
    .slice(0, 12)
    .map(({ a, index }) => ({ id: a.id, title: a.title, artist: artistName((a.creators?.find((c) => c.role === 'artist') ?? a.creators?.[0])?.description), thumb: a.images!.web!.url!, seed, index }));
}
