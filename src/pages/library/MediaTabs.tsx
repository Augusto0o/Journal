import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BottomSheet, Chip, Chips, Empty, Icon, IconButton, Segmented, Stepper, useFeedback } from '@/components/ui';
import { useStore } from '@/hooks/useData';
import {
  BOOK_STATUS, MUSIC_CATEGORIES, MUSIC_STATUS, VIDEO_CATEGORIES, VIDEO_STATUS, deleteMedia, fetchLinkMeta, newMedia, parseYouTube, saveMedia,
  searchBooks, searchMusic, ytMusicSearch, type BookHit, type MusicHit,
} from '@/services/media';
import { formatSize, importPdf } from '@/services/pdf';
import { newNote, saveNote } from '@/services/actions';
import type { MediaItem, MediaStatus } from '@/types';
import { relativeTime } from '@/utils/date';
import { cx } from '@/utils/misc';
import { ytAutoAdd, ytConnected } from '@/services/youtube';
import { PlaylistPicker } from '@/components/media/PlaylistPicker';
import { BookAbout, CoverViewer } from '@/components/media/About';
import { MoveSheet } from './ListPage';
import { mediaLists } from '@/services/lists';
import { claimPlayback, isReleasing, releaseMedia } from '@/services/player';

export function Cover({ src, kind, alt }: { src?: string | null; kind: 'book' | 'video' | 'music' | 'movie'; alt: string }) {
  const [ok, setOk] = useState(true);
  return (
    <span className={cx('cover', `is-${kind}`)}>
      {src && ok ? <img src={src} alt={alt} loading="lazy" onError={() => setOk(false)} /> : <Icon name={kind === 'book' ? 'book' : kind === 'video' || kind === 'movie' ? 'video' : 'music'} size={20} />}
    </span>
  );
}

