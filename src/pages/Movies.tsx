import { AiSummary, CoverViewer, Synopsis, Trailer } from '@/components/media/About';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BottomSheet, Icon, NavBar, useFeedback } from '@/components/ui';
import { useStore } from '@/hooks/useData';
import { aiAvailable } from '@/services/ai';
import { deleteMedia, saveMedia } from '@/services/media';
import {
  hitFromItem, MOVIE_GENRES, recommendMovies, saveMovie, searchMovies, whereToWatch,
  type MovieHit, type WhereToWatch,
} from '@/services/movies';
import type { MediaItem } from '@/types';
import { formatRelativeDay, todayISO } from '@/utils/date';
import { cx } from '@/utils/misc';

/**
 * «Películas»: buscar, recomendaciones por género, dónde verlas y un diario
 * de lo que viste con puntaje (al estilo Letterboxd).
 */
export default function Movies() {
  const snap = useStore();
  const [params, setParams] = useSearchParams();
  const { toast } = useFeedback();
  const movies = useMemo(() => snap.media.filter((m) => m.mediaType === 'movie'), [snap.media]);
  const diary = useMemo(() => movies.filter((m) => m.status === 'watched').sort((a, b) => (b.watchedOn ?? b.updatedAt).localeCompare(a.watchedOn ?? a.updatedAt)), [movies]);
  const watchlist = movies.filter((m) => m.status !== 'watched');

  const [q, setQ] = useState('');
  const [results, setResults] = useState<MovieHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [genre, setGenre] = useState<string | null>(null);
  const [recs, setRecs] = useState<MovieHit[] | null>(null);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [open, setOpen] = useState<MovieHit | null>(null);

  // Abrir una película guardada desde la Biblioteca (?id=)
  const idParam = params.get('id');
  useEffect(() => {
    if (!idParam) return;
    const m = movies.find((x) => x.id === idParam);
    if (m) setOpen(hitFromItem(m));
    setParams({}, { replace: true });
  }, [idParam, movies, setParams]);

  const search = async () => {
    if (!q.trim()) return;
    setSearching(true);
    try {
      setResults(await searchMovies(q));
    } catch {
      toast('No se pudo buscar (¿sin conexión?).', { tone: 'error' });
    } finally {
      setSearching(false);
    }
  };

  const loadRecs = async (g: string | null) => {
    setGenre(g);
    setLoadingRecs(true);
    setRecs(null);
    try {
      setRecs(await recommendMovies(snap.media, g));
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setLoadingRecs(false);
    }
  };

  const year = new Date().getFullYear().toString();
  const thisYear = diary.filter((m) => (m.watchedOn ?? '').startsWith(year)).length;
  const rated = diary.filter((m) => m.rating);
  const avg = rated.length ? rated.reduce((s, m) => s + (m.rating ?? 0), 0) / rated.length : 0;

  return (
    <main className="page movies">
      <NavBar back="/biblioteca" backLabel="Biblioteca" />
      <header className="today-head"><h1 className="today-title">Películas</h1></header>

      <form className="search-field" onSubmit={(e) => { e.preventDefault(); void search(); }}>
        <Icon name="search" size={18} />
        <input type="search" placeholder="Buscar una película" value={q} onChange={(e) => { setQ(e.target.value); if (!e.target.value) setResults(null); }} enterKeyHint="search" />
        {searching && <span className="spinner" />}
      </form>

      {results && (
        <section className="block">
          <div className="block-head"><h2>Resultados</h2><button type="button" className="quiet-btn" onClick={() => { setResults(null); setQ(''); }}>Cerrar</button></div>
          {!results.length ? <p className="quiet">Nada con ese título.</p> : (
            <div className="list">
              {results.map((h) => (
                <button key={h.key} type="button" className="movie-row" onClick={() => setOpen(h)}>
                  <Poster src={h.poster} title={h.title} small />
                  <span className="grow">
                    <span className="movie-row-title">{h.title}{h.year && <span className="muted"> · {h.year}</span>}</span>
                    {h.synopsis && <span className="movie-row-text clamp-2">{h.synopsis}</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="block">
        <div className="block-head"><h2>Para vos</h2>{recs && <button type="button" className="quiet-btn" onClick={() => void loadRecs(genre)}>Otras</button>}</div>
        <div className="genre-row" role="radiogroup" aria-label="Género">
          <button type="button" role="radio" aria-checked={recs !== null && genre === null} className="pill-btn" onClick={() => void loadRecs(null)}>Sorprendeme</button>
          {MOVIE_GENRES.map((g) => (
            <button key={g.id} type="button" role="radio" aria-checked={genre === g.id} className="pill-btn" onClick={() => void loadRecs(g.id)}>{g.label}</button>
          ))}
        </div>
        {loadingRecs && <div className="poster-grid">{Array.from({ length: 6 }, (_, i) => <div key={i} className="poster skeleton" />)}</div>}
        {!loadingRecs && !recs && <p className="quiet">{aiAvailable() ? 'Elegí un género o tocá «Sorprendeme». Aprende de lo que puntuás.' : 'Activá la IA en Ajustes → IA para recibir recomendaciones.'}</p>}
        {recs && (
          <div className="poster-grid">
            {recs.map((h) => (
              <button key={h.key} type="button" className="poster-card" onClick={() => setOpen(h)}>
                <Poster src={h.poster} title={h.title} />
                <span className="poster-title clamp-2">{h.title}</span>
                {h.year && <span className="poster-sub">{h.year}</span>}
              </button>
            ))}
          </div>
        )}
      </section>

      {watchlist.length > 0 && (
        <section className="block">
          <div className="block-head"><h2>Para ver</h2><span className="num">{watchlist.length}</span></div>
          <div className="poster-strip">
            {watchlist.map((m) => (
              <button key={m.id} type="button" className="poster-card" onClick={() => setOpen(hitFromItem(m))}>
                <Poster src={m.cover} title={m.title} />
                <span className="poster-title clamp-2">{m.title}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="block">
        <div className="block-head"><h2>Mi diario</h2>{diary.length > 0 && <span className="num">{diary.length}</span>}</div>
        {diary.length > 0 && (
          <div className="diary-stats">
            <div><b className="num">{thisYear}</b><span>en {year}</span></div>
            <div><b className="num">{diary.length}</b><span>vistas</span></div>
            <div><b className="num">{avg ? avg.toFixed(1) : '—'}</b><span>promedio</span></div>
          </div>
        )}
        {!diary.length ? (
          <p className="quiet">Cuando marques una película como vista, aparece acá con tu puntaje.</p>
        ) : (
          <div className="list">
            {diary.map((m) => (
              <button key={m.id} type="button" className="movie-row" onClick={() => setOpen(hitFromItem(m))}>
                <Poster src={m.cover} title={m.title} small />
                <span className="grow">
                  <span className="movie-row-title">{m.title}{m.year && <span className="muted"> · {m.year}</span>}</span>
                  <Stars value={m.rating ?? 0} size={14} />
                  {m.notes && <span className="movie-row-text clamp-2">{m.notes}</span>}
                </span>
                {m.watchedOn && <span className="movie-row-date">{formatRelativeDay(m.watchedOn, 'short')}</span>}
              </button>
            ))}
          </div>
        )}
      </section>

      <BottomSheet open={!!open} onClose={() => setOpen(null)} title={open?.title ?? 'Película'} hideTitle initialFocus="none">
        {open && <MovieDetail hit={open} items={movies} onClose={() => setOpen(null)} />}
      </BottomSheet>
    </main>
  );
}

export function Poster({ src, title, small }: { src?: string | null; title: string; small?: boolean }) {
  const [ok, setOk] = useState(true);
  return (
    <span className={cx('poster', small && 'is-small')}>
      {src && ok ? <img src={src} alt={title} loading="lazy" onError={() => setOk(false)} /> : <span className="poster-fallback">{title}</span>}
    </span>
  );
}

/** Estrellas con medias: tocá la mitad izquierda de una estrella para media. */
export function Stars({ value, onChange, size = 28 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <span className={cx('stars', onChange && 'is-input')} role={onChange ? 'slider' : 'img'} aria-label={`${value} de 5 estrellas`} aria-valuemin={0} aria-valuemax={5} aria-valuenow={value}
      tabIndex={onChange ? 0 : undefined}
      onKeyDown={(e) => {
        if (!onChange) return;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange(Math.min(5, value + 0.5));
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange(Math.max(0, value - 0.5));
      }}
    >
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = value >= i ? 1 : value >= i - 0.5 ? 0.5 : 0;
        return (
          <span
            key={i}
            className="star"
            style={{ width: size, height: size }}
            onClick={onChange ? (e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const half = e.clientX - r.left < r.width / 2;
              const v = half ? i - 0.5 : i;
              onChange(v === value ? 0 : v);
            } : undefined}
          >
            <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
              <defs>
                <linearGradient id={`sg-${i}-${fill}`}>
                  <stop offset={`${fill * 100}%`} stopColor="currentColor" />
                  <stop offset={`${fill * 100}%`} stopColor="transparent" />
                </linearGradient>
              </defs>
              <path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.3l-5.6 2.9 1.1-6.3L2.9 9.5l6.3-.9z" fill={`url(#sg-${i}-${fill})`} stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
          </span>
        );
      })}
    </span>
  );
}

function MovieDetail({ hit, items, onClose }: { hit: MovieHit; items: MediaItem[]; onClose: () => void }) {
  const { toast, confirm } = useFeedback();
  const saved = items.find((m) => (hit.tmdbId && m.meta?.tmdbId === String(hit.tmdbId)) || m.id === hit.key || (m.title.toLowerCase() === hit.title.toLowerCase() && (m.year ?? '') === (hit.year ?? '')));
  const [where, setWhere] = useState<WhereToWatch | null>(null);
  const [rating, setRating] = useState(saved?.rating ?? 0);
  const [date, setDate] = useState(saved?.watchedOn ?? todayISO());
  const [review, setReview] = useState(saved?.notes ?? '');
  const [logging, setLogging] = useState(saved?.status === 'watched');
  const [viewPoster, setViewPoster] = useState(false);

  useEffect(() => {
    let alive = true;
    void whereToWatch(hit).then((w) => alive && setWhere(w)).catch(() => alive && setWhere({ providers: [], link: `https://www.justwatch.com/ar/buscar?q=${encodeURIComponent(hit.title)}`, source: 'search' }));
    return () => {
      alive = false;
    };
  }, [hit]);

  const stream = where?.providers.filter((p) => p.kind === 'stream') ?? [];
  const pay = where?.providers.filter((p) => p.kind !== 'stream') ?? [];

  return (
    <div className="movie-detail">
      <div className="movie-hero">
        {hit.poster ? <button type="button" className="cover-btn" onClick={() => setViewPoster(true)} aria-label="Ver portada"><Poster src={hit.poster} title={hit.title} /></button> : <Poster src={hit.poster} title={hit.title} />}
        <div className="grow">
          <h2 className="movie-title">{hit.title}</h2>
          <p className="movie-meta">{[hit.year, hit.director, hit.genres.slice(0, 2).join(', ')].filter(Boolean).join(' · ')}</p>
          {saved?.status === 'watched' && saved.rating ? <Stars value={saved.rating} size={16} /> : null}
          {hit.why && <p className="movie-why">{hit.why}</p>}
        </div>
      </div>

      <Synopsis text={hit.synopsis} />
      <AiSummary
        kind="película" title={hit.originalTitle || hit.title} creator={hit.director ?? ''} year={hit.year} synopsis={hit.synopsis}
        cached={{ summary: saved?.meta?.summary, forWho: saved?.meta?.forWho }}
        onSave={(r) => { if (saved) void saveMedia({ ...saved, meta: { ...(saved.meta ?? {}), summary: r.summary, ...(r.forWho ? { forWho: r.forWho } : {}) } }); }}
      />
      <Trailer title={hit.originalTitle || hit.title} year={hit.year} tmdbId={hit.tmdbId} />
      <CoverViewer src={viewPoster ? hit.poster : null} alt={hit.title} onClose={() => setViewPoster(false)} />

      <section className="movie-where">
        <h3>Dónde verla</h3>
        {!where ? <span className="spinner" /> : where.providers.length ? (
          <>
            {stream.length > 0 && <div className="provider-row">{stream.map((p) => <ProviderChip key={p.name} p={p} />)}</div>}
            {pay.length > 0 && <p className="provider-label">Alquiler o compra</p>}
            {pay.length > 0 && <div className="provider-row">{pay.slice(0, 6).map((p) => <ProviderChip key={p.name + p.kind} p={p} />)}</div>}
            <a className="quiet-link" href={where.link} target="_blank" rel="noopener noreferrer">Ver en JustWatch</a>
          </>
        ) : (
          <>
            <p className="quiet" style={{ textAlign: 'left', marginTop: 0 }}>
              {where.source === 'tmdb' ? 'No está en plataformas de Argentina por ahora.' : 'Buscá en qué plataforma está disponible en Argentina.'}
            </p>
            <a className="btn btn-secondary btn-sm" href={where.link} target="_blank" rel="noopener noreferrer"><Icon name="search" size={16} /> Buscar dónde verla</a>
          </>
        )}
      </section>

      {!logging ? (
        <div className="hstack mt-4">
          <button type="button" className="btn btn-primary grow" onClick={() => setLogging(true)}><Icon name="check" size={18} /> La vi</button>
          {saved?.status !== 'later' ? (
            <button type="button" className="btn btn-secondary grow" onClick={async () => { await saveMovie(hit, { status: 'later' }, saved); toast('En Para ver'); onClose(); }}><Icon name="plus" size={18} /> Quiero verla</button>
          ) : (
            <button type="button" className="btn btn-secondary grow" onClick={async () => { await deleteMedia(saved.id); toast('Quitada de Para ver'); onClose(); }}>Quitar de Para ver</button>
          )}
        </div>
      ) : (
        <div className="movie-log">
          <p className="field-label">Tu puntaje</p>
          <Stars value={rating} onChange={setRating} />
          <label className="fs-row log-date"><span>La vi el</span><input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value || todayISO())} /></label>
          <textarea className="textarea" rows={3} placeholder="Qué te pareció (opcional)" value={review} onChange={(e) => setReview(e.target.value)} />
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              await saveMovie(hit, { status: 'watched', rating: rating || null, watchedOn: date, notes: review }, saved);
              toast(rating ? `Guardada en tu diario · ${rating}★` : 'Guardada en tu diario');
              onClose();
            }}
          >
            Guardar en el diario
          </button>
          {saved && (
            <button type="button" className="btn btn-ghost danger-text" onClick={async () => { if (await confirm({ title: '¿Quitar del diario?', confirmLabel: 'Quitar', danger: true })) { await deleteMedia(saved.id); onClose(); } }}>
              Quitar del diario
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ProviderChip({ p }: { p: { name: string; logo: string | null } }) {
  return (
    <span className="provider">
      {p.logo ? <img src={p.logo} alt="" /> : <Icon name="video" size={14} />}
      {p.name}
    </span>
  );
}
