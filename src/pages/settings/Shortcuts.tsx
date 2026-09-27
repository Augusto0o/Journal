import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, IconButton, NavBar, Row, SwitchRow, useFeedback } from '@/components/ui';
import { useSettings, useSync } from '@/hooks/useData';
import { captureEndpoint, createToken, listTokens, revokeToken, runShortcut, SHORTCUT_NAMES, type ShortcutToken } from '@/services/shortcuts';
import { relativeTime } from '@/utils/date';

export default function ShortcutsSettings({ embedded }: { embedded?: boolean } = {}) {
  const Root = embedded ? 'div' : 'main';
  const [s, set] = useSettings();
  const sync = useSync();
  const { toast, confirm } = useFeedback();
  const [tokens, setTokens] = useState<ShortcutToken[]>([]);
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const endpoint = captureEndpoint();

  const refresh = () => listTokens().then(setTokens).catch(() => setTokens([]));
  useEffect(() => {
    if (sync.userId) void refresh();
  }, [sync.userId]);

  const copy = async (v: string, what: string) => {
    await navigator.clipboard?.writeText(v);
    toast(`${what} copiado`);
  };

  return (
    <Root className={embedded ? 'settings-part' : 'page'}>
      {!embedded && <NavBar back="/ajustes" backLabel="Ajustes" title="Atajos de iOS" />}
      <div className="page-head">
        <div>
          <h1>Atajos</h1>
          <p className="page-sub">En lugar de widgets nativos, Personal OS se integra con la app Atajos: capturá desde Siri, la hoja de Compartir o el botón de Acción, y creá recordatorios con alarma real.</p>
        </div>
      </div>

      <section className="group">
        <h2 className="group-title"><span>De la app hacia iOS</span></h2>
        <div className="group-body">
          <SwitchRow label="Agendar recordatorios en iOS" sub={`Abre «${SHORTCUT_NAMES.reminder}» para crear el recordatorio con alarma en la app Recordatorios.`} checked={s.iosReminderShortcut} onChange={(v) => void set({ iosReminderShortcut: v })} />
          <SwitchRow label="Temporizador del Pomodoro" sub={`Abre «${SHORTCUT_NAMES.timer}» al empezar un bloque, para que suene aunque la app esté cerrada.`} checked={s.iosTimerShortcut} onChange={(v) => void set({ iosTimerShortcut: v })} />
        </div>
        <p className="group-foot">Primero creá esos dos atajos con los pasos de abajo. <button type="button" className="link-btn" onClick={() => runShortcut(SHORTCUT_NAMES.timer, '1')}>Probar el temporizador (1 min)</button></p>
      </section>

      <section className="group">
        <h2 className="group-title"><span>De iOS hacia la app</span></h2>
        {!sync.userId ? (
          <p className="home-quiet">Necesita tu Supabase conectado y la sesión iniciada. <Link to="/ajustes#sync">Configurar</Link></p>
        ) : (
          <>
            <div className="group-body">
              {endpoint && <Row icon="link" label="Dirección" sub={endpoint} trailing={<IconButton icon="copy" label="Copiar dirección" onClick={() => void copy(endpoint, 'Dirección')} />} />}
              {tokens.map((t) => (
                <Row
                  key={t.id}
                  icon="key"
                  label={t.label}
                  sub={t.last_used_at ? `Usado ${relativeTime(t.last_used_at)}` : `Creado ${relativeTime(t.created_at)}`}
                  trailing={<IconButton icon="trash" label="Revocar" onClick={async () => { if (await confirm({ title: '¿Revocar el token?', message: 'Los atajos que lo usen dejan de funcionar.', confirmLabel: 'Revocar', danger: true })) { await revokeToken(t.id); void refresh(); } }} />}
                />
              ))}
              <button
                type="button"
                className="row is-accent"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    setFresh(await createToken('iPhone'));
                    void refresh();
                  } catch (e) {
                    toast((e as Error).message, { tone: 'error' });
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <span className="row-main"><span className="row-label">Generar token</span></span>
              </button>
            </div>
            {fresh && (
              <div className="token-reveal">
                <p className="small">Copialo ahora: no se vuelve a mostrar.</p>
                <code>{fresh}</code>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void copy(fresh, 'Token')}><Icon name="copy" size={16} /> Copiar</button>
              </div>
            )}
          </>
        )}
      </section>

      <section className="group recipes">
        <h2 className="group-title"><span>Cómo armar cada atajo</span></h2>
        <Recipe title="POS Capturar" when="Siri, botón de Acción o pantalla bloqueada">
          <li>Atajos → <b>+</b> → nombre «POS Capturar».</li>
          <li>Acción <b>Pedir entrada</b> (Texto), pregunta «¿Qué anoto?».</li>
          <li>Acción <b>Obtener contenido de URL</b>: la dirección de arriba, método <b>POST</b>, encabezado <code>Authorization</code> = <code>Bearer tu_token</code>, cuerpo <b>JSON</b> con clave <code>text</code> = Entrada proporcionada.</li>
          <li>Acción <b>Mostrar notificación</b> con el resultado.</li>
          <li>Opcional: en los detalles del atajo, activá «Mostrar en la hoja de Compartir» y usá la entrada del atajo en vez de «Pedir entrada» para mandar textos y enlaces desde cualquier app.</li>
        </Recipe>
        <Recipe title="POS Hoy" when="«Oye Siri, POS Hoy»">
          <li>Acción <b>Obtener contenido de URL</b> con la misma dirección, método <b>GET</b> y el mismo encabezado.</li>
          <li>Acción <b>Leer texto</b> o <b>Mostrar resultado</b>.</li>
        </Recipe>
        <Recipe title={SHORTCUT_NAMES.reminder} when="Lo abre la app al guardar un recordatorio">
          <li>Nombre exacto: «{SHORTCUT_NAMES.reminder}». Recibe texto como entrada.</li>
          <li><b>Dividir texto</b> (Entrada del atajo) por separador personalizado <code>|</code>.</li>
          <li><b>Obtener elemento de la lista</b>: primer elemento → título. Último elemento → <b>Obtener fechas del texto</b>.</li>
          <li><b>Agregar nuevo recordatorio</b> con ese título y <b>Alerta</b> en la fecha obtenida.</li>
        </Recipe>
        <Recipe title={SHORTCUT_NAMES.timer} when="Lo abre el Pomodoro">
          <li>Nombre exacto: «{SHORTCUT_NAMES.timer}». Recibe texto (minutos).</li>
          <li>Acción <b>Iniciar temporizador</b> (app Reloj) por <b>Entrada del atajo</b> minutos.</li>
        </Recipe>
        <p className="group-foot">Desde una web app no se puede agregar widgets ni la Dynamic Island: el temporizador de iOS y los widgets de Atajos cubren ese lugar.</p>
      </section>
    </Root>
  );
}

function Recipe({ title, when, children }: { title: string; when: string; children: React.ReactNode }) {
  return (
    <details className="recipe surface-card">
      <summary>
        <span className="row-main"><span className="row-label">{title}</span><span className="row-sub">{when}</span></span>
        <Icon name="chevronDown" size={18} className="recipe-chev" />
      </summary>
      <ol>{children}</ol>
    </details>
  );
}
