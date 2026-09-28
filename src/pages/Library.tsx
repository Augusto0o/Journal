import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BottomSheet, Empty, Icon, IconButton, type IconName } from '@/components/ui';
import { AddBook, AddLink, Cover, MediaDetail, SearchMusic } from './library/MediaTabs';
import { useArtwork } from '@/pages/discover/Artwork';
import { mediaLists, saveList } from '@/services/lists';
import { useStore, useToday } from '@/hooks/useData';
import { TopSearch } from '@/components/navigation/TopSearch';
import type { MediaItem } from '@/types';
import { cx } from '@/utils/misc';

type Adding = null | 'pick' | 'book' | 'video' | 'music' | 'music-link' | 'movie';

const DONE = new Set(['finished', 'watched', 'listened', 'liked', 'saved']);

/**
 * «Biblioteca»: un solo estante ordenado por estado. Lo que estás leyendo
 * arriba, después lo pendiente para leer, ver y escuchar; lo terminado queda plegado.
 */
export default function Library() {
  const snap = useStore();
  const today = useToday();
  const [adding, setAdding] = useState<Adding>(null);
  const [open, setOpen] = useState<MediaItem | null>(null);
  const [showDone, setShowDone] = useState(false);
  const { art } = useArtwork(today);
  const navigate = useNavigate();
  const openItem = (m: MediaItem) => (m.mediaType === 'movie' ? navigate(`/peliculas?id=${m.id}`) : setOpen(m));

  const media = snap.media.filter((m) => m.status !== 'dismissed').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const reading = media.filter((m) => m.mediaType === 'book' && m.status === 'reading');
  const toRead = media.filter((m) => m.mediaType === 'book' && m.status === 'want');
  // Lo que está en una lista se ve en su lista, no mezclado en los estantes.
  const toWatch = media.filter((m) => m.mediaType === 'video' && !m.listId && !DONE.has(m.status));
  const lists = mediaLists(snap.folder);
  const [newList, setNewList] = useState<string | null>(null);
  const moviesToWatch = media.filter((m) => m.mediaType === 'movie' && !DONE.has(m.status));
  const toListen = media.filter((m) => m.mediaType === 'music' && !DONE.has(m.status));
  const done = media.filter((m) => DONE.has(m.status));

  const shelves: { title: string; items: MediaItem[] }[] = [
    { title: 'Leyendo', items: reading },
    { title: 'Para leer', items: toRead },
    { title: 'Para ver', items: toWatch },
    { title: 'Películas para ver', items: moviesToWatch },
    { title: 'Para escuchar', items: toListen },
  ];

  const sheetTitle = adding === 'book' ? 'Agregar libro' : adding === 'video' ? 'Guardar video' : adding === 'music' ? 'Buscar música' : adding === 'music-link' ? 'Guardar enlace' : 'Agregar';

  return (
    <main className="page library">
      <TopSearch />
      <header className="today-head">
        <h1 className="today-title grow">Biblioteca</h1>
        <IconButton icon="plus" label="Agregar" tone="filled" onClick={() => setAdding('pick')} />
      </header>

      <div className="explore">
        <Link to="/descubrir" className="explore-card">
          <span className="explore-icon"><Icon name="sparkle" size={20} /></span>
          <span className="card-kicker">Descubrir</span>
          <span className="card-title">Música y libros</span>
        </Link>
        <Link to="/peliculas" className="explore-card">
          <span className="explore-icon"><Icon name="video" size={20} /></span>
          <span className="card-kicker">Películas</span>
          <span className="card-title">Tu diario</span>
        </Link>
        <Link to="/arte" className={cx('explore-card', art && 'has-art')}>
          {art && <img src={art.thumb} alt="" loading="lazy" />}
          <span className="card-kicker">Obra del día</span>
          <span className="card-title clamp-2">{art?.title ?? 'Una obra con su historia'}</span>
        </Link>
      </div>

      <section className="block">
        <div className="block-head">
          <h2>Listas</h2>
          <button type="button" className="link-btn" onClick={() => setNewList('')}>Nueva</button>
        </div>
        {lists.length ? (
          <div className="lists-strip">
            {lists.map((l) => {
              const inList = snap.media.filter((m) => m.listId === l.id && m.status !== 'dismissed');
              const thumbs = inList.filter((m) => m.cover).slice(0, 3);
              return (
                <Link key={l.id} to={`/biblioteca/lista/${l.id}`} className="list-card">
                  <span className="list-card-thumbs">
                    {thumbs.length ? thumbs.map((m) => <img key={m.id} src={m.cover!} alt="" loading="lazy" />) : <Icon name="folder" size={22} />}
                  </span>
                  <span className="card-title clamp-2">{l.name}</span>
                  <span className="card-kicker">{inList.length} {inList.length === 1 ? 'guardado' : 'guardados'}{l.ytPlaylistId ? ' · YouTube' : ''}</span>
                </Link>
              );
            })}
          </div>
        ) : (
          <button type="button" className="list-empty" onClick={() => setNewList('')}>
            <Icon name="plus" size={18} />
            <span>Creá listas como «Videos de IA» o «Recomendaciones» y guardá ahí videos de YouTube, reels de Instagram o cualquier enlace.</span>
          </button>
        )}
      </section>

      <BottomSheet open={newList !== null} onClose={() => setNewList(null)} title="Nueva lista">
        <form className="stack" onSubmit={async (e) => { e.preventDefault(); if (!newList?.trim()) return; const l = await saveList(newList.trim()); setNewList(null); navigate(`/biblioteca/lista/${l.id}`); }}>
          <input className="input" placeholder="Videos de IA, Música, Recomendaciones…" value={newList ?? ''} onChange={(e) => setNewList(e.target.value)} aria-label="Nombre" data-autofocus />
          <button type="submit" className="btn btn-primary" disabled={!newList?.trim()}>Crear</button>
        </form>
      </BottomSheet>

      {!media.length && (
        <Empty title="Tu estante está vacío" message="Guardá libros, videos y música para después. Tocá + para agregar, o compartí un enlace desde otra app." />
      )}

      {shelves.filter((s) => s.items.length).map((s) => (
        <section key={s.title} className="block">
          <div className="block-head"><h2>{s.title}</h2><span className="num">{s.items.length}</span></div>
          <ul className="shelf">
            {s.items.map((m) => <ShelfItem key={m.id} m={m} onOpen={openItem} />)}
          </ul>
        </section>
      ))}

      {done.length > 0 && (
        <>
          <button type="button" className="fold" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
            <span>Terminado y favoritos · {done.length}</span>
            <Icon name={showDone ? 'chevronUp' : 'chevronDown'} size={16} />
          </button>
          {showDone && <ul className="shelf">{done.map((m) => <ShelfItem key={m.id} m={m} onOpen={openItem} />)}</ul>}
        </>
      )}

      <BottomSheet open={!!adding} onClose={() => setAdding(null)} title={sheetTitle} hideTitle={adding === 'pick'} initialFocus={adding === 'pick' ? 'none' : undefined}>
        {adding === 'pick' && (
          <div className="new-grid is-4">
            {([
              ['book', 'Libro', 'book'],
              ['video', 'Video', 'video'],
              ['music', 'Música', 'music'],
              ['video', 'Película', 'movie'],
            ] as [IconName, string, Adding][]).map(([icon, label, next]) => (
              <button key={label} type="button" className="new-tile" onClick={() => (next === 'movie' ? navigate('/peliculas') : setAdding(next))}>
                <span className="new-tile-icon"><Icon name={icon} size={22} /></span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}
        {adding === 'book' && <AddBook onDone={() => setAdding(null)} />}
        {adding === 'video' && <AddLink type="video" onDone={() => setAdding(null)} />}
        {adding === 'music' && (
          <>
            <SearchMusic onDone={() => setAdding(null)} />
            <button type="button" className="btn btn-ghost btn-block" onClick={() => setAdding('music-link')}>Pegar un enlace</button>
          </>
        )}
        {adding === 'music-link' && <AddLink type="music" onDone={() => setAdding(null)} />}
      </BottomSheet>

      <BottomSheet open={!!open} onClose={() => setOpen(null)} title={open?.title ?? 'Detalle'} hideTitle>
        {open && <MediaDetail item={snap.media.find((m) => m.id === open.id) ?? open} onClose={() => setOpen(null)} />}
      </BottomSheet>
    </main>
  );
}

function ShelfItem({ m, onOpen }: { m: MediaItem; onOpen: (m: MediaItem) => void }) {
  const kind = m.mediaType === 'book' ? 'book' : m.mediaType === 'video' ? 'video' : m.mediaType === 'movie' ? 'movie' : 'music';
  return (
    <li>
      <button type="button" className="media-item" onClick={() => onOpen(m)}>
        <Cover src={m.cover} kind={kind} alt={m.title} />
        <span className="grow">
          <span className="media-title">{m.title}</span>
          <span className="row-sub">{[m.creator, m.category && m.mediaType !== 'book' ? m.category : m.genre].filter(Boolean).join(' · ')}</span>
          {m.mediaType === 'movie' && m.rating ? <span className="shelf-stars">{'★'.repeat(Math.floor(m.rating))}{m.rating % 1 ? '½' : ''}</span> : null}
          {m.mediaType === 'book' && m.status === 'reading' && (
            <span className="media-progress"><i style={{ transform: `scaleX(${(m.progress ?? 0) / 100})` }} /></span>
          )}
        </span>
        {m.mediaType === 'book' && m.status === 'reading' && <span className="shelf-pct num">{m.progress ?? 0}%</span>}
      </button>
    </li>
  );
}
