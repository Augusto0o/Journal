import { useState } from 'react';
import { NavBar, Row, Segmented, useFeedback } from '@/components/ui';
import { useStore, useSync } from '@/hooks/useData';
import { clearSupabaseConfig, envConfigured, getSupabaseConfig, saveSupabaseConfig } from '@/services/supabaseClient';
import { initSync, signIn, signOut, signUp, syncNow } from '@/services/sync';
import { relativeTime } from '@/utils/date';

export default function SyncSettings({ embedded }: { embedded?: boolean } = {}) {
  const Root = embedded ? 'div' : 'main';
  const sync = useSync();
  const snap = useStore();
  const { toast, confirm } = useFeedback();
  const cfg = getSupabaseConfig();
  const [url, setUrl] = useState(cfg?.url ?? '');
  const [key, setKey] = useState(cfg?.anonKey ?? '');
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const connect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^https?:\/\/.+\.supabase\.co$|^https?:\/\//.test(url.trim()) || key.trim().length < 20) {
      toast('Revisá la URL y la clave pública', { tone: 'error' });
      return;
    }
    saveSupabaseConfig(url, key);
    await initSync();
    toast('Supabase conectado');
  };

  const auth = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === 'in') await signIn(email.trim(), password);
      else {
        const r = await signUp(email.trim(), password);
        if (r.needsConfirmation) toast('Te mandamos un email para confirmar la cuenta.', { duration: 5000 });
      }
    } catch (err) {
      toast((err as Error).message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Root className={embedded ? 'settings-part' : 'page'}>
      {!embedded && <NavBar back="/ajustes" backLabel="Ajustes" title="Sincronización" />}
      <div className="page-head">
        <div>
          <h1>Sincronización</h1>
          <p className="page-sub">Tus datos siempre se guardan en este dispositivo. Con tu Supabase también quedan respaldados y disponibles para Atajos y la IA.</p>
        </div>
      </div>

      {!cfg ? (
        <form className="stack" onSubmit={connect}>
          <p className="field-label">1 · Conectar tu proyecto</p>
          <input className="input" type="url" inputMode="url" autoCapitalize="none" placeholder="https://tu-proyecto.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} />
          <input className="input" autoCapitalize="none" autoCorrect="off" placeholder="Clave pública (anon / publishable)" value={key} onChange={(e) => setKey(e.target.value)} />
          <p className="group-foot">Supabase → Project Settings → API. Nunca pegues acá la clave «service_role».</p>
          <button type="submit" className="btn btn-primary" disabled={!url || !key}>Conectar</button>
        </form>
      ) : !sync.userId ? (
        <>
          <form className="stack" onSubmit={auth}>
            <p className="field-label">2 · Tu cuenta</p>
            <Segmented label="Cuenta" value={mode} onChange={setMode} options={[{ value: 'in', label: 'Iniciar sesión' }, { value: 'up', label: 'Crear cuenta' }]} />
            <input className="input" type="email" autoComplete="email" autoCapitalize="none" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="input" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="submit" className="btn btn-primary" disabled={!email || password.length < 6 || busy}>{busy ? <span className="spinner" /> : mode === 'in' ? 'Entrar' : 'Crear cuenta'}</button>
          </form>
          <section className="group">
            <div className="group-body">
              <Row label="Proyecto" value={cfg.url.replace(/^https?:\/\//, '').replace('.supabase.co', '')} />
              {!envConfigured && <Row label="Desconectar proyecto" danger onClick={() => { clearSupabaseConfig(); void initSync(); location.reload(); }} />}
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="group">
            <div className="group-body">
              <Row icon="user" label={sync.email ?? 'Sesión iniciada'} sub={cfg.url.replace(/^https?:\/\//, '')} />
              <Row
                icon="refresh"
                label={sync.state === 'syncing' ? 'Sincronizando…' : 'Sincronizar ahora'}
                sub={sync.error ?? (sync.lastSyncedAt ? `Última vez ${relativeTime(sync.lastSyncedAt)}` : undefined)}
                value={snap.pendingCount ? `${snap.pendingCount} pendientes` : undefined}
                onClick={() => void syncNow()}
                accent
              />
            </div>
          </section>
          <section className="group">
            <div className="group-body">
              <Row
                label="Cerrar sesión"
                danger
                onClick={async () => {
                  if (await confirm({ title: '¿Cerrar sesión?', message: 'Tus datos siguen en este dispositivo.', confirmLabel: 'Cerrar sesión' })) await signOut();
                }}
              />
            </div>
          </section>
        </>
      )}
    </Root>
  );
}
