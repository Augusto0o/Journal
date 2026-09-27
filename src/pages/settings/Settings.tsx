import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Icon, NavBar, Switch, type IconName } from '@/components/ui';
import { useHome, useSettings, useSync } from '@/hooks/useData';
import { relativeTime } from '@/utils/date';
import { cx } from '@/utils/misc';
import type { HomeModule } from '@/types';
import Appearance from './Appearance';
import General from './General';
import AI from './AI';
import Sync from './Sync';
import Shortcuts from './Shortcuts';
import Data from './Data';

const TODAY_BLOCKS: { id: HomeModule; label: string }[] = [
  { id: 'habits', label: 'Hábitos' },
  { id: 'journal', label: 'Journal del día' },
  { id: 'english', label: 'Inglés' },
  { id: 'pomodoro', label: 'Foco' },
  { id: 'quote', label: 'Frase del día' },
  { id: 'artwork', label: 'Obra del día' },
];

function TodaySettings() {
  const [home, setHome] = useHome();
  const on = (id: HomeModule) => home.modules.find((m) => m.id === id)?.enabled ?? true;
  const toggle = (id: HomeModule, v: boolean) => {
    const has = home.modules.some((m) => m.id === id);
    void setHome({ ...home, modules: has ? home.modules.map((m) => (m.id === id ? { ...m, enabled: v } : m)) : [...home.modules, { id, enabled: v }] });
  };
  return (
    <div className="settings-part">
      <p className="group-foot">Las tareas y la semana siempre están. Elegí qué más aparece debajo.</p>
      <div className="group-body mt-2">
        {TODAY_BLOCKS.map((b) => (
          <div key={b.id} className="row">
            <span className="row-main"><span className="row-label">{b.label}</span></span>
            <Switch label={b.label} checked={on(b.id)} onChange={(v) => toggle(b.id, v)} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Todos los ajustes en una sola pantalla, en secciones plegables. */
export default function Settings() {
  const { hash } = useLocation();
  const [settings] = useSettings();
  const sync = useSync();
  const [open, setOpen] = useState<string | null>(hash.replace('#', '') || null);

  useEffect(() => {
    const id = hash.replace('#', '');
    if (!id) return;
    setOpen(id);
    requestAnimationFrame(() => document.getElementById(`s-${id}`)?.scrollIntoView({ block: 'start' }));
  }, [hash]);

  const syncSub =
    sync.state === 'disabled' ? 'Solo en este dispositivo'
      : sync.state === 'signed-out' ? 'Sin sesión iniciada'
        : sync.state === 'error' ? 'Error al sincronizar'
          : sync.lastSyncedAt ? `Sincronizado ${relativeTime(sync.lastSyncedAt)}` : 'Conectado';

  const parts: { id: string; icon: IconName; label: string; sub: string; el: React.ReactNode }[] = [
    { id: 'apariencia', icon: 'palette', label: 'Apariencia', sub: 'Tema, color y letra', el: <Appearance embedded /> },
    { id: 'hoy', icon: 'sun', label: 'Hoy', sub: 'Qué bloques mostrar', el: <TodaySettings /> },
    { id: 'general', icon: 'settings', label: 'General', sub: settings.userName ? `Hola, ${settings.userName}` : 'Nombre, semana y fechas', el: <General embedded /> },
    { id: 'ia', icon: 'sparkle', label: 'IA', sub: settings.aiEnabled ? 'Activa' : 'Apagada', el: <AI embedded /> },
    { id: 'sync', icon: 'cloud', label: 'Sincronización', sub: syncSub, el: <Sync embedded /> },
    { id: 'atajos', icon: 'bolt', label: 'Atajos de iOS', sub: 'Siri, Compartir y alarmas', el: <Shortcuts embedded /> },
    { id: 'datos', icon: 'database', label: 'Datos y copias', sub: settings.lastBackupAt ? `Última copia ${relativeTime(settings.lastBackupAt)}` : 'Exportar e importar', el: <Data embedded /> },
  ];

  return (
    <main className="page settings">
      <NavBar back="/" backLabel="Hoy" />
      <header className="today-head"><h1 className="today-title">Ajustes</h1></header>
      <div className="settings-list">
        {parts.map((p) => {
          const isOpen = open === p.id;
          return (
            <section key={p.id} id={`s-${p.id}`} className={cx('settings-item', isOpen && 'is-open')}>
              <button type="button" className="settings-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : p.id)}>
                <span className="settings-icon"><Icon name={p.icon} size={18} /></span>
                <span className="grow">
                  <span className="settings-label">{p.label}</span>
                  <span className="settings-sub">{p.sub}</span>
                </span>
                <Icon name="chevronDown" size={16} className="settings-chev" />
              </button>
              {isOpen && <div className="settings-body">{p.el}</div>}
            </section>
          );
        })}
      </div>
      <p className="group-foot" style={{ textAlign: 'center', marginTop: 28 }}>Personal OS · tus datos viven en este dispositivo{sync.userId ? ' y en tu Supabase' : ''}.</p>
    </main>
  );
}
