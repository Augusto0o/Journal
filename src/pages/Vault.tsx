import { useEffect, useMemo, useState } from 'react';
import { BottomSheet, Empty, Icon, IconButton, NavBar, SwitchRow, Stepper, useFeedback } from '@/components/ui';
import { bioConfigured, bioMaster, bioSupported, disableBio, enableBio } from '@/services/vaultBio';
import { useVault } from '@/hooks/useData';
import {
  changeMaster, copySecret, createVault, DEFAULT_GENERATOR, deletePassword, destroyVault, generatePassword, lock, newPassword,
  PASSWORD_CATEGORIES, savePassword, strength, touch, unlock, type GeneratorOptions, type PasswordCategory, type PasswordItem,
} from '@/services/vault';
import { store } from '@/database/store';
import { PREF } from '@/services/prefs';
import { normalize } from '@/utils/html';
import { cx } from '@/utils/misc';
import type { IconName } from '@/components/ui';

const CAT_ICON: Record<PasswordCategory, IconName> = { web: 'globe', app: 'app', email: 'mail', wifi: 'wifi', card: 'card', other: 'key' };

export default function Vault() {
  const v = useVault();
  const [sheet, setSheet] = useState<null | 'generator' | 'settings'>(null);

  useEffect(() => {
    if (!v.unlocked) return;
    const onAct = () => touch();
    const onHide = () => document.visibilityState === 'hidden' && lock();
    window.addEventListener('pointerdown', onAct);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pointerdown', onAct);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [v.unlocked]);

  return (
    <main className="page vault">
      <NavBar
        back="/"
        backLabel="Hoy"
        end={v.unlocked ? (
          <>
            <IconButton icon="dice" label="Generador" onClick={() => setSheet('generator')} />
            <IconButton icon="lock" label="Bloquear" onClick={lock} />
          </>
        ) : undefined}
      />
      {!v.configured ? <Setup /> : !v.unlocked ? <Unlock onForgot={() => setSheet('settings')} /> : <VaultList items={v.items} onSettings={() => setSheet('settings')} />}

      <BottomSheet open={sheet === 'generator'} onClose={() => setSheet(null)} title="Generador">
        <Generator />
      </BottomSheet>
      <BottomSheet open={sheet === 'settings'} onClose={() => setSheet(null)} title="Opciones de la bóveda">
        <VaultSettings unlocked={v.unlocked} onDone={() => setSheet(null)} />
      </BottomSheet>
    </main>
  );
}

function Setup() {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [busy, setBusy] = useState(false);
  const { toast } = useFeedback();
  return (
    <form
      className="vault-gate"
      onSubmit={async (e) => {
        e.preventDefault();
        if (a !== b) return toast('Las contraseñas no coinciden', { tone: 'error' });
        setBusy(true);
        try {
          await createVault(a);
        } catch (err) {
          toast((err as Error).message, { tone: 'error' });
        } finally {
          setBusy(false);
        }
      }}
    >
      <span className="vault-mark"><Icon name="shield" size={28} /></span>
      <h1>Tu bóveda</h1>
      <p className="muted">Las contraseñas se cifran en este iPhone con AES-256 y una clave derivada de tu contraseña maestra. No se sincronizan ni pasan por la IA.</p>
      <input className="input" type="password" autoComplete="new-password" placeholder="Contraseña maestra (mín. 8)" value={a} onChange={(e) => setA(e.target.value)} />
      <input className="input" type="password" autoComplete="new-password" placeholder="Repetirla" value={b} onChange={(e) => setB(e.target.value)} />
      <p className="group-foot">Si la olvidás, no hay forma de recuperar lo guardado.</p>
      <button type="submit" className="btn btn-primary btn-block" disabled={a.length < 8 || !b || busy}>{busy ? <span className="spinner" /> : 'Crear bóveda'}</button>
    </form>
  );
}

function Unlock({ onForgot }: { onForgot: () => void }) {
  const [p, setP] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [bio, setBio] = useState(false);
  const [usePass, setUsePass] = useState(false);
  const { toast } = useFeedback();

  useEffect(() => {
    void bioConfigured().then(setBio);
  }, []);

  const withFace = async () => {
    setBusy(true);
    try {
      const master = await bioMaster();
      if (master && !(await unlock(master))) toast('La llave de Face ID quedó vieja: entrá con la contraseña y volvé a activarla.', { tone: 'error' });
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="vault-gate">
      <span className="vault-mark"><Icon name="lock" size={28} /></span>
      <h1>Bóveda bloqueada</h1>
      {bio && !usePass ? (
        <>
          <button type="button" className="btn btn-primary btn-block vault-face" onClick={() => void withFace()} disabled={busy}>
            {busy ? <span className="spinner" /> : <Icon name="eye" size={20} />} Desbloquear con Face ID
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setUsePass(true)}>Usar la contraseña maestra</button>
        </>
      ) : (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const ok = await unlock(p);
            setBusy(false);
            setError(!ok);
            if (ok) setP('');
          }}
        >
          <input className={cx('input', error && 'is-error')} type="password" autoComplete="current-password" placeholder="Contraseña maestra" value={p} onChange={(e) => { setP(e.target.value); setError(false); }} autoFocus={!bio} />
          {error && <p className="error-text">Contraseña incorrecta.</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={!p || busy}>{busy ? <span className="spinner" /> : 'Desbloquear'}</button>
          {bio && <button type="button" className="btn btn-ghost" onClick={() => setUsePass(false)}>Usar Face ID</button>}
        </form>
      )}
      <button type="button" className="quiet-link" onClick={onForgot}>Opciones de la bóveda</button>
    </div>
  );
}

function VaultList({ items, onSettings }: { items: PasswordItem[]; onSettings: () => void }) {
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<PasswordItem | null>(null);
  const { toast } = useFeedback();
  const list = useMemo(() => {
    const n = normalize(q.trim());
    return n ? items.filter((i) => normalize(`${i.title} ${i.username} ${i.url}`).includes(n)) : items;
  }, [items, q]);
  const [bioOffer, setBioOffer] = useState(false);
  useEffect(() => {
    void Promise.all([bioSupported(), bioConfigured()]).then(([sup, conf]) => setBioOffer(sup && !conf));
  }, []);
  const favs = list.filter((i) => i.favorite);
  const rest = list.filter((i) => !i.favorite);

  const copyPass = async (i: PasswordItem) => {
    try {
      await copySecret(i.password);
      toast('Contraseña copiada · se borra en 45 s');
    } catch {
      toast('No se pudo copiar', { tone: 'error' });
    }
  };

  const Group = ({ title, rows }: { title?: string; rows: PasswordItem[] }) => (
    <section className="block">
      {title && <div className="block-head"><h2>{title}</h2></div>}
      <div className="list">
        {rows.map((i) => (
          <div key={i.id} className="vault-row">
            <button type="button" className="vault-row-main" onClick={() => setEditing(i)}>
              <span className="vault-icon"><Icon name={CAT_ICON[i.category]} size={18} /></span>
              <span className="grow">
                <span className="vault-title">{i.title || 'Sin título'}</span>
                {(i.username || i.url) && <span className="vault-sub">{i.username || i.url}</span>}
              </span>
            </button>
            {i.password && <IconButton icon="copy" label={`Copiar contraseña de ${i.title}`} onClick={() => void copyPass(i)} />}
          </div>
        ))}
      </div>
    </section>
  );

  return (
    <>
      <header className="today-head">
        <div className="grow">
          <p className="today-date">{items.length} {items.length === 1 ? 'guardada' : 'guardadas'} · se bloquea sola a los 5 min</p>
          <h1 className="today-title">Contraseñas</h1>
        </div>
        <IconButton icon="plus" label="Nueva" tone="filled" onClick={() => setEditing(newPassword())} />
      </header>
      {bioOffer && (
        <button type="button" className="card-link is-row vault-offer" onClick={onSettings}>
          <span className="vault-icon"><Icon name="eye" size={18} /></span>
          <span className="grow">
            <span className="card-title">Entrar con Face ID</span>
            <span className="card-text">Activalo para no escribir la contraseña maestra.</span>
          </span>
          <Icon name="chevronRight" size={18} />
        </button>
      )}
      {items.length > 0 && (
        <label className="search-field"><Icon name="search" size={18} /><input type="search" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      )}
      {!list.length ? (
        <Empty title={items.length ? 'Sin resultados' : 'Nada guardado todavía'} message={items.length ? undefined : 'Guardá cuentas, redes Wi-Fi o datos que quieras tener a mano. Todo queda cifrado en este iPhone.'} action={items.length ? undefined : <button type="button" className="btn btn-primary" onClick={() => setEditing(newPassword())}>Agregar la primera</button>} />
      ) : (
        <>
          {favs.length > 0 && <Group title="Favoritas" rows={favs} />}
          {rest.length > 0 && <Group title={favs.length ? 'Todas' : undefined} rows={rest} />}
        </>
      )}
      <button type="button" className="quiet-link mt-6" onClick={onSettings}>Face ID, contraseña maestra y borrar</button>
      <BottomSheet open={!!editing} onClose={() => setEditing(null)} title={editing && items.some((x) => x.id === editing.id) ? editing.title || 'Contraseña' : 'Nueva contraseña'}>
        {editing && <PasswordForm item={editing} isNew={!items.some((x) => x.id === editing.id)} onDone={() => setEditing(null)} />}
      </BottomSheet>
    </>
  );
}

function PasswordForm({ item, isNew, onDone }: { item: PasswordItem; isNew: boolean; onDone: () => void }) {
  const [p, setP] = useState(item);
  const [show, setShow] = useState(isNew);
  const { toast, confirm } = useFeedback();
  const set = (patch: Partial<PasswordItem>) => setP((x) => ({ ...x, ...patch }));
  const s = strength(p.password);
  const copy = async (v: string, what: string) => {
    try {
      await copySecret(v);
      toast(`${what} copiado`);
    } catch {
      toast('No se pudo copiar', { tone: 'error' });
    }
  };
  return (
    <form className="stack vault-form" onSubmit={async (e) => { e.preventDefault(); await savePassword(p); onDone(); }}>
      <div className="field-stack">
        <label className="fs-row"><span>Nombre</span><input placeholder="Gmail, Banco, Wi-Fi casa" value={p.title} onChange={(e) => set({ title: e.target.value })} /></label>
        <label className="fs-row">
          <span>Usuario</span>
          <input placeholder="usuario o email" autoCapitalize="none" autoCorrect="off" value={p.username} onChange={(e) => set({ username: e.target.value })} />
          {p.username && <button type="button" className="fs-btn" aria-label="Copiar usuario" onClick={() => void copy(p.username, 'Usuario')}><Icon name="copy" size={17} /></button>}
        </label>
        <label className="fs-row">
          <span>Contraseña</span>
          <input className="secret" type={show ? 'text' : 'password'} placeholder="••••••••" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={p.password} onChange={(e) => set({ password: e.target.value })} />
          <button type="button" className="fs-btn" aria-label={show ? 'Ocultar' : 'Mostrar'} onClick={() => setShow((v) => !v)}><Icon name={show ? 'eyeOff' : 'eye'} size={17} /></button>
          {p.password && <button type="button" className="fs-btn" aria-label="Copiar contraseña" onClick={() => void copy(p.password, 'Contraseña')}><Icon name="copy" size={17} /></button>}
          <button type="button" className="fs-btn" aria-label="Generar" onClick={() => { set({ password: generatePassword(store.pref(PREF.generator, DEFAULT_GENERATOR)) }); setShow(true); }}><Icon name="dice" size={17} /></button>
        </label>
        <label className="fs-row"><span>Sitio</span><input type="url" placeholder="opcional" autoCapitalize="none" value={p.url} onChange={(e) => set({ url: e.target.value })} /></label>
      </div>
      {p.password && (
        <div className="strength" data-level={s.level}>
          <span className="strength-bar"><i /><i /><i /><i /></span>
          <span className="small muted">{s.label} · {s.bits} bits</span>
        </div>
      )}
      <div className="type-picker is-static" role="radiogroup" aria-label="Tipo">
        {PASSWORD_CATEGORIES.map((c) => <button key={c.id} type="button" role="radio" aria-checked={p.category === c.id} onClick={() => set({ category: c.id })}>{c.label}</button>)}
      </div>
      <textarea className="textarea" rows={2} placeholder="Notas" value={p.notes} onChange={(e) => set({ notes: e.target.value })} />
      <div className="group-body"><SwitchRow label="Favorita" checked={p.favorite} onChange={(v) => set({ favorite: v })} /></div>
      <button type="submit" className="btn btn-primary">Guardar</button>
      {!isNew && (
        <button type="button" className="btn btn-ghost danger-text" onClick={async () => { if (await confirm({ title: '¿Eliminar esta contraseña?', confirmLabel: 'Eliminar', danger: true })) { await deletePassword(p.id); onDone(); } }}>
          Eliminar
        </button>
      )}
    </form>
  );
}

function Generator() {
  const [o, setO] = useState<GeneratorOptions>(() => store.pref(PREF.generator, DEFAULT_GENERATOR));
  const [pw, setPw] = useState(() => generatePassword(o));
  const { toast } = useFeedback();
  const upd = (patch: Partial<GeneratorOptions>) => {
    const next = { ...o, ...patch };
    setO(next);
    setPw(generatePassword(next));
    void store.setPref(PREF.generator, next);
  };
  const s = strength(pw);
  return (
    <div className="stack">
      <output className="gen-output">{pw}</output>
      <div className="strength" data-level={s.level}><span className="strength-bar"><i /><i /><i /><i /></span><span className="small muted">{s.label} · {s.bits} bits</span></div>
      <div className="hstack">
        <button type="button" className="btn btn-secondary grow" onClick={() => setPw(generatePassword(o))}><Icon name="refresh" size={18} /> Otra</button>
        <button type="button" className="btn btn-primary grow" onClick={async () => { await copySecret(pw); toast('Copiada. Se borra del portapapeles en 45 s.'); }}><Icon name="copy" size={18} /> Copiar</button>
      </div>
      <div className="group-body">
        <div className="row"><span className="row-main"><span className="row-label">Longitud</span></span><Stepper label="Longitud" value={o.length} min={8} max={64} onChange={(v) => upd({ length: v })} /></div>
        <SwitchRow label="Mayúsculas" checked={o.upper} onChange={(v) => upd({ upper: v })} />
        <SwitchRow label="Minúsculas" checked={o.lower} onChange={(v) => upd({ lower: v })} />
        <SwitchRow label="Números" checked={o.numbers} onChange={(v) => upd({ numbers: v })} />
        <SwitchRow label="Símbolos" checked={o.symbols} onChange={(v) => upd({ symbols: v })} />
        <SwitchRow label="Evitar ambiguos (O 0 l 1)" checked={o.avoidAmbiguous} onChange={(v) => upd({ avoidAmbiguous: v })} />
      </div>
    </div>
  );
}

function FaceIdSetting() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [on, setOn] = useState(false);
  const [asking, setAsking] = useState(false);
  const [master, setMaster] = useState('');
  const [busy, setBusy] = useState(false);
  const { toast } = useFeedback();
  useEffect(() => {
    void bioSupported().then(setSupported);
    void bioConfigured().then(setOn);
  }, []);
  if (supported === false) return <p className="group-foot">Este dispositivo no tiene Face ID o Touch ID disponible para la web.</p>;
  return (
    <div className="stack">
      <div className="group-body">
        <SwitchRow
          label="Desbloquear con Face ID"
          sub="Se guarda una llave en este iPhone. Requiere iOS 18 o superior."
          checked={on}
          onChange={async (v) => {
            if (v) setAsking(true);
            else {
              await disableBio();
              setOn(false);
              toast('Face ID desactivado');
            }
          }}
        />
      </div>
      {asking && !on && (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              if (!(await unlock(master))) throw new Error('La contraseña maestra no es correcta.');
              await enableBio(master);
              setOn(true);
              setAsking(false);
              setMaster('');
              toast('Listo: la próxima vez entrás con Face ID');
            } catch (err) {
              toast((err as Error).message, { tone: 'error' });
            } finally {
              setBusy(false);
            }
          }}
        >
          <input className="input" type="password" autoComplete="current-password" placeholder="Contraseña maestra, para confirmar" value={master} onChange={(e) => setMaster(e.target.value)} autoFocus />
          <button type="submit" className="btn btn-primary" disabled={!master || busy}>{busy ? <span className="spinner" /> : 'Activar Face ID'}</button>
        </form>
      )}
    </div>
  );
}

