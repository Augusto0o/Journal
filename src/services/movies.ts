/**
 * Películas: búsqueda, datos (portada, sinopsis), dónde verlas y recomendaciones.
 *
 * Fuentes, en orden:
 * - TMDB (si cargaste TMDB_API_KEY en Supabase): portada, sinopsis en español,
 *   géneros y plataformas de streaming en Argentina (datos de JustWatch).
 * - Wikipedia (sin clave): portada desde la Wikipedia en inglés y sinopsis desde la
 *   Wikipedia en español.
 * Las recomendaciones las arma tu IA según tu diario y el género elegido.
 */
import { aiAvailable, recommend, tmdb, type RecItem } from './ai';
import { newMedia, saveMedia } from './media';
import type { MediaItem } from '@/types';

export interface MovieHit {
  key: string;
  title: string;
  originalTitle?: string;
  year: string | null;
  poster: string | null;
  backdrop?: string | null;
  synopsis: string;
  genres: string[];
  director?: string;
  tmdbId?: number;
  wiki?: string;
  why?: string;
}

export interface Provider { name: string; logo: string | null; kind: 'stream' | 'rent' | 'buy' }
export interface WhereToWatch { providers: Provider[]; link: string; source: 'tmdb' | 'search' }

export const MOVIE_GENRES: { id: string; label: string; tmdb?: number }[] = [
  { id: 'drama', label: 'Drama', tmdb: 18 },
  { id: 'comedia', label: 'Comedia', tmdb: 35 },
  { id: 'thriller', label: 'Suspenso', tmdb: 53 },
  { id: 'scifi', label: 'Ciencia ficción', tmdb: 878 },
  { id: 'terror', label: 'Terror', tmdb: 27 },
  { id: 'romance', label: 'Romance', tmdb: 10749 },
  { id: 'animacion', label: 'Animación', tmdb: 16 },
  { id: 'documental', label: 'Documental', tmdb: 99 },
  { id: 'aventura', label: 'Aventura', tmdb: 12 },
  { id: 'crimen', label: 'Policial', tmdb: 80 },
  { id: 'fantasia', label: 'Fantasía', tmdb: 14 },
  { id: 'historia', label: 'Historia', tmdb: 36 },
  { id: 'argentino', label: 'Cine argentino' },
  { id: 'clasicos', label: 'Clásicos' },
];

const IMG = 'https://image.tmdb.org/t/p/';

// ---------------- TMDB ----------------

let tmdbState: 'unknown' | 'on' | 'off' = 'unknown';
let genreNames: Record<number, string> | null = null;

async function tryTmdb<T>(path: string, params: Record<string, string | number> = {}): Promise<T | null> {
  if (tmdbState === 'off' || !aiAvailable()) return null;
  try {
    const r = await tmdb<T>(path, { language: 'es-AR', region: 'AR', ...params });
    tmdbState = 'on';
    return r;
  } catch (e) {
    if (String((e as Error).message).includes('no_tmdb')) tmdbState = 'off';
    return null;
  }
}

export const tmdbEnabled = () => tmdbState === 'on';

async function genres(): Promise<Record<number, string>> {
  if (genreNames) return genreNames;
  const r = await tryTmdb<{ genres: { id: number; name: string }[] }>('genre/movie/list');
  genreNames = Object.fromEntries((r?.genres ?? []).map((g) => [g.id, g.name]));
  return genreNames;
}

type TmdbMovie = { id: number; title: string; original_title: string; release_date?: string; poster_path?: string | null; backdrop_path?: string | null; overview?: string; genre_ids?: number[] };

async function fromTmdb(m: TmdbMovie): Promise<MovieHit> {
  const g = await genres();
  return {
    key: `tmdb:${m.id}`,
    title: m.title,
    originalTitle: m.original_title,
    year: m.release_date?.slice(0, 4) || null,
    poster: m.poster_path ? `${IMG}w342${m.poster_path}` : null,
    backdrop: m.backdrop_path ? `${IMG}w780${m.backdrop_path}` : null,
    synopsis: m.overview ?? '',
    genres: (m.genre_ids ?? []).map((id) => g[id]).filter(Boolean),
    tmdbId: m.id,
  };
}

// ---------------- Wikipedia (sin clave) ----------------

