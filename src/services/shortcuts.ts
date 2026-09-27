/**
 * Integración con la app Atajos de iOS.
 *
 * App → Atajos: se abre shortcuts://run-shortcut con un texto de entrada
 *   (recordatorios nativos con alarma, temporizador del Pomodoro).
 * Atajos → App: los atajos llaman a la función `capture` de tu Supabase con un token personal;
 *   lo capturado aparece en la app al sincronizar. (En iOS, una PWA instalada no puede abrirse con
 *   una URL desde otra app: se abriría Safari con otro almacenamiento, por eso se usa el servidor.)
 */
import { getSupabase, getSupabaseConfig } from './supabaseClient';
import { syncStatusStore } from './sync';

export const SHORTCUT_NAMES = {
  reminder: 'POS Recordatorio iOS',
  timer: 'POS Temporizador',
} as const;

export function runShortcut(name: string, input?: string) {
  const params = new URLSearchParams({ name });
  if (input !== undefined) {
    params.set('input', 'text');
    params.set('text', input);
  }
  window.location.href = `shortcuts://run-shortcut?${params.toString().replace(/\+/g, '%20')}`;
}

/** Envía un recordatorio al Atajo que lo crea en la app Recordatorios de iOS (con alarma). */
export function sendReminderToIOS(title: string, date: string, time: string) {
  runShortcut(SHORTCUT_NAMES.reminder, `${title}|${date} ${time}`);
}

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

// ---------------- Tokens para Atajos ----------------

export interface ShortcutToken {
  id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
}

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function captureEndpoint(): string | null {
  const cfg = getSupabaseConfig();
  return cfg ? `${cfg.url}/functions/v1/capture` : null;
}

export async function listTokens(): Promise<ShortcutToken[]> {
  const sb = await getSupabase();
  if (!sb || !syncStatusStore.getSnapshot().userId) return [];
  const { data, error } = await sb.from('pos_tokens').select('id,label,created_at,last_used_at').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ShortcutToken[];
}

/** Crea un token nuevo. Se muestra UNA vez: solo se guarda su hash. */
export async function createToken(label: string): Promise<string> {
  const sb = await getSupabase();
  if (!sb) throw new Error('Supabase no está configurado.');
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const token = 'pos_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const { error } = await sb.from('pos_tokens').insert({
    token_hash: await sha256Hex(token),
    label: label || 'iPhone',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  if (error) throw error;
  return token;
}

export async function revokeToken(id: string) {
  const sb = await getSupabase();
  if (!sb) return;
  const { error } = await sb.from('pos_tokens').delete().eq('id', id);
  if (error) throw error;
}
