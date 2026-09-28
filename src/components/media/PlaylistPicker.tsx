import { useEffect, useState } from 'react';
import { BottomSheet, Icon, useFeedback } from '@/components/ui';
import { ytAdd, ytCached, ytPlaylists, type YtPlaylist } from '@/services/youtube';
import type { MediaItem } from '@/types';

/** Elegir a qué lista de YouTube Music va una canción. */
export function PlaylistPicker({ song, onClose }: { song: Pick<MediaItem, 'title' | 'creator' | 'meta'> | null; onClose: () => void }) {
  const { toast } = useFeedback();
  const [lists, setLists] = useState<YtPlaylist[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const def = ytCached()?.playlist?.id;

  useEffect(() => {
    if (!song || lists) return;
    ytPlaylists().then(setLists).catch((e) => {
      toast((e as Error).message, { tone: 'error' });
      onClose();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song]);

  const add = async (l: YtPlaylist) => {
    if (!song) return;
    setBusy(l.id);
    try {
      await ytAdd(song, { id: l.id, title: l.title });
      toast(`Agregada a «${l.title}»`);
      onClose();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const sorted = lists ? [...lists].sort((a, b) => Number(b.id === def) - Number(a.id === def)) : null;

  return (
    <BottomSheet open={!!song} onClose={onClose} title="Agregar a una lista" description={song ? `${song.title}${song.creator ? ` · ${song.creator}` : ''}` : undefined}>
      {!sorted ? (
        <p className="home-quiet"><span className="spinner" /> Cargando tus listas…</p>
      ) : !sorted.length ? (
        <p className="home-quiet">No tenés listas. Creá una en YouTube Music y volvé acá.</p>
      ) : (
        <div className="group-body">
          {sorted.map((l) => (
            <button key={l.id} type="button" className="row playlist-row" disabled={!!busy} onClick={() => void add(l)}>
              {l.thumb ? <img src={l.thumb} alt="" className="playlist-thumb" /> : <span className="playlist-thumb"><Icon name="music" size={18} /></span>}
              <span className="row-main"><span className="row-label">{l.title}</span><span className="row-sub">{l.count} canciones{l.id === def ? ' · la de siempre' : ''}</span></span>
              {busy === l.id ? <span className="spinner" /> : <Icon name="plus" size={18} />}
            </button>
          ))}
        </div>
      )}
    </BottomSheet>
  );
}
