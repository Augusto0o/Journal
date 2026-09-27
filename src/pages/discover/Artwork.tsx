import { useEffect, useState } from 'react';
import { Icon, NavBar, useFeedback } from '@/components/ui';
import { useStore, useToday } from '@/hooks/useData';
import { store } from '@/database/store';
import { deleteMedia, fetchArtwork, newMedia, saveMedia, type Artwork as Art } from '@/services/media';

const PREF_ART = 'artworkToday2';

export function daySeed(day: string) {
  return Math.floor(new Date(`${day}T12:00:00`).getTime() / 86_400_000);
}

/** Obra del día con caché diaria (sirve también para el bloque de Inicio). */
export function useArtwork(day: string, offset = 0) {
  const snap = useStore();
  const cached = snap.prefs[PREF_ART] as { day: string; art: Art } | undefined;
  const [art, setArt] = useState<Art | null>(offset === 0 && cached?.day === day ? cached.art : null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (offset === 0 && cached?.day === day) {
      setArt(cached.art);
      return;
    }
    let alive = true;
    setError(false);
    fetchArtwork(daySeed(day) + offset * 7)
      .then((a) => {
        if (!alive) return;
        setArt(a);
        if (offset === 0) void store.setPref(PREF_ART, { day, art: a });
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, offset]);
  return { art: art ?? (error && cached ? cached.art : null), error: error && !cached };
}

export default function Artwork() {
  const today = useToday();
  const snap = useStore();
  const [offset, setOffset] = useState(0);
  const { art, error } = useArtwork(today, offset);
  const { toast } = useFeedback();
  const favs = snap.media.filter((m) => m.mediaType === 'art');
  const saved = art ? favs.find((f) => f.meta?.artId === String(art.id)) : undefined;

  return (
    <main className="page">
      <NavBar back="/biblioteca" backLabel="Biblioteca" title={offset ? 'Otra obra' : 'Obra del día'} />
      {error ? (
        <p className="home-quiet mt-6">No se pudo cargar la obra (necesita conexión).</p>
      ) : !art ? (
        <div className="art-skeleton skeleton mt-4" />
      ) : (
        <article className="art">
          <a href={art.url} target="_blank" rel="noopener noreferrer" className="art-frame">
            <img src={art.image} alt={`${art.title}, ${art.artist}`} />
          </a>
          <h1 className="art-title">{art.title}</h1>
          <p className="art-meta">{art.artist}{art.year ? ` · ${art.year}` : ''}</p>
          <p className="art-museum">{art.museum}</p>
          {art.story && <p className="art-story">{art.story}</p>}
          {art.context && <p className="art-context">{art.context}</p>}
          <div className="hstack mt-6">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={async () => {
                if (saved) {
                  await deleteMedia(saved.id);
                  toast('Quitada de favoritas');
                } else {
                  await saveMedia(newMedia('art', { title: art.title, creator: art.artist, cover: art.thumb, url: art.url, year: art.year, notes: art.story, meta: { artId: String(art.id), museum: art.museum } }));
                  toast('Guardada en favoritas');
                }
              }}
            >
              <Icon name="heart" size={16} filled={!!saved} strokeWidth={saved ? 0 : 1.75} /> {saved ? 'Favorita' : 'Guardar'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOffset((o) => o + 1)}>Ver otra</button>
          </div>
        </article>
      )}

      {favs.length > 0 && (
        <section className="group">
          <h2 className="group-title"><span>Favoritas</span></h2>
          <ul className="art-favs">
            {favs.map((f) => (
              <li key={f.id}>
                <a href={f.url ?? '#'} target="_blank" rel="noopener noreferrer">
                  {f.cover && <img src={f.cover} alt={f.title} loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />}
                  <span className="media-title clamp-2">{f.title}</span>
                  <span className="row-sub">{f.creator}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="group-foot mt-6">Obras de dominio público del Cleveland Museum of Art. Textos traducidos al español.</p>
    </main>
  );
}