function AddCta({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="cta" onClick={onClick}>{label} <Icon name="arrowRight" size={22} strokeWidth={1.4} className="arrow" /></button>;
}

// =============================================================== Libros

export function BooksTab() {
  const snap = useStore();
  const [status, setStatus] = useState<MediaStatus | 'all'>('all');
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<MediaItem | null>(null);
  const books = snap.media.filter((m) => m.mediaType === 'book' && (status === 'all' || m.status === status)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const reading = snap.media.filter((m) => m.mediaType === 'book' && m.status === 'reading').length;
  return (
    <>
      <div className="cta-row"><p>{reading ? `Leyendo ${reading}` : 'Tu estante'}</p><AddCta label="Agregar libro" onClick={() => setAdding(true)} /></div>
      <div className="mt-4"><Chips><Chip on={status === 'all'} onClick={() => setStatus('all')}>Todos</Chip>{BOOK_STATUS.map((s) => <Chip key={s.id} on={status === s.id} onClick={() => setStatus(s.id)}>{s.label}</Chip>)}</Chips></div>
      {!books.length ? (
        <Empty title="Ningún libro todavía" message="Buscá por título o autor: la portada se completa sola. Marcá lo que querés leer, lo que estás leyendo y lo terminado." />
      ) : (
        <ul className="media-list">
          {books.map((b) => (
            <li key={b.id}>
              <button type="button" className="media-item" onClick={() => setOpen(b)}>
                <Cover src={b.cover} kind="book" alt={b.title} />
                <span className="grow">
                  <span className="media-title">{b.title}</span>
                  <span className="row-sub">{b.creator}{b.genre ? ` · ${b.genre}` : ''}</span>
                  <span className="media-status">{BOOK_STATUS.find((s) => s.id === b.status)?.label}{b.status === 'reading' ? ` · ${b.progress ?? 0}%` : ''}</span>
                  {b.status === 'reading' && <span className="media-progress"><i style={{ transform: `scaleX(${(b.progress ?? 0) / 100})` }} /></span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <BottomSheet open={adding} onClose={() => setAdding(false)} title="Agregar libro">{adding && <AddBook onDone={() => setAdding(false)} />}</BottomSheet>
      <BottomSheet open={!!open} onClose={() => setOpen(null)} title={open?.title ?? 'Libro'} hideTitle>{open && <MediaDetail item={snap.media.find((m) => m.id === open.id) ?? open} onClose={() => setOpen(null)} />}</BottomSheet>
    </>
  );
}

export function AddBook({ onDone }: { onDone: () => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<BookHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useFeedback();
  const search = async () => {
    setBusy(true);
    try {
      setHits(await searchBooks(q));
    } catch {
      toast('No se pudo buscar (¿sin conexión?). Podés cargarlo a mano.', { tone: 'error' });
      setHits([]);
    } finally {
      setBusy(false);
    }
  };
  const add = async (h: Partial<BookHit>) => {
    await saveMedia(newMedia('book', { title: h.title || q, creator: h.creator ?? '', cover: h.cover ?? null, genre: h.genre ?? null, year: h.year ?? null, url: h.url ?? null }));
    toast('Agregado a Quiero leer');
    onDone();
  };
  return (
    <div className="stack">
      <form className="hstack" onSubmit={(e) => { e.preventDefault(); if (q.trim()) void search(); }}>
        <input className="input grow" placeholder="Título o autor" value={q} onChange={(e) => setQ(e.target.value)} data-autofocus />
        <button type="submit" className="btn btn-primary" disabled={!q.trim() || busy}>{busy ? <span className="spinner" /> : 'Buscar'}</button>
      </form>
      {hits && (
        <div className="group-body">
          {hits.map((h, i) => (
            <button key={i} type="button" className="media-item is-row" onClick={() => void add(h)}>
              <Cover src={h.cover} kind="book" alt={h.title} />
              <span className="grow"><span className="media-title">{h.title}</span><span className="row-sub">{[h.creator, h.year].filter(Boolean).join(' · ')}</span></span>
              <Icon name="plus" size={18} />
            </button>
          ))}
          <button type="button" className="sheet-action" onClick={() => void add({ title: q })}><span className="sheet-action-label">Agregar «{q}» a mano</span></button>
        </div>
      )}
    </div>
  );
}

// =============================================================== Detalle genérico

export function MediaDetail({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const snap = useStore();
  const navigate = useNavigate();
  const { confirm } = useFeedback();
  const [m, setM] = useState(item);
  useEffect(() => setM(item), [item]);
  const player = useRef<HTMLAudioElement>(null);
  const [picking, setPicking] = useState(false);
  const [viewCover, setViewCover] = useState(false);
  const [moving, setMoving] = useState(false);
  useEffect(() => {
    const el = player.current;
    return () => {
      if (el) releaseMedia(el);
    };
  }, []);
  const set = (p: Partial<MediaItem>) => {
    const next = { ...m, ...p };
    setM(next);
    void saveMedia(next);
  };
  const linked = snap.note.filter((n) => n.linkedIds.includes(m.id));
  const statuses = m.mediaType === 'book' ? BOOK_STATUS : m.mediaType === 'video' ? VIDEO_STATUS : MUSIC_STATUS;
  const kind = m.mediaType === 'art' ? 'book' : m.mediaType;

  return (
    <div className="stack-lg">
      <div className="media-hero">
        {m.cover ? <button type="button" className="cover-btn" onClick={() => setViewCover(true)} aria-label="Ver portada"><Cover src={m.cover} kind={kind} alt={m.title} /></button> : <Cover src={m.cover} kind={kind} alt={m.title} />}
        <div className="grow">
          <input className="media-hero-title" value={m.title} onChange={(e) => set({ title: e.target.value })} aria-label="Título" />
          <input className="media-hero-sub" value={m.creator} onChange={(e) => set({ creator: e.target.value })} placeholder={m.mediaType === 'book' ? 'Autor' : m.mediaType === 'video' ? 'Canal' : 'Artista'} aria-label="Autor" />
          {m.genre !== undefined && <input className="media-hero-sub" value={m.genre ?? ''} onChange={(e) => set({ genre: e.target.value || null })} placeholder="Género" aria-label="Género" />}
        </div>
      </div>

      {m.mediaType === 'book' && <BookAbout key={m.id} title={m.title} creator={m.creator} meta={m.meta} cover={m.cover} onPatch={(p) => set(p)} />}

      {m.mediaType !== 'art' && <Segmented<MediaStatus> label="Estado" value={m.status} onChange={(v) => set({ status: v })} options={statuses.map((s) => ({ value: s.id, label: s.label }))} />}

      {m.mediaType === 'book' && m.status === 'reading' && (
        <div className="row" style={{ padding: '0 4px' }}>
          <span className="row-main"><span className="row-label">Progreso</span></span>
          <Stepper label="Progreso" value={m.progress ?? 0} min={0} max={100} step={5} onChange={(v) => set({ progress: v, status: v >= 100 ? 'finished' : m.status })} format={(v) => `${v}%`} />
        </div>
      )}
      {m.mediaType === 'video' && (
        <div className="chips-wrap">{VIDEO_CATEGORIES.map((c) => <button key={c} type="button" className="chip" aria-pressed={m.category === c} onClick={() => set({ category: c })}>{c}</button>)}</div>
      )}
      {m.mediaType === 'music' && (
        <div className="chips-wrap">{MUSIC_CATEGORIES.map((c) => <button key={c} type="button" className="chip" aria-pressed={m.category === c} onClick={() => set({ category: c })}>{c}</button>)}</div>
      )}

      <textarea className="textarea" rows={3} placeholder="Notas rápidas" value={m.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} />

      {m.previewUrl && <audio ref={player} className="audio" src={m.previewUrl} controls preload="none" onPlay={() => set({ plays: (m.plays ?? 0) + 1 })} />}

      <div className="group-body">
        {m.url && <a className="row" href={m.url} target="_blank" rel="noopener noreferrer"><span className="row-main"><span className="row-label">{m.mediaType === 'video' ? 'Ver en YouTube' : m.mediaType === 'book' ? 'Ver ficha' : 'Abrir enlace'}</span></span><Icon name="arrowRight" size={18} /></a>}
        {(m.mediaType === 'video' || m.mediaType === 'music') && (
          <button type="button" className="row" onClick={() => setMoving(true)}>
            <span className="row-main"><span className="row-label">Lista</span><span className="row-sub">{mediaLists(snap.folder).find((l) => l.id === m.listId)?.name ?? 'Sin lista'}</span></span>
            <Icon name="chevronRight" size={18} />
          </button>
        )}
        {m.mediaType === 'music' && ytConnected() && (
          <button type="button" className="row is-accent" onClick={() => setPicking(true)}>
            <span className="row-main"><span className="row-label">Agregar a una lista de YouTube Music</span><span className="row-sub">Elegís en cuál</span></span>
            <Icon name="plus" size={18} />
          </button>
        )}
        {m.mediaType === 'music' && <a className="row" href={ytMusicSearch(m.title, m.creator)} target="_blank" rel="noopener noreferrer"><span className="row-main"><span className="row-label">Buscar en YouTube Music</span></span><Icon name="arrowRight" size={18} /></a>}
        {linked.map((n) => <Link key={n.id} to={`/biblioteca/nota/${n.id}`} className="row" onClick={onClose}><span className="row-main"><span className="row-label">{n.title || 'Nota'}</span><span className="row-sub">Nota vinculada</span></span></Link>)}
        <button
          type="button"
          className="row is-accent"
          onClick={async () => {
            const n = newNote('note');
            n.title = `Notas: ${m.title}`;
            n.linkedIds = [m.id];
            await saveNote({ ...n, content: '<p></p>' });
            onClose();
            navigate(`/biblioteca/nota/${n.id}`);
          }}
        >
          <span className="row-main"><span className="row-label">Nueva nota sobre esto</span></span>
        </button>
      </div>

      <PlaylistPicker song={picking ? m : null} onClose={() => setPicking(false)} />
      <MoveSheet item={moving ? m : null} lists={mediaLists(snap.folder)} onClose={() => setMoving(false)} />
      <CoverViewer src={viewCover ? m.cover ?? null : null} alt={m.title} onClose={() => setViewCover(false)} />
      <button type="button" className="btn btn-ghost danger-text" onClick={async () => { if (await confirm({ title: '¿Quitar de la biblioteca?', confirmLabel: 'Quitar', danger: true })) { await deleteMedia(m.id); onClose(); } }}>Quitar</button>
    </div>
  );
}

// =============================================================== Videos

export function VideosTab() {
  const snap = useStore();
  const [cat, setCat] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<MediaItem | null>(null);
  const videos = snap.media.filter((m) => m.mediaType === 'video' && (!cat || m.category === cat)).sort((a, b) => Number(a.status === 'watched') - Number(b.status === 'watched') || b.createdAt.localeCompare(a.createdAt));
  return (
    <>
      <div className="cta-row"><p>Para ver después</p><AddCta label="Guardar video" onClick={() => setAdding(true)} /></div>
      <div className="mt-4"><Chips><Chip on={!cat} onClick={() => setCat(null)}>Todos</Chip>{VIDEO_CATEGORIES.map((c) => <Chip key={c} on={cat === c} onClick={() => setCat(c)}>{c}</Chip>)}</Chips></div>
      {!videos.length ? (
        <Empty title="Sin videos guardados" message="Pegá un enlace de YouTube (video o playlist): se completan solos la portada, el título y el canal. Desde Atajos también podés mandarlos con Compartir." />
      ) : (
        <ul className="video-grid">
          {videos.map((v) => (
            <li key={v.id}>
              <button type="button" className={cx('video-card', v.status === 'watched' && 'is-watched')} onClick={() => setOpen(v)}>
                <Cover src={v.cover} kind="video" alt={v.title} />
                <span className="media-title clamp-2">{v.title || v.url}</span>
                <span className="row-sub">{[v.creator, v.category, v.status === 'watched' ? 'Visto' : null].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <BottomSheet open={adding} onClose={() => setAdding(false)} title="Guardar video">{adding && <AddLink type="video" onDone={() => setAdding(false)} />}</BottomSheet>
      <BottomSheet open={!!open} onClose={() => setOpen(null)} title={open?.title ?? 'Video'} hideTitle>{open && <MediaDetail item={snap.media.find((m) => m.id === open.id) ?? open} onClose={() => setOpen(null)} />}</BottomSheet>
    </>
  );
}

export function AddLink({ type, onDone }: { type: 'video' | 'music'; onDone: () => void }) {
  const [url, setUrl] = useState('');
  const [cat, setCat] = useState(type === 'video' ? VIDEO_CATEGORIES[0] : MUSIC_CATEGORIES[0]);
  const [busy, setBusy] = useState(false);
  const { toast } = useFeedback();
  const add = async () => {
    setBusy(true);
    const meta = await fetchLinkMeta(url.trim());
    const { listId, videoId } = parseYouTube(url);
    await saveMedia(newMedia(type, { url: url.trim(), title: meta.title || (listId && !videoId ? 'Playlist de YouTube' : url.trim()), creator: meta.creator, cover: meta.cover, category: listId && !videoId ? (type === 'video' ? cat : 'Playlist') : cat }));
    setBusy(false);
    toast(meta.title ? 'Guardado' : 'Guardado. No se pudieron traer los datos: podés editarlos.');
    onDone();
  };
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); if (url.trim()) void add(); }}>
      <input className="input" type="url" inputMode="url" autoCapitalize="none" placeholder={type === 'video' ? 'https://youtube.com/watch?v=…' : 'Enlace de YouTube Music, Spotify o Apple Music'} value={url} onChange={(e) => setUrl(e.target.value)} data-autofocus />
      <div className="chips-wrap">{(type === 'video' ? VIDEO_CATEGORIES : MUSIC_CATEGORIES).map((c) => <button key={c} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}</div>
      <button type="submit" className="btn btn-primary" disabled={!url.trim() || busy}>{busy ? <span className="spinner" /> : 'Guardar'}</button>
    </form>
  );
}

// =============================================================== Música

export function MusicTab() {
  const snap = useStore();
  const [status, setStatus] = useState<MediaStatus | 'all'>('all');
  const [adding, setAdding] = useState<null | 'search' | 'link'>(null);
  const [open, setOpen] = useState<MediaItem | null>(null);
  const music = snap.media.filter((m) => m.mediaType === 'music' && m.status !== 'dismissed' && (status === 'all' || m.status === status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <>
      <div className="cta-row"><p>Music to listen</p><Link to="/descubrir" className="cta">Descubrir <Icon name="arrowRight" size={22} strokeWidth={1.4} className="arrow" /></Link></div>
      <div className="hstack mt-4">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAdding('search')}><Icon name="search" size={16} /> Buscar canción</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAdding('link')}><Icon name="link" size={16} /> Pegar enlace</button>
      </div>
      <div className="mt-4"><Chips><Chip on={status === 'all'} onClick={() => setStatus('all')}>Todo</Chip>{MUSIC_STATUS.map((s) => <Chip key={s.id} on={status === s.id} onClick={() => setStatus(s.id)}>{s.label}</Chip>)}</Chips></div>
      {!music.length ? (
        <Empty title="Nada para escuchar todavía" message="Buscá canciones, discos o artistas, o dejá que Descubrir te recomiende según lo que te gusta." />
      ) : (
        <ul className="media-list">
          {music.map((m) => (
            <li key={m.id}>
              <button type="button" className="media-item" onClick={() => setOpen(m)}>
                <Cover src={m.cover} kind="music" alt={m.title} />
                <span className="grow">
                  <span className="media-title">{m.title}</span>
                  <span className="row-sub">{[m.creator, m.category, m.genre].filter(Boolean).join(' · ')}</span>
                  <span className="media-status">{MUSIC_STATUS.find((s) => s.id === m.status)?.label}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <BottomSheet open={adding === 'search'} onClose={() => setAdding(null)} title="Buscar música">{adding === 'search' && <SearchMusic onDone={() => setAdding(null)} />}</BottomSheet>
      <BottomSheet open={adding === 'link'} onClose={() => setAdding(null)} title="Guardar enlace">{adding === 'link' && <AddLink type="music" onDone={() => setAdding(null)} />}</BottomSheet>
      <BottomSheet open={!!open} onClose={() => setOpen(null)} title={open?.title ?? 'Música'} hideTitle>{open && <MediaDetail item={snap.media.find((m) => m.id === open.id) ?? open} onClose={() => setOpen(null)} />}</BottomSheet>
    </>
  );
}

export function PreviewButton({ url, onPlay }: { url: string; onPlay?: () => void }) {
  const [on, setOn] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => {
    if (audio.current) releaseMedia(audio.current);
  }, []);
  return (
    <button
      type="button"
      className={cx('play-disc', on && 'is-on')}
      aria-label={on ? 'Pausar vista previa' : 'Escuchar vista previa'}
      onClick={(e) => {
        e.stopPropagation();
        if (!audio.current) {
          const a = new Audio(url);
          a.onended = () => {
            setOn(false);
            releaseMedia(a);
          };
          a.onpause = () => {
            setOn(false);
            // Sin esto, el reproductor del iPhone queda con la canción y no se puede cerrar.
            if (!isReleasing(a)) releaseMedia(a);
          };
          a.onplay = () => setOn(true);
          audio.current = a;
        }
        const a = audio.current;
        if (!a.paused) {
          a.pause();
          return;
        }
        // Pausa lo que estuviera sonando antes (otra canción, un audio, la lectura en voz alta).
        claimPlayback(a);
        void a.play();
        onPlay?.();
      }}
    >
      <Icon name={on ? 'pause' : 'play'} size={14} filled strokeWidth={0} />
    </button>
  );
}

export function SearchMusic({ onDone }: { onDone: () => void }) {
  const [q, setQ] = useState('');
  const [entity, setEntity] = useState<'song' | 'album' | 'musicArtist'>('song');
  const [hits, setHits] = useState<MusicHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useFeedback();
  const run = async () => {
    setBusy(true);
    try {
      setHits(await searchMusic(q, entity));
    } catch {
      toast('No se pudo buscar (¿sin conexión?).', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const add = async (h: MusicHit) => {
    const item = newMedia('music', { title: h.title, creator: h.creator, cover: h.cover, genre: h.genre, previewUrl: h.previewUrl, url: h.url, category: h.category, year: h.year, meta: h.album ? { album: h.album } : undefined });
    await saveMedia(item);
    toast('Guardado en Para escuchar');
    ytAutoAdd(item, (msg) => toast(msg));
  };
  return (
    <div className="stack">
      <Segmented label="Tipo" value={entity} onChange={(v) => { setEntity(v); setHits(null); }} options={[{ value: 'song', label: 'Canciones' }, { value: 'album', label: 'Álbumes' }, { value: 'musicArtist', label: 'Artistas' }]} />
      <form className="hstack" onSubmit={(e) => { e.preventDefault(); if (q.trim()) void run(); }}>
        <input className="input grow" placeholder="Canción, disco o artista" value={q} onChange={(e) => setQ(e.target.value)} data-autofocus />
        <button type="submit" className="btn btn-primary" disabled={!q.trim() || busy}>{busy ? <span className="spinner" /> : 'Buscar'}</button>
      </form>
      {hits && (
        <div className="group-body">
          {hits.map((h, i) => (
            <div key={i} className="media-item is-row">
              <Cover src={h.cover} kind="music" alt={h.title} />
              <span className="grow"><span className="media-title">{h.title}</span><span className="row-sub">{[h.creator, h.album, h.year].filter(Boolean).join(' · ')}</span></span>
              {h.previewUrl && <PreviewButton url={h.previewUrl} />}
              <IconButton icon="plus" label={`Guardar ${h.title}`} onClick={() => void add(h)} />
            </div>
          ))}
          {!hits.length && <p className="home-quiet" style={{ padding: 16 }}>Sin resultados.</p>}
        </div>
      )}
      <button type="button" className="btn btn-ghost" onClick={onDone}>Listo</button>
    </div>
  );
}

// =============================================================== PDFs

export function PdfTab() {
  const snap = useStore();
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const file = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const docs = useMemo(() => [...snap.doc].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [snap.doc]);
  return (
    <>
      <div className="cta-row"><p>Leer, buscar, resumir y preguntar</p><AddCta label="Importar PDF" onClick={() => file.current?.click()} /></div>
      {progress !== null && <div className="import-progress"><span>Leyendo el PDF… {Math.round(progress * 100)}%</span><i style={{ transform: `scaleX(${progress})` }} /></div>}
      {!docs.length ? (
        <Empty title="Ningún PDF todavía" message="Importá apuntes, papers o libros. Después podés buscar adentro, pedir un resumen, crear notas y mapas, o hacerle preguntas al documento." />
      ) : (
        <ol className="map-list">
          {docs.map((d, i) => (
            <li key={d.id}>
              <Link to={`/pdf/${d.id}`} className="map-item">
                <span className="step-num">{i + 1}</span>
                <span className="grow">
                  <span className="map-title">{d.title}</span>
                  <span className="row-sub">{d.pages} págs. · {formatSize(d.size)} · {d.page > 1 ? `vas por la ${d.page}` : relativeTime(d.createdAt)}</span>
                </span>
                <Icon name="pdf" size={22} className="faint" />
              </Link>
            </li>
          ))}
        </ol>
      )}
      <input
        ref={file}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setProgress(0);
          try {
            const d = await importPdf(f, setProgress);
            navigate(`/pdf/${d.id}`);
          } catch (err) {
            console.error(err);
            toast('No se pudo leer el PDF.', { tone: 'error' });
          } finally {
            setProgress(null);
          }
        }}
      />
    </>
  );
}
