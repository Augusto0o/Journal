import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, useFeedback } from '@/components/ui';
import { aboutWork, aiAvailable } from '@/services/ai';
import { bigCover, bookDetails, movieTrailer, type BookDetails } from '@/services/details';
import { cx } from '@/utils/misc';

/** Portada a pantalla completa (tocá para cerrar). */
export function CoverViewer({ src, alt, onClose }: { src: string | null; alt: string; onClose: () => void }) {
  useEffect(() => {
    if (!src) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [src, onClose]);
  if (!src) return null;
  return createPortal(
    <button type="button" className="cover-viewer" onClick={onClose} aria-label="Cerrar portada">
      <img src={bigCover(src) ?? src} alt={alt} onError={(e) => { if (e.currentTarget.src !== src) e.currentTarget.src = src; }} />
    </button>,
    document.body,
  );
}

/** Sinopsis plegable. */
export function Synopsis({ text, loading }: { text: string; loading?: boolean }) {
  const [open, setOpen] = useState(false);
  if (loading) return <section className="about-block"><h3 className="about-title">Sinopsis</h3><div className="skeleton about-skel" /></section>;
  if (!text) return null;
  const long = text.length > 420;
  return (
    <section className="about-block">
      <h3 className="about-title">Sinopsis</h3>
      <p className={cx('about-text', long && !open && 'is-clamped')}>{text}</p>
      {long && <button type="button" className="link-btn about-more" onClick={() => setOpen((v) => !v)}>{open ? 'Ver menos' : 'Leer más'}</button>}
    </section>
  );
}

/** Resumen con IA: de qué trata, sin spoilers, y a quién le puede gustar. Se guarda para no volver a pedirlo. */
export function AiSummary({ kind, title, creator, year, synopsis, cached, onSave }: {
  kind: 'libro' | 'película'; title: string; creator: string; year?: string | null; synopsis?: string;
  cached?: { summary?: string; forWho?: string }; onSave?: (r: { summary: string; forWho?: string }) => void;
}) {
  const { toast } = useFeedback();
  const [r, setR] = useState<{ summary: string; forWho?: string } | null>(cached?.summary ? { summary: cached.summary, forWho: cached.forWho } : null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setR(cached?.summary ? { summary: cached.summary, forWho: cached.forWho } : null), [cached?.summary, cached?.forWho]);
  if (!r && !aiAvailable()) return null;
  return (
    <section className="about-block">
      <h3 className="about-title">Resumen</h3>
      {r ? (
        <>
          <p className="about-text">{r.summary}</p>
          {r.forWho && <p className="about-for">{r.forWho}</p>}
        </>
      ) : (
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={async () => {
          setBusy(true);
          try {
            const out = await aboutWork(kind, title, creator, year, synopsis);
            if (!out.summary) throw new Error('La IA no devolvió un resumen.');
            setR(out);
            onSave?.({ summary: out.summary, forWho: out.forWho });
          } catch (e) {
            toast((e as Error).message, { tone: 'error' });
          } finally {
            setBusy(false);
          }
        }}>{busy ? <span className="spinner" /> : <Icon name="sparkle" size={15} />} De qué trata, sin spoilers</button>
      )}
    </section>
  );
}

/** Ficha de un libro: datos, sinopsis y resumen. Lo encontrado se guarda en el libro. */
export function BookAbout({ title, creator, meta, cover, onPatch }: {
  title: string; creator: string; meta?: Record<string, string>; cover?: string | null;
  onPatch?: (p: { meta: Record<string, string>; cover?: string }) => void;
}) {
  const has = meta?.synopsis !== undefined;
  const [d, setD] = useState<BookDetails | null>(null);
  const [loading, setLoading] = useState(!has);
  useEffect(() => {
    if (has || !title) return;
    let alive = true;
    setLoading(true);
    void bookDetails(title, creator).then((r) => {
      if (!alive) return;
      setD(r);
      setLoading(false);
      const m: Record<string, string> = { ...(meta ?? {}), synopsis: r.synopsis };
      if (r.pages) m.pages = r.pages;
      if (r.published) m.published = r.published;
      if (r.publisher) m.publisher = r.publisher;
      if (r.link) m.link = r.link;
      onPatch?.({ meta: m, ...(!cover && r.cover ? { cover: r.cover } : {}) });
    }).catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, creator, has]);

  const synopsis = meta?.synopsis ?? d?.synopsis ?? '';
  const facts = [meta?.published ?? d?.published, (meta?.pages ?? d?.pages) ? `${meta?.pages ?? d?.pages} páginas` : null, meta?.publisher ?? d?.publisher].filter(Boolean);
  return (
    <>
      {facts.length > 0 && <p className="about-facts">{facts.join(' · ')}</p>}
      <Synopsis text={synopsis} loading={loading} />
      {!loading && !synopsis && <p className="about-for">No encontré una sinopsis para este libro.</p>}
      <AiSummary
        kind="libro" title={title} creator={creator} year={meta?.published} synopsis={synopsis}
        cached={{ summary: meta?.summary, forWho: meta?.forWho }}
        onSave={(r) => onPatch?.({ meta: { ...(meta ?? {}), synopsis, summary: r.summary, ...(r.forWho ? { forWho: r.forWho } : {}) } })}
      />
    </>
  );
}

/** Tráiler de una película, incrustado. */
export function Trailer({ title, year, tmdbId }: { title: string; year: string | null; tmdbId?: number }) {
  const [state, setState] = useState<{ videoId: string | null; search: string } | null>(null);
  const [play, setPlay] = useState(false);
  useEffect(() => {
    let alive = true;
    setState(null);
    setPlay(false);
    void movieTrailer(title, year, tmdbId).then((r) => alive && setState(r));
    return () => {
      alive = false;
    };
  }, [title, year, tmdbId]);
  if (!state) return <section className="about-block"><h3 className="about-title">Tráiler</h3><div className="skeleton trailer-frame" /></section>;
  if (!state.videoId) {
    return (
      <a className="row" href={state.search} target="_blank" rel="noopener noreferrer">
        <span className="row-main"><span className="row-label">Ver el tráiler en YouTube</span></span><Icon name="play" size={16} />
      </a>
    );
  }
  return (
    <section className="about-block">
      <h3 className="about-title">Tráiler</h3>
      {play ? (
        <iframe
          className="trailer-frame"
          src={`https://www.youtube-nocookie.com/embed/${state.videoId}?autoplay=1&playsinline=1&rel=0`}
          title={`Tráiler de ${title}`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      ) : (
        <button type="button" className="trailer-frame trailer-poster" onClick={() => setPlay(true)} aria-label={`Reproducir tráiler de ${title}`}>
          <img src={`https://i.ytimg.com/vi/${state.videoId}/hqdefault.jpg`} alt="" />
          <span className="play-disc is-light"><Icon name="play" size={20} filled strokeWidth={0} /></span>
        </button>
      )}
    </section>
  );
}
