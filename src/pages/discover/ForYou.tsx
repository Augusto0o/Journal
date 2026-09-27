import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, useFeedback } from '@/components/ui';
import { useStore } from '@/hooks/useData';
import { aiAvailable, recommend, type RecItem } from '@/services/ai';
import { newMedia, saveMedia, searchBooks, tasteProfile } from '@/services/media';
import { buildDocs } from '@/services/queries';
import { Cover } from '@/pages/library/MediaTabs';

export type RecKind = 'books' | 'videos' | 'topics';

interface BookRec extends RecItem { cover?: string | null; year?: string }

const SUBJECTS = ['fiction', 'philosophy', 'history', 'psychology', 'science', 'biography', 'poetry', 'self-help', 'fantasy', 'mystery'];
const SUBJECT_LABEL: Record<string, string> = { fiction: 'Ficción', philosophy: 'Filosofía', history: 'Historia', psychology: 'Psicología', science: 'Ciencia', biography: 'Biografías', poetry: 'Poesía', 'self-help': 'Desarrollo personal', fantasy: 'Fantasía', mystery: 'Misterio' };

/** Sin IA: libros populares de Open Library según un tema. */
async function openLibrarySubject(subject: string): Promise<BookRec[]> {
  const r = await fetch(`https://openlibrary.org/subjects/${subject}.json?limit=24&offset=${Math.floor(Math.random() * 60)}`);
  const j = (await r.json()) as { works?: { title: string; authors?: { name: string }[]; cover_id?: number; first_publish_year?: number }[] };
  return (j.works ?? []).filter((w) => w.cover_id).slice(0, 10).map((w) => ({
    title: w.title,
    creator: w.authors?.[0]?.name ?? '',
    cover: `https://covers.openlibrary.org/b/id/${w.cover_id}-M.jpg`,
    year: w.first_publish_year ? String(w.first_publish_year) : undefined,
    why: `Popular en ${SUBJECT_LABEL[subject] ?? subject}`,
  }));
}

/** Recomendaciones de libros, videos o temas, según lo que guardás y escribís. */
export function ForYouSection({ kind }: { kind: RecKind }) {
  const snap = useStore();
  const { toast } = useFeedback();
  const [items, setItems] = useState<BookRec[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const ai = aiAvailable();

  const load = async (subj = subject) => {
    setBusy(true);
    setItems(null);
    try {
      if (!ai) {
        if (kind !== 'books') throw new Error('Activá la IA en Ajustes → IA para estas recomendaciones.');
        setItems(await openLibrarySubject(subj));
        return;
      }
      const recent = buildDocs(snap, [], 'all').filter((d) => d.kind === 'journal' || d.kind === 'note').slice(0, 30).map((d) => d.title).filter(Boolean);
      const r = await recommend(kind, tasteProfile(snap.media, recent));
      if (kind !== 'books') {
        setItems(r);
        return;
      }
      // Portadas desde Open Library.
      const withCovers = await Promise.all(r.map(async (it) => {
        try {
          const hit = (await searchBooks(`${it.title} ${it.creator}`))[0];
          return { ...it, cover: hit?.cover ?? null, year: hit?.year ?? undefined };
        } catch {
          return { ...it, cover: null };
        }
      }));
      setItems(withCovers);
    } catch (e) {
      const msg = (e as Error).message;
      toast(/fetch|network|load failed/i.test(msg) ? 'No se pudieron cargar las recomendaciones (¿sin conexión?).' : msg, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const addBook = async (it: BookRec) => {
    let cover = it.cover ?? null;
    if (!cover) {
      try {
        cover = (await searchBooks(`${it.title} ${it.creator}`))[0]?.cover ?? null;
      } catch {
        /* sin portada */
      }
    }
    await saveMedia(newMedia('book', { title: it.title, creator: it.creator, genre: it.genre ?? null, cover, notes: it.why ?? '' }));
    toast('Agregado a Para leer');
  };

  return (
    <section className="block">
      {kind === 'books' && !ai && (
        <div className="genre-row">
          {SUBJECTS.map((s) => (
            <button key={s} type="button" className="pill-btn" aria-pressed={subject === s} onClick={() => { setSubject(s); void load(s); }}>{SUBJECT_LABEL[s]}</button>
          ))}
        </div>
      )}
      {busy && <div className="rec-skeleton">{Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton" />)}</div>}
      {items && (
        <div className="list">
          {items.map((it, i) => (
            <div key={`${it.title}-${i}`} className="rec-item">
              {kind === 'books' ? <Cover src={it.cover} kind="book" alt={it.title} /> : <span className="rec-num num">{i + 1}</span>}
              <div className="grow">
                <p className="media-title">{it.title}</p>
                {it.creator && <p className="row-sub">{it.creator}{it.year ? ` · ${it.year}` : it.genre ? ` · ${it.genre}` : ''}</p>}
                {it.why && <p className="rec-why">{it.why}</p>}
              </div>
              {kind === 'books' && <button type="button" className="icon-btn" aria-label={`Agregar ${it.title}`} onClick={() => void addBook(it)}><Icon name="plus" size={18} /></button>}
              {kind === 'videos' && <a className="icon-btn" aria-label="Buscar en YouTube" href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${it.title} ${it.creator}`)}`} target="_blank" rel="noopener noreferrer"><Icon name="arrowRight" size={18} /></a>}
              {kind === 'topics' && <Link className="icon-btn" aria-label="Preguntar al asistente" to={`/asistente?send=1&q=${encodeURIComponent(`Contame sobre ${it.title} para empezar a aprenderlo`)}`}><Icon name="sparkle" size={18} /></Link>}
            </div>
          ))}
        </div>
      )}
      {!busy && (
        <button type="button" className="btn btn-secondary btn-block mt-4" onClick={() => void load()}>
          <Icon name="refresh" size={16} /> Otras recomendaciones
        </button>
      )}
    </section>
  );
}
