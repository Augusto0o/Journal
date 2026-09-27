import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, useFeedback } from '@/components/ui';
import { useStore } from '@/hooks/useData';
import { aiAvailable, aiProblem, recommend, type RecItem } from '@/services/ai';
import { newMedia, saveMedia, searchBooks, tasteProfile } from '@/services/media';
import { buildDocs } from '@/services/queries';

type Kind = 'books' | 'videos' | 'topics';

const KINDS: { id: Kind; label: string }[] = [{ id: 'books', label: 'Libros' }, { id: 'videos', label: 'Videos' }, { id: 'topics', label: 'Temas' }];

/** Recomendaciones personales (libros, videos y temas) dentro de Descubrir. */
export function ForYouSection() {
  const snap = useStore();
  const { toast } = useFeedback();
  const [kind, setKind] = useState<Kind | null>(null);
  const [items, setItems] = useState<Record<Kind, RecItem[] | undefined>>({ books: undefined, videos: undefined, topics: undefined });
  const [busy, setBusy] = useState(false);

  const load = async (k: Kind) => {
    setBusy(true);
    try {
      const recent = buildDocs(snap, [], 'all').filter((d) => d.kind === 'journal' || d.kind === 'note').slice(0, 30).map((d) => d.title).filter(Boolean);
      const profile = tasteProfile(snap.media, recent);
      setItems((s) => ({ ...s, [k]: undefined }));
      const r = await recommend(k, profile);
      setItems((s) => ({ ...s, [k]: r }));
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const addBook = async (it: RecItem) => {
    let cover: string | null = null;
    try {
      cover = (await searchBooks(`${it.title} ${it.creator}`))[0]?.cover ?? null;
    } catch {
      /* sin portada */
    }
    await saveMedia(newMedia('book', { title: it.title, creator: it.creator, genre: it.genre ?? null, cover, notes: it.why ?? '' }));
    toast('Agregado a Quiero leer');
  };

  const list = kind ? items[kind] : undefined;

  return (
    <section className="block">
      <div className="block-head"><h2>Más para vos</h2></div>
      {!aiAvailable() ? (
        <p className="quiet">{aiProblem()} Las recomendaciones usan lo que guardás, escuchás y escribís.</p>
      ) : (
        <div className="pill-row">
          {KINDS.map((k) => (
            <button key={k.id} type="button" className="pill-btn" aria-pressed={kind === k.id} onClick={() => { setKind(k.id); if (!items[k.id]) void load(k.id); }}>
              {busy && kind === k.id ? <span className="spinner" /> : null}{k.label}
            </button>
          ))}
        </div>
      )}
      {kind && list && (
        <>
          <ol className="rec-text-list">
            {list.map((it, i) => (
              <li key={`${it.title}-${i}`}>
                <span className="step-num">{i + 1}</span>
                <div className="grow">
                  <p className="media-title">{it.title}</p>
                  {it.creator && <p className="row-sub">{it.creator}{it.genre ? ` · ${it.genre}` : ''}</p>}
                  {it.why && <p className="rec-why">{it.why}</p>}
                </div>
                {kind === 'books' && <button type="button" className="icon-btn" aria-label={`Agregar ${it.title}`} onClick={() => void addBook(it)}><Icon name="plus" size={18} /></button>}
                {kind === 'videos' && <a className="icon-btn" aria-label="Buscar en YouTube" href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${it.title} ${it.creator}`)}`} target="_blank" rel="noopener noreferrer"><Icon name="arrowRight" size={18} /></a>}
                {kind === 'topics' && <Link className="icon-btn" aria-label="Preguntar al asistente" to={`/asistente?send=1&q=${encodeURIComponent(`Contame sobre ${it.title} para empezar a aprenderlo`)}`}><Icon name="sparkle" size={18} /></Link>}
              </li>
            ))}
          </ol>
          <button type="button" className="btn btn-secondary btn-block mt-4" onClick={() => void load(kind)} disabled={busy}>{busy ? <span className="spinner" /> : 'Otras recomendaciones'}</button>
        </>
      )}
    </section>
  );
}