async function getJson<T>(url: string): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(String(r.status));
    return (await r.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

type WikiPage = { pageid: number; title: string; index?: number; thumbnail?: { source: string }; langlinks?: { lang: string; '*': string }[]; pageprops?: { disambiguation?: string } };

async function fromWikipedia(query: string, year?: string | null, limit = 6): Promise<MovieHit[]> {
  const q = `${query} ${year ?? ''} film`.trim();
  const en = await getJson<{ query?: { pages: Record<string, WikiPage> } }>(
    `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=${limit}&prop=pageimages|langlinks|pageprops&piprop=thumbnail&pithumbsize=500&pilicense=any&lllang=es&format=json&origin=*`,
  );
  const pages = Object.values(en.query?.pages ?? {}).filter((p) => !p.pageprops?.disambiguation).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const out = await Promise.all(
    pages.map(async (p): Promise<MovieHit | null> => {
      const esTitle = p.langlinks?.[0]?.['*'];
      let synopsis = '';
      let desc = '';
      let title = esTitle ?? p.title.replace(/\s*\((\d{4} )?film\)$/i, '');
      try {
        const s = await getJson<{ extract?: string; description?: string; title?: string }>(
          esTitle ? `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(esTitle)}` : `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(p.title)}`,
        );
        synopsis = s.extract ?? '';
        desc = s.description ?? '';
        if (esTitle && s.title) title = s.title;
      } catch {
        /* sin sinopsis */
      }
      const isFilm = /film|película|pel[ií]cula|largometraje/i.test(`${p.title} ${desc} ${synopsis.slice(0, 160)}`);
      if (!isFilm) return null;
      const y = `${p.title} ${desc} ${synopsis}`.match(/\b(19[0-9]{2}|20[0-4][0-9])\b/)?.[1] ?? null;
      return {
        key: `wiki:${p.pageid}`,
        title: title.replace(/\s*\((película|film)[^)]*\)$/i, ''),
        year: y,
        poster: p.thumbnail?.source ?? null,
        synopsis,
        genres: [],
        wiki: esTitle ? `https://es.wikipedia.org/wiki/${encodeURIComponent(esTitle)}` : `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title)}`,
      };
    }),
  );
  return out.filter((x): x is MovieHit => !!x);
}

// ---------------- API pública ----------------

export async function searchMovies(query: string): Promise<MovieHit[]> {
  const q = query.trim();
  if (!q) return [];
  const r = await tryTmdb<{ results: TmdbMovie[] }>('search/movie', { query: q, include_adult: 'false' });
  if (r) return Promise.all(r.results.slice(0, 12).map(fromTmdb));
  return fromWikipedia(q);
}

/** Busca los datos de una película puntual (título + año) para completar una recomendación. */
export async function lookupMovie(title: string, year?: string | null): Promise<MovieHit | null> {
  const r = await tryTmdb<{ results: TmdbMovie[] }>('search/movie', { query: title, ...(year ? { year } : {}) });
  if (r?.results?.[0]) return fromTmdb(r.results[0]);
  try {
    return (await fromWikipedia(title, year, 3))[0] ?? null;
  } catch {
    return null;
  }
}

export async function whereToWatch(hit: Pick<MovieHit, 'tmdbId' | 'title' | 'year'>): Promise<WhereToWatch> {
  const search = `https://www.justwatch.com/ar/buscar?q=${encodeURIComponent(hit.title)}`;
  if (!hit.tmdbId) return { providers: [], link: search, source: 'search' };
  type P = { provider_name: string; logo_path?: string };
  const r = await tryTmdb<{ results?: Record<string, { link?: string; flatrate?: P[]; rent?: P[]; buy?: P[]; ads?: P[]; free?: P[] }> }>(`movie/${hit.tmdbId}/watch/providers`);
  const ar = r?.results?.AR;
  if (!ar) return { providers: [], link: search, source: r ? 'tmdb' : 'search' };
  const map = (list: P[] | undefined, kind: Provider['kind']) => (list ?? []).map((p) => ({ name: p.provider_name, logo: p.logo_path ? `${IMG}w92${p.logo_path}` : null, kind }));
  const providers = [...map(ar.flatrate, 'stream'), ...map(ar.free, 'stream'), ...map(ar.ads, 'stream'), ...map(ar.rent, 'rent'), ...map(ar.buy, 'buy')];
  const seen = new Set<string>();
  return { providers: providers.filter((p) => (seen.has(p.name + p.kind) ? false : (seen.add(p.name + p.kind), true))), link: ar.link ?? search, source: 'tmdb' };
}

