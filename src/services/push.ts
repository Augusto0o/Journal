import { getSupabase } from './supabaseClient';
import { syncStatusStore } from './sync';

/**
 * Avisos push (Web Push). En iPhone funcionan con la app agregada a la pantalla de inicio (iOS 16.4+).
 * El servidor (función «push» + pg_cron) manda el aviso aunque la app esté cerrada.
 */
const ENABLED_KEY = 'pos-push-enabled';

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
export const pushEnabled = () => {
  try {
    return localStorage.getItem(ENABLED_KEY) === '1' && Notification.permission === 'granted';
  } catch {
    return false;
  }
};

async function call<T = { ok?: boolean; error?: string }>(body: Record<string, unknown>): Promise<T> {
  const sb = await getSupabase();
  if (!sb || !syncStatusStore.getSnapshot().userId) throw new Error('Conectá Supabase e iniciá sesión en Ajustes → Sincronización.');
  const { data, error } = await sb.functions.invoke('push', { body });
  if (error) {
    let msg = error.message;
    try {
      const j = await (error as { context?: Response }).context?.json();
      if (j?.error) msg = j.error;
    } catch {
      /* sin detalle */
    }
    if (/failed to send|fetch/i.test(msg)) msg = 'Falta publicar la función «push» en Supabase.';
    throw new Error(msg);
  }
  return data as T;
}

const toKey = (b64: string) => {
  const pad = b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4);
  return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
};

export async function enablePush() {
  if (!pushSupported()) throw new Error(isStandalone() ? 'Este dispositivo no admite avisos.' : 'En iPhone, primero agregá la app a la pantalla de inicio y abrila desde ahí.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Los avisos quedaron desactivados. Activalos en Configuración → Notificaciones → Personal OS.');
  const { key } = await call<{ key: string }>({ action: 'key' });
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) });
  await call({ action: 'subscribe', subscription: sub.toJSON(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  localStorage.setItem(ENABLED_KEY, '1');
}

export async function disablePush() {
  localStorage.removeItem(ENABLED_KEY);
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await call({ action: 'unsubscribe', endpoint: sub.endpoint }).catch(() => undefined);
    await sub.unsubscribe();
  }
}

export const testPush = () => call<{ sent: number }>({ action: 'test' });

/** Programa un aviso (se reemplaza el anterior con la misma etiqueta). Silencioso si los avisos están apagados. */
export function schedulePush(tag: string, at: number, title: string, body = '', url = '/') {
  if (!pushEnabled()) return;
  void call({ action: 'schedule', tag, at: new Date(at).toISOString(), title, body, url }).catch(() => undefined);
}

export function cancelPush(tag: string) {
  if (!pushEnabled()) return;
  void call({ action: 'cancel', tag }).catch(() => undefined);
}
