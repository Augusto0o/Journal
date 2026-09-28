import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BottomSheet, Empty, Icon, IconButton, NavBar, SheetAction, useFeedback } from '@/components/ui';
import { useStore } from '@/hooks/useData';
import { deleteMedia } from '@/services/media';
import { deleteList, mediaLists, moveToList, saveList, sourceOf, SOURCE_LABEL, type MediaList } from '@/services/lists';
import { ytConnected, ytPlaylists, type YtPlaylist } from '@/services/youtube';
import type { MediaItem } from '@/types';
import { cx } from '@/utils/misc';

/** Una lista de la Biblioteca: se reproduce como playlist (lo de YouTube) y abre lo demás. */
export default function ListPage() {
  const { id } = useParams();
  const snap = useStore();
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const lists = mediaLists(snap.folder);
  const list = lists.find((l) => l.id === id);
  const items = useMemo(() => snap.media.filter((m) => m.listId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [snap.media, id]);
  const playable = items.filter((m) => m.meta?.videoId);
  const [player, setPlayer] = useState<string[] | null>(null);
  const [menu, setMenu] = useState(false);
  const [rename, setRename] = useState<string | null>(null);
  const [item, setItem] = useState<MediaItem | null>(null);
  const [moving, setMoving] = useState<MediaItem | null>(null);
  const [linking, setLinking] = useState<YtPlaylist[] | null>(null);

  if (!list) {
    return (
      <main className="page">
        <NavBar back="/biblioteca" backLabel="Biblioteca" />
        <Empty title="Esta lista ya no existe" message="Volvé a la Biblioteca para ver tus listas." />
      </main>
    );
  }

  const open = (m: MediaItem) => {
    if (m.meta?.videoId) setPlayer([m.meta.videoId]);
    else if (m.url) window.open(m.url, '_blank', 'noopener');
  };

  return (
    <main className="page list-page">
      <NavBar back="/biblioteca" backLabel="Biblioteca" end={<IconButton icon="more" label="Opciones de la lista" onClick={() => setMenu(true)} />} />
      <header className="today-head">
        <div className="grow">
          <h1 className="today-title">{list.name}</h1>
          <p className="page-sub">{items.length} {items.length === 1 ? 'guardado' : 'guardados'}{list.ytPlaylistTitle ? ` · YouTube: ${list.ytPlaylistTitle}` : ''}</p>
        </div>
      </header>

      {playable.length > 0 && (
        <button type="button" className="btn btn-primary btn-block" onClick={() => setPlayer(playable.map((m) => m.meta!.videoId))}>
          <Icon name="play" size={16} filled strokeWidth={0} /> Reproducir {playable.length > 1 ? `los ${playable.length} videos` : 'el video'}
        </button>
      )}

      {!items.length ? (
        <Empty title="Lista vacía" message="Desde YouTube, Instagram o TikTok tocá Compartir → «Guardar en lista» y elegí esta lista. También podés mover acá cualquier video de la Biblioteca." />
      ) : (
        <ul className="list-items">
          {items.map((m) => {
            const src = sourceOf(m);
            return (
              <li key={m.id} className="list-item">
                <button type="button" className="list-item-main" onClick={() => open(m)}>
                  <span className={cx('list-thumb', `is-${src}`)}>
                    {m.cover ? <img src={m.cover} alt="" loading="lazy" /> : <Icon name={src === 'web' ? 'link' : 'video'} size={20} />}
                    {m.meta?.videoId && <span className="list-thumb-play"><Icon name="play" size={12} filled strokeWidth={0} /></span>}
                  </span>
                  <span className="grow">
                    <span className="media-title clamp-2">{m.title}</span>
                    <span className="row-sub">{[SOURCE_LABEL[src], m.creator].filter(Boolean).join(' · ')}</span>
                    {m.notes && <span className="list-note clamp-2">{m.notes}</span>}
                  </span>
                </button>
                <button type="button" className="icon-btn" aria-label="Opciones" onClick={() => setItem(m)}><Icon name="more" size={18} /></button>
              </li>
            );
          })}
        </ul>
      )}

      <BottomSheet open={!!player} onClose={() => setPlayer(null)} title={list.name} className="player-sheet">
        {player && (
          <iframe
            className="trailer-frame"
            src={`https://www.youtube-nocookie.com/embed/${player[0]}?autoplay=1&playsinline=1&rel=0${player.length > 1 ? `&playlist=${player.slice(1).join(',')}` : ''}`}
            title={`Reproduciendo ${list.name}`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        )}
        {player && player.length > 1 && <p className="group-foot">Pasa solo al siguiente video. {player.length} en la cola.</p>}
      </BottomSheet>

      <BottomSheet open={!!item} onClose={() => setItem(null)} title={item?.title ?? ''}>
        {item && (
          <div className="group-body">
            {item.url && <SheetAction icon={<Icon name="arrowRight" size={20} />} label={`Abrir en ${SOURCE_LABEL[sourceOf(item)]}`} onClick={() => { window.open(item.url!, '_blank', 'noopener'); setItem(null); }} />}
            <SheetAction icon={<Icon name="folder" size={20} />} label="Mover a otra lista" onClick={() => { setMoving(item); setItem(null); }} />
            <SheetAction icon={<Icon name="x" size={20} />} label="Sacar de la lista" onClick={async () => { await moveToList(item, null); setItem(null); toast('Quedó en la Biblioteca, sin lista'); }} />
            <SheetAction icon={<Icon name="trash" size={20} />} label="Borrar" danger onClick={async () => { const m = item; setItem(null); if (await confirm({ title: '¿Borrar?', message: m.title, confirmLabel: 'Borrar', danger: true })) await deleteMedia(m.id); }} />
          </div>
        )}
      </BottomSheet>

      <MoveSheet item={moving} lists={lists} onClose={() => setMoving(null)} />

      <BottomSheet open={menu} onClose={() => setMenu(false)} title={list.name}>
        <div className="group-body">
          <SheetAction icon={<Icon name="pencil" size={20} />} label="Renombrar" onClick={() => { setMenu(false); setRename(list.name); }} />
          {ytConnected() && (
            <SheetAction icon={<Icon name="music" size={20} />} label={list.ytPlaylistId ? 'Cambiar playlist de YouTube' : 'Vincular a una playlist de YouTube'} hint={list.ytPlaylistTitle ?? undefined} onClick={async () => {
              setMenu(false);
              try {
                setLinking(await ytPlaylists(true));
              } catch (e) {
                toast((e as Error).message, { tone: 'error' });
              }
            }} />
          )}
          {list.ytPlaylistId && <SheetAction icon={<Icon name="x" size={20} />} label="Desvincular de YouTube" onClick={async () => { await saveList(list.name, { ytPlaylistId: null, ytPlaylistTitle: null }, list.id); setMenu(false); }} />}
          <SheetAction icon={<Icon name="trash" size={20} />} label="Borrar la lista" danger onClick={async () => {
            setMenu(false);
            if (await confirm({ title: `¿Borrar «${list.name}»?`, message: 'Lo guardado no se borra: queda en la Biblioteca sin lista.', confirmLabel: 'Borrar', danger: true })) {
              await deleteList(list.id);
              navigate('/biblioteca', { replace: true });
            }
          }} />
        </div>
      </BottomSheet>

      <BottomSheet open={rename !== null} onClose={() => setRename(null)} title="Renombrar lista">
        <form className="stack" onSubmit={async (e) => { e.preventDefault(); if (rename?.trim()) { await saveList(rename.trim(), {}, list.id); setRename(null); } }}>
          <input className="input" value={rename ?? ''} onChange={(e) => setRename(e.target.value)} aria-label="Nombre" data-autofocus />
          <button type="submit" className="btn btn-primary" disabled={!rename?.trim()}>Guardar</button>
        </form>
      </BottomSheet>

      <BottomSheet open={!!linking} onClose={() => setLinking(null)} title="Playlist de YouTube" description="Los videos de YouTube que guardes en esta lista se suman también a esa playlist.">
        <div className="group-body">
          {linking?.map((p) => (
            <SheetAction key={p.id} icon={<Icon name="music" size={20} />} label={p.title} hint={`${p.count}`} checked={list.ytPlaylistId === p.id} onClick={async () => {
              await saveList(list.name, { ytPlaylistId: p.id, ytPlaylistTitle: p.title }, list.id);
              setLinking(null);
              toast(`Vinculada a «${p.title}»`);
            }} />
          ))}
          {linking && !linking.length && <p className="home-quiet">No tenés playlists en YouTube. Creá una y volvé.</p>}
        </div>
      </BottomSheet>
    </main>
  );
}

/** Elegir a qué lista mover algo (o crear una nueva ahí mismo). */
export function MoveSheet({ item, lists, onClose }: { item: MediaItem | null; lists: MediaList[]; onClose: () => void }) {
  const { toast } = useFeedback();
  const [name, setName] = useState('');
  const move = async (l: MediaList) => {
    if (!item) return;
    await moveToList(item, l);
    toast(`Movido a «${l.name}»`);
    onClose();
  };
  return (
    <BottomSheet open={!!item} onClose={onClose} title="Mover a una lista">
      <div className="group-body">
        {lists.map((l) => <SheetAction key={l.id} icon={<Icon name="folder" size={20} />} label={l.name} checked={item?.listId === l.id} onClick={() => void move(l)} />)}
      </div>
      <form className="hstack mt-4" onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) return; const l = await saveList(name.trim()); setName(''); await move(l); }}>
        <input className="input grow" placeholder="Nueva lista" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="btn btn-secondary" disabled={!name.trim()}>Crear</button>
      </form>
    </BottomSheet>
  );
}
