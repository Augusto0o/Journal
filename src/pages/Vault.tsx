import { useEffect, useMemo, useState } from 'react';
import { BottomSheet, Chip, Chips, Empty, Icon, IconButton, NavBar, Row, SwitchRow, Stepper, useFeedback } from '@/components/ui';
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
    <main className="page">
      <NavBar
        back="/buscar"
        backLabel="Buscar"
        title="Contraseñas"
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
      <BottomSheet open={sheet === 'settings'} onClose={() => setSheet(null)} title="Bóveda">
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
  return (
    <form
      className="vault-gate"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const ok = await unlock(p);
        setBusy(false);
        setError(!ok);
        if (ok) setP('');
      }}
    >
      <span className="vault-mark"><Icon name="lock" size={28} /></span>
      <h1>Bloqueada</h1>
      <input className={cx('input', error && 'is-error')} type="password" autoComplete="current-password" placeholder="Contraseña maestra" value={p} onChange={(e) => { setP(e.target.value); setError(false); }} autoFocus />
      {error && <p className="error-text">Contraseña incorrecta.</p>}
      <button type="submit" className="btn btn-primary btn-block" disabled={!p || busy}>{busy ? <span className="spinner" /> : 'Desbloquear'}</button>
      <button type="button" className="btn btn-ghost" onClick={onForgot}>Opciones</button>
    </form>
  );
}

function VaultList({ items, onSettings }: { items: PasswordItem[]; onSettings: () => void }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<PasswordCategory | 'fav' | null>(null);
  const [editing, setEditing] = useState<PasswordItem | null>(null);
  const list = useMemo(() => {
    let l = items;
    if (cat === 'fav') l = l.filter((i) => i.favorite);
    else if (cat) l = l.filter((i) => i.category === cat);
    const n = normalize(q.trim());
    if (n) l = l.filter((i) => normalize(`${i.title} ${i.username} ${i.url}`).includes(n));
    return l;
  }, [items, q, cat]);

  return (
    <>
      <div className="page-head">
        <div><h1>Contraseñas</h1><p className="page-sub">{items.length} guardadas · se bloquea sola a los 5 minutos</p></div>
        <div className="page-head-actions"><IconButton icon="plus" label="Nueva" tone="accent" onClick={() => setEditing(newPassword())} /></div>
      </div>
      <label className="search-field"><Icon name="search" size={18} /><input type="search" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <div className="mt-4">
        <Chips>
          <Chip on={!cat} onClick={() => setCat(null)}>Todas</Chip>
          <Chip on={cat === 'fav'} onClick={() => setCat('fav')}>Favoritas</Chip>
          {PASSWORD_CATEGORIES.map((c) => <Chip key={c.id} on={cat === c.id} onClick={() => setCat(c.id)}>{c.label}</Chip>)}
        </Chips>
      </div>
      {!list.length ? (
        <Empty title={items.length ? 'Sin resultados' : 'Nada guardado todavía'} message={items.length ? undefined : 'Agregá cuentas, redes Wi-Fi o datos que quieras tener a mano y cifrados.'} />
      ) : (
        <section className="group">
          <div className="group-body">
            {list.map((i) => <Row key={i.id} icon={CAT_ICON[i.category]} label={i.title || 'Sin título'} sub={i.username || i.url || undefined} onClick={() => setEditing(i)} chevron />)}
          </div>
        </section>
      )}
      <p className="group-foot mt-6"><button type="button" className="link-btn" onClick={onSettings}>Cambiar contraseña maestra o borrar la bóveda</button></p>
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
    <form className="stack" onSubmit={async (e) => { e.preventDefault(); await savePassword(p); onDone(); }}>
      <input className="input" placeholder="Nombre (Gmail, Banco, Wi-Fi casa)" value={p.title} onChange={(e) => set({ title: e.target.value })} />
      <div className="input-group">
        <input className="input" placeholder="Usuario o email" autoCapitalize="none" autoCorrect="off" value={p.username} onChange={(e) => set({ username: e.target.value })} />
        {p.username && <IconButton icon="copy" label="Copiar usuario" onClick={() => void copy(p.username, 'Usuario')} />}
      </div>
      <div className="input-group">
        <input className="input secret" type={show ? 'text' : 'password'} placeholder="Contraseña" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={p.password} onChange={(e) => set({ password: e.target.value })} />
        <IconButton icon={show ? 'eyeOff' : 'eye'} label={show ? 'Ocultar' : 'Mostrar'} onClick={() => setShow((v) => !v)} />
        {p.password && <IconButton icon="copy" label="Copiar contraseña" onClick={() => void copy(p.password, 'Contraseña')} />}
        <IconButton icon="dice" label="Generar" onClick={() => { set({ password: generatePassword(store.pref(PREF.generator, DEFAULT_GENERATOR)) }); setShow(true); }} />
      </div>
      {p.password && (
        <div className="strength" data-level={s.level}>
          <span className="strength-bar"><i /><i /><i /><i /></span>
          <span className="small muted">{s.label} · {s.bits} bits</span>
        </div>
      )}
      <input className="input" type="url" placeholder="Sitio (opcional)" autoCapitalize="none" value={p.url} onChange={(e) => set({ url: e.target.value })} />
      <div className="chips-wrap">
        {PASSWORD_CATEGORIES.map((c) => <button key={c.id} type="button" className="chip" aria-pressed={p.category === c.id} onClick={() => set({ category: c.id })}>{c.label}</button>)}
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

function VaultSettings({ unlocked, onDone }: { unlocked: boolean; onDone: () => void }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const { toast, confirm } = useFeedback();
  return (
    <div className="stack">
      {unlocked && (
        <form className="stack" onSubmit={async (e) => { e.preventDefault(); try { await changeMaster(cur, next); toast('Contraseña maestra actualizada'); onDone(); } catch (err) { toast((err as Error).message, { tone: 'error' }); } }}>
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
