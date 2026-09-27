import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon, NavBar, Switch, type IconName } from '@/components/ui';
import { useHome, useSettings, useSync } from '@/hooks/useData';
import { relativeTime } from '@/utils/date';
import { cx } from '@/utils/misc';
import type { HomeModule } from '@/types';
import { TODAY_BLOCKS, todayOrder } from '@/services/prefs';
import Appearance from './Appearance';
import General from './General';
import AI from './AI';
import Sync from './Sync';
import Shortcuts from './Shortcuts';
import Data from './Data';
import Notifications from './Notifications';
import YouTubeSettings from './YouTube';
import { ytCached } from '@/services/youtube';
import { pushEnabled } from '@/services/push';

function TodaySettings() {
  const [home, setHome] = useHome();
  const order = todayOrder(home);
  const on = (id: HomeModule) => home.modules.find((m) => m.id === id)?.enabled ?? true;
  const label = (id: HomeModule) => TODAY_BLOCKS.find((b) => b.id === id)?.label ?? id;
  const save = (ids: HomeModule[], patch?: { id: HomeModule; enabled: boolean }) => {
    // Los bloques de Hoy van primero, en el orden elegido; el resto de módulos se conserva detrás.
    const rest = home.modules.filter((m) => !ids.includes(m.id));
    const modules = [
      ...ids.map((id) => ({ id, enabled: patch?.id === id ? patch.enabled : on(id) })),
      ...rest,
    ];
    void setHome({ ...home, adaptive: false, modules });
  };
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  };
  return (
    <div className="settings-part">
      <p className="group-foot">Las tareas y la semana siempre van arriba. Elegí qué bloques mostrar debajo y en qué orden.</p>
      <div className="group-body mt-2 order-list">
        {order.map((id, i) => (
          <div key={id} className="row order-row">
            <span className="row-main"><span className="row-label">{label(id)}</span></span>
            <button type="button" className="order-btn" aria-label={`Subir ${label(id)}`} disabled={i === 0} onClick={() => move(i, -1)}><Icon name="chevronUp" size={18} /></button>
            <button type="button" className="order-btn" aria-label={`Bajar ${label(id)}`} disabled={i === order.length - 1} onClick={() => move(i, 1)}><Icon name="chevronDown" size={18} /></button>
            <Switch label={label(id)} checked={on(id)} onChange={(v) => save(order, { id, enabled: v })} />
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
    { id: 'hoy', icon: 'sun', label: 'Hoy', sub: 'Qué bloques mostrar y en qué orden', el: <TodaySettings /> },
    { id: 'general', icon: 'settings', label: 'General', sub: settings.userName ? `Hola, ${settings.userName}` : 'Nombre, semana y fechas', el: <General embedded /> },
    { id: 'ia', icon: 'sparkle', label: 'IA', sub: settings.aiEnabled ? 'Activa' : 'Apagada', el: <AI embedded /> },
    { id: 'sync', icon: 'cloud', label: 'Sincronización', sub: syncSub, el: <Sync embedded /> },
    { id: 'avisos', icon: 'bell', label: 'Notificaciones', sub: pushEnabled() ? 'Activadas' : 'Avisos con la app cerrada', el: <Notifications /> },
    { id: 'youtube', icon: 'music', label: 'YouTube Music', sub: ytCached()?.playlist ? `Lista: ${ytCached()!.playlist!.title}` : 'Agregar canciones a tu lista', el: <YouTubeSettings /> },
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
      <div className="settings-list mt-6">
        <Link to="/contrasenas" className="settings-item settings-head">
          <span className="settings-icon"><Icon name="key" size={18} /></span>
          <span className="grow">
            <span className="settings-label">Contraseñas</span>
            <span className="settings-sub">Bóveda cifrada en este dispositivo</span>
          </span>
          <Icon name="chevronRight" size={16} className="settings-chev" />
        </Link>
      </div>
      <p className="group-foot" style={{ textAlign: 'center', marginTop: 28 }}>Personal OS · tus datos viven en este dispositivo{sync.userId ? ' y en tu Supabase' : ''}.</p>
    </main>
  );
}