function VaultSettings({ unlocked, onDone }: { unlocked: boolean; onDone: () => void }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const { toast, confirm } = useFeedback();
  return (
    <div className="stack">
      <FaceIdSetting />
      {unlocked && (
        <form className="stack mt-4" onSubmit={async (e) => { e.preventDefault(); try { await changeMaster(cur, next); await disableBio(); toast('Contraseña maestra actualizada. Si usabas Face ID, volvé a activarlo.'); onDone(); } catch (err) { toast((err as Error).message, { tone: 'error' }); } }}>
          <p className="field-label">Cambiar contraseña maestra</p>
          <input className="input" type="password" placeholder="Actual" value={cur} onChange={(e) => setCur(e.target.value)} />
          <input className="input" type="password" placeholder="Nueva (mín. 8)" value={next} onChange={(e) => setNext(e.target.value)} />
          <button type="submit" className="btn btn-secondary" disabled={!cur || next.length < 8}>Cambiar</button>
        </form>
      )}
      <button
        type="button"
        className="btn btn-danger mt-4"
        onClick={async () => {
          if (await confirm({ title: '¿Borrar la bóveda?', message: 'Se eliminan todas las contraseñas de este dispositivo. No se puede deshacer.', confirmLabel: 'Borrar todo', danger: true })) {
            await destroyVault();
            onDone();
          }
        }}
      >
        Borrar la bóveda
      </button>
    </div>
  );
}