/** Perfil de gustos a partir del diario de películas (para la IA). */
export function movieProfile(items: MediaItem[], genre?: string | null): string {
  const movies = items.filter((m) => m.mediaType === 'movie');
  const loved = movies.filter((m) => (m.rating ?? 0) >= 4).map((m) => `${m.title}${m.year ? ` (${m.year})` : ''} ★${m.rating}`);
  const disliked = movies.filter((m) => m.rating && m.rating <= 2).map((m) => m.title);
  const seen = movies.map((m) => m.title);
  return [
    genre ? `Género pedido: ${genre}. Recomendá solo películas de ese género.` : 'Sin género fijo: mezclá géneros.',
    `Le encantaron: ${loved.slice(0, 20).join('; ') || '—'}`,
    `No le gustaron: ${disliked.slice(0, 10).join('; ') || '—'}`,
    `Ya vistas o guardadas (no repetir): ${seen.slice(0, 60).join('; ') || '—'}`,
    'Vive en Argentina: podés incluir cine argentino y latinoamericano si encaja.',
  ].join('\n');
}

export async function recommendMovies(items: MediaItem[], genreId?: string | null): Promise<MovieHit[]> {
  const genre = MOVIE_GENRES.find((g) => g.id === genreId);
  const known = new Set(items.filter((m) => m.mediaType === 'movie').map((m) => m.title.toLowerCase()));
  if (aiAvailable()) {
    let recs: RecItem[] = [];
    try {
      recs = await recommend('movies', movieProfile(items, genre?.label));
    } catch {
      recs = [];
    }
    if (recs.length) {
      const hits = await Promise.all(
        recs.slice(0, 8).map(async (r) => {
          const h = await lookupMovie(r.title, r.year).catch(() => null);
          const base: MovieHit = h ?? { key: `ai:${r.title}`, title: r.title, year: r.year ?? null, poster: null, synopsis: '', genres: r.genre ? [r.genre] : [] };
          return { ...base, director: r.creator || base.director, why: r.why };
        }),
      );
      return hits.filter((h) => !known.has(h.title.toLowerCase()));
    }
  }
  // Sin IA: lo más valorado del género en TMDB (si está configurado).
  if (genre?.tmdb) {
    const r = await tryTmdb<{ results: TmdbMovie[] }>('discover/movie', { with_genres: genre.tmdb, sort_by: 'vote_average.desc', 'vote_count.gte': 800, page: 1 + Math.floor(Math.random() * 3) });
    if (r) return (await Promise.all(r.results.slice(0, 12).map(fromTmdb))).filter((h) => !known.has(h.title.toLowerCase()));
  }
  throw new Error('Para recomendaciones activá la IA en Ajustes → IA.');
}

/** Guarda una película en la Biblioteca (para ver, o vista con puntaje). */
export async function saveMovie(hit: MovieHit, patch: Partial<MediaItem> = {}, existing?: MediaItem | null): Promise<MediaItem> {
  const base = existing ?? newMedia('movie', {
    title: hit.title,
    creator: hit.director ?? '',
    cover: hit.poster,
    year: hit.year,
    genre: hit.genres[0] ?? null,
    url: hit.tmdbId ? `https://www.themoviedb.org/movie/${hit.tmdbId}` : hit.wiki ?? null,
    meta: {
      ...(hit.tmdbId ? { tmdbId: String(hit.tmdbId) } : {}),
      ...(hit.synopsis ? { synopsis: hit.synopsis.slice(0, 1200) } : {}),
      ...(hit.originalTitle ? { originalTitle: hit.originalTitle } : {}),
    },
  });
  const m = { ...base, ...patch } as MediaItem;
  await saveMedia(m);
  return m;
}

/** Datos de una película guardada, en el formato de búsqueda (para abrir su ficha). */
export function hitFromItem(m: MediaItem): MovieHit {
  return {
    key: m.id,
    title: m.title,
    originalTitle: m.meta?.originalTitle,
    year: m.year ?? null,
    poster: m.cover ?? null,
    synopsis: m.meta?.synopsis ?? '',
    genres: m.genre ? [m.genre] : [],
    director: m.creator || undefined,
    tmdbId: m.meta?.tmdbId ? Number(m.meta.tmdbId) : undefined,
    wiki: m.url && m.url.includes('wikipedia') ? m.url : undefined,
  };
}
