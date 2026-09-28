/**
 * Fichas completas: sinopsis y datos de libros (Google Books / Open Library)
 * y tráiler de películas (TMDB si está la clave; si no, búsqueda en YouTube).
 */
import { tmdb } from './ai';
import { toSpanish } from './media';

export interface BookDetails { synopsis: string; pages: string | null; published: string | null; publisher: string | null; categories: string[]; cover: string | null; link: string | null }

const strip = (h: string) => h.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n').trim();

async function get<T>(url: string): Promise<T> {
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

type GVol = { volumeInfo: { title?: string; authors?: string[]; description?: string; pageCount?: number; publishedDate?: string; publisher?: string; categories?: string[]; language?: string; imageLinks?: { thumbnail?: string; small?: string; medium?: string; large?: string }; infoLink?: string } };

export async function bookDetails(title: string, author: string): Promise<BookDetails> {
  const out: BookDetails = { synopsis: '', pages: null, published: null, publisher: null, categories: [], cover: null, link: null };
  // 1) Google Books: prioriza ediciones en español.
  for (const lang of ['es', '']) {
    try {
      const q = `intitle:${title}${author ? `+inauthor:${author}` : ''}`;
      const r = await get<{ items?: GVol[] }>(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5&printType=books${lang ? `&langRestrict=${lang}` : ''}`);
      const v = (r.items ?? []).map((i) => i.volumeInfo).sort((a, b) => (b.description?.length ?? 0) - (a.description?.length ?? 0))[0];
      if (v) {
        out.synopsis ||= strip(v.description ?? '');
        out.pages ||= v.pageCount ? String(v.pageCount) : null;
        out.published ||= v.publishedDate?.slice(0, 4) ?? null;
        out.publisher ||= v.publisher ?? null;
        if (!out.categories.length) out.categories = v.categories ?? [];
        const img = v.imageLinks?.large ?? v.imageLinks?.medium ?? v.imageLinks?.small ?? v.imageLinks?.thumbnail;
        out.cover ||= img ? img.replace('http://', 'https://').replace('&edge=curl', '') : null;
        out.link ||= v.infoLink ?? null;
      }
      if (out.synopsis) break;
    } catch {
      /* siguiente fuente */
    }
  }
  // 2) Open Library: descripción de la obra.
  if (!out.synopsis) {
    try {
      const s = await get<{ docs: { key?: string; cover_i?: number }[] }>(`https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}&limit=1&fields=key,cover_i`);
      const d = s.docs[0];
      if (d?.key) {
        const w = await get<{ description?: string | { value: string } }>(`https://openlibrary.org${d.key}.json`);
        out.synopsis = strip(typeof w.description === 'string' ? w.description : w.description?.value ?? '');
        out.link ||= `https://openlibrary.org${d.key}`;
      }
      if (!out.cover && d?.cover_i) out.cover = `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`;
    } catch {
      /* sin descripción */
    }
  }
  // 3) En español.
  if (out.synopsis && !/[áéíóúñ¿¡]|\b(el|la|los|las|que|una|del)\b/i.test(out.synopsis.slice(0, 400))) {
    out.synopsis = (await toSpanish([out.synopsis.slice(0, 3000)]))[0];
  }
  return out;
}

/** Portada en la mejor resolución disponible. */
export function bigCover(url: string | null | undefined) {
  if (!url) return null;
  if (url.includes('covers.openlibrary.org')) return url.replace(/-[SM]\.jpg$/, '-L.jpg');
  if (url.includes('books.google')) return url.replace(/zoom=\d/, 'zoom=0');
  if (url.includes('image.tmdb.org')) return url.replace(/\/w\d+\//, '/w780/');
  return url;
}

/** Tráiler: primero TMDB (si hay clave), después YouTube con tu cuenta conectada. */
export async function movieTrailer(title: string, year: string | null, tmdbId?: number): Promise<{ videoId: string | null; search: string }> {
  const search = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${title} ${year ?? ''} tráiler`)}`;
  if (tmdbId) {
    try {
      for (const language of ['es-MX', 'es-ES', 'en-US']) {
        const r = await tmdb<{ results: { key: string; site: string; type: string; official?: boolean }[] }>(`movie/${tmdbId}/videos`, { language });
        const v = r.results.filter((x) => x.site === 'YouTube').sort((a, b) => Number(b.type === 'Trailer') - Number(a.type === 'Trailer') || Number(!!b.official) - Number(!!a.official))[0];
        if (v) return { videoId: v.key, search };
      }
    } catch {
      /* sin TMDB */
    }
  }
  try {
    const { ytConnected, ytFind } = await import('./youtube');
    if (ytConnected()) {
      const r = await ytFind(`${title} ${year ?? ''} tráiler oficial`);
      if (r.videoId) return { videoId: r.videoId, search };
    }
  } catch {
    /* sin YouTube */
  }
  return { videoId: null, search };
}
