import { ytAutoAdd, ytConnected, ytTaste } from '@/services/youtube';
import { PlaylistPicker } from '@/components/media/PlaylistPicker';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Empty, Icon, NavBar, useFeedback } from '@/components/ui';
import { PreviewButton } from '@/pages/library/MediaTabs';
import { ForYouSection, type RecKind } from './ForYou';
import { useStore } from '@/hooks/useData';
import { store } from '@/database/store';
import { aiAvailable, recommend } from '@/services/ai';
import { newMedia, saveMedia, searchMusic, tasteProfile, ytMusicSearch, type MusicHit } from '@/services/media';
import type { MediaStatus } from '@/types';
import { cx } from '@/utils/misc';

const GENRES = ['Rock nacional', 'Indie', 'Pop', 'Jazz', 'Electrónica', 'Hip hop', 'R&B', 'Folk', 'Clásica', 'Latino', 'Soul', 'Ambient'];
const PREF_GENRES = 'musicGenres';

interface Rec extends MusicHit { why?: string }

export default function Discover() {
  const snap = useStore();
  const { toast } = useFeedback();
  const genres = (snap.prefs[PREF_GENRES] as string[] | undefined) ?? [];
  const [recs, setRecs] = useState<Rec[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [handled, setHandled] = useState<Record<string, MediaStatus>>({});
  const [showGenres, setShowGenres] = useState(false);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const tab = params.get('tab') ?? 'music';

  const known = useMemo(() => new Set(snap.media.filter((m) => m.mediaType === 'music').map((m) => `${m.title}|${m.creator}`.toLowerCase())), [snap.media]);
  const yt = ytConnected();
  const hasTaste = yt || genres.length > 0 || snap.media.some((m) => m.mediaType === 'music');
  const [picking, setPicking] = useState<Rec | null>(null);

  const load = async () => {
    setBusy(true);
    setHandled({});
    try {
      let out: Rec[] = [];
      if (aiAvailable()) {
        const extra = genres.length ? [`géneros preferidos: ${genres.join(', ')}`] : [];
        if (yt) {
          // Lo que escuchás en YouTube Music (me gusta y tus listas) es la base principal.
          const heard = await ytTaste().catch(() => []);
          if (heard.length) extra.unshift(`Escucha en YouTube Music (base principal para recomendar; no repitas estas): ${heard.slice(0, 60).map((h) => `${h.title}${h.artist ? ` — ${h.artist}` : ''}`).join('; ')}`);
        }
        const profile = tasteProfile(snap.media, extra);
        const items = await recommend('music', profile);
        const enriched = await Promise.all(
          items.slice(0, 8).map(async (it) => {
            try {
              const [hit] = await searchMusic(`${it.title} ${it.creator}`, 'song', 1);
              return hit ? { ...hit, why: it.why } : { title: it.title, creator: it.creator, album: null, cover: null, genre: it.genre ?? null, previewUrl: null, url: null, year: null, category: 'Canción', why: it.why };
            } catch {
              return { title: it.title, creator: it.creator, album: null, cover: null, genre: it.genre ?? null, previewUrl: null, url: null, year: null, category: 'Canción', why: it.why };
            }
          }),
        );
        out = enriched;
      } else {
        // Sin IA: artistas guardados y géneros elegidos como semillas.
        const seeds = [
          ...snap.media.filter((m) => m.mediaType === 'music' && m.status !== 'dismissed').map((m) => m.creator),
          ...genres,
        ].filter(Boolean);
        const pick = [...new Set(seeds)].sort(() => Math.random() - 0.5).slice(0, 4);
        const lists = await Promise.all(pick.map((s) => searchMusic(s, 'song', 6).catch(() => [])));
        out = lists.flat().sort(() => Math.random() - 0.5).slice(0, 12).map((h) => ({ ...h, why: `Porque te interesa ${pick.find((p) => h.creator.includes(p) || (h.genre ?? '').includes(p)) ?? 'este estilo'}` }));
      }
      setRecs(out.filter((r) => !known.has(`${r.title}|${r.creator}`.toLowerCase())));
    } catch (e) {
      toast((e as Error).message || 'No se pudieron cargar recomendaciones.', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (hasTaste && !recs && tab === 'music') void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasTaste, tab]);

  const act = async (r: Rec, status: MediaStatus) => {
    const item = newMedia('music', { title: r.title, creator: r.creator, cover: r.cover, genre: r.genre, previewUrl: r.previewUrl, url: r.url, category: r.category, year: r.year, status });
    await saveMedia(item);
    if (status !== 'dismissed') ytAutoAdd(item, (msg) => toast(msg));
    setHandled((h) => ({ ...h, [`${r.title}|${r.creator}`]: status }));
    if (status !== 'dismissed') toast(status === 'liked' ? 'Guardada en favoritos' : 'Guardada en Para escuchar');
  };

  return (
    <main className="page">
      <NavBar back="/biblioteca" backLabel="Biblioteca" title="Descubrir" />
      <div className="seg-tabs" role="tablist" aria-label="Qué descubrir">
        {([['music', 'Música'], ['books', 'Libros'], ['movies', 'Películas'], ['videos', 'Videos'], ['topics', 'Temas']] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={cx('seg-tab', tab === id && 'is-on')} onClick={() => (id === 'movies' ? navigate('/peliculas') : setParams(id === 'music' ? {} : { tab: id }, { replace: true }))}>{label}</button>
        ))}
      </div>
      {tab !== 'music' ? <ForYouSection key={tab} kind={tab as RecKind} /> : (<>
      <div className="cta-row mt-4">
        <p>{aiAvailable() ? (yt ? 'A partir de lo que escuchás en YouTube Music y lo que guardás acá.' : 'Música que aprende de lo que guardás y descartás.') : 'Música según tus artistas y géneros.'}</p>
        <button type="button" className="cta" onClick={() => void load()} disabled={busy || !hasTaste}>{busy ? <span className="spinner" /> : 'Otra tanda'} <Icon name="arrowRight" size={22} strokeWidth={1.4} className="arrow" /></button>
      </div>

      <button type="button" className="fold" onClick={() => setShowGenres((v) => !v)} aria-expanded={showGenres}>
        <span>Tus géneros{genres.length ? ` · ${genres.length}` : ''}</span>
        <Icon name={showGenres || !hasTaste ? 'chevronUp' : 'chevronDown'} size={16} />
      </button>
      {(showGenres || !hasTaste) && (
        <div className="chips-wrap">
          {GENRES.map((g) => (
            <button key={g} type="button" className="chip" aria-pressed={genres.includes(g)} onClick={() => void store.setPref(PREF_GENRES, genres.includes(g) ? genres.filter((x) => x !== g) : [...genres, g])}>{g}</button>
          ))}
        </div>
      )}

      {!hasTaste ? (
        <Empty title="Contame qué te gusta" message="Elegí algunos géneros o guardá canciones en la Biblioteca. Cada «me gusta», «para después» o «no» mejora lo que viene." />
      ) : busy && !recs ? (
        <div className="pdf-loading"><span className="spinner" /></div>
      ) : recs && !recs.length ? (
        <Empty title="Sin novedades por ahora" message="Probá con otra tanda o sumá géneros." />
      ) : (
        <ul className="rec-list">
          {recs?.map((r) => {
            const key = `${r.title}|${r.creator}`;
            const done = handled[key];
            return (
              <li key={key} className={cx('rec-card', done && 'is-done', done === 'dismissed' && 'is-dismissed')}>
                <span className="cover is-music">{r.cover ? <img src={r.cover} alt={r.title} loading="lazy" /> : <Icon name="music" size={20} />}</span>
                <div className="grow">
                  <p className="media-title">{r.title}</p>
                  <p className="row-sub">{[r.creator, r.genre].filter(Boolean).join(' · ')}</p>
                  {r.why && <p className="rec-why">{r.why}</p>}
                  {done ? (
                    <p className="media-status">{done === 'dismissed' ? 'Descartada — no te recomiendo parecidas' : done === 'liked' ? 'Te gusta' : 'En Para escuchar'}</p>
                  ) : (
                    <div className="rec-actions">
                      {r.previewUrl && <PreviewButton url={r.previewUrl} />}
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => void act(r, 'later')}>Para escuchar</button>
                      <a className="icon-btn" aria-label="Abrir en YouTube Music" href={ytMusicSearch(r.title, r.creator)} target="_blank" rel="noopener noreferrer"><Icon name="play" size={18} /></a>
                      {yt && <button type="button" className="icon-btn" aria-label="Agregar a una lista de YouTube Music" onClick={() => setPicking(r)}><Icon name="plus" size={19} /></button>}
                      <button type="button" className="icon-btn" aria-label="Me gusta" onClick={() => void act(r, 'liked')}><Icon name="heart" size={19} /></button>
                      <button type="button" className="icon-btn" aria-label="No me interesa" onClick={() => void act(r, 'dismissed')}><Icon name="thumbDown" size={19} /></button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <PlaylistPicker song={picking ? { title: picking.title, creator: picking.creator } : null} onClose={() => setPicking(null)} />
      <p className="group-foot mt-6">Vistas previas de 30 s vía iTunes. ▶ abre la canción completa en YouTube Music{yt ? ' y + la suma a la lista que elijas' : <>. Conectá tu cuenta en <Link to="/ajustes#youtube">Ajustes → YouTube Music</Link> para recomendaciones a partir de lo que escuchás</>}.</p>
      </>)}
    </main>
  );
}
