import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, Row, SwitchRow, useFeedback } from '@/components/ui';
import { useSync } from '@/hooks/useData';
import { ytCached, ytConnect, ytDisconnect, ytPlaylists, ytSetPlaylist, ytStatus, type YtPlaylist, type YtStatus } from '@/services/youtube';

/** Conectar YouTube Music y elegir la lista donde van las canciones. */
export default function YouTubeSettings() {
  const sync = useSync();
  const { toast, confirm } = useFeedback();
  const [st, setSt] = useState<YtStatus | null>(ytCached());
  const [lists, setLists] = useState<YtPlaylist[] | null>(null);
  const [busy, setBusy] = useState(false);

  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!sync.userId) return;
    const back = new URLSearchParams(location.search).get('youtube') === 'ok';
    if (back) history.replaceState(null, '', `${location.pathname}${location.hash}`);
    void ytStatus().then((s) => {
      setSt(s);
      if (back) toast(s.connected ? 'YouTube Music conectado: elegí tu lista' : 'No se completó la conexión con Google', { tone: s.connected ? undefined : 'error' });
    }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync.userId]);

  useEffect(() => {
    if (st?.connected && !lists) void ytPlaylists().then(setLists).catch((e) => toast((e as Error).message, { tone: 'error' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st?.connected]);

  if (!sync.userId) return <p className="home-quiet">Necesita tu Supabase conectado y la sesión iniciada. <Link to="/ajustes#sync">Configurar</Link></p>;

  return (
    <div className="settings-part">
      <section className="group">
        {!st?.connected ? (
          <>
            <div className="group-body">
              <button type="button" className="row is-accent" disabled={busy} onClick={() => void guard(ytConnect)}>
                <span className="row-main"><span className="row-label">Conectar con Google</span><span className="row-sub">Para agregar canciones a una lista tuya</span></span>
                {busy ? <span className="spinner" /> : <Icon name="arrowRight" size={18} />}
              </button>
            </div>
            {st && !st.configured && <p className="group-foot">Primero hay que cargar <code>GOOGLE_CLIENT_ID</code> y <code>GOOGLE_CLIENT_SECRET</code> en los secretos de Supabase (ver README).</p>}
          </>
        ) : (
          <>
            <h2 className="group-title"><span>Lista para las canciones</span></h2>
            <div className="group-body">
              {!lists && <p className="home-quiet"><span className="spinner" /> Cargando tus listas…</p>}
              {lists?.map((l) => (
                <button key={l.id} type="button" className="row" aria-pressed={st.playlist?.id === l.id} onClick={() => void guard(async () => setSt(await ytSetPlaylist({ id: l.id, title: l.title })))}>
                  <span className="row-main"><span className="row-label">{l.title}</span><span className="row-sub">{l.count} canciones</span></span>
                  {st.playlist?.id === l.id && <Icon name="check" size={18} />}
                </button>
              ))}
              {lists && !lists.length && <p className="home-quiet">No encontré listas. Creá una en YouTube Music y volvé acá.</p>}
            </div>
            <div className="group-body mt-4">
              <SwitchRow label="Agregar solas" sub="Cada canción que guardás o compartís a la app va también a tu lista." checked={st.auto} onChange={(v) => void guard(async () => setSt(await ytSetPlaylist(st.playlist, v)))} />
              <Row icon="logout" danger label="Desconectar YouTube Music" onClick={async () => {
                if (await confirm({ title: '¿Desconectar YouTube Music?', confirmLabel: 'Desconectar', danger: true })) void guard(async () => { await ytDisconnect(); setSt(null); setLists(null); });
              }} />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
