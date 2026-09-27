import type { SupabaseClient } from '@supabase/supabase-js';

const CONFIG_KEY = 'pos-supabase-config';

interface SupaConfig {
  url: string;
  anonKey: string;
}

/** Configuración: variables de entorno de Vercel o, si no hay, la cargada desde Ajustes. */
export function getSupabaseConfig(): SupaConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (url && anonKey && !url.includes('xxxx')) return { url, anonKey };
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      const c = JSON.parse(raw) as SupaConfig;
      if (c.url && c.anonKey) return c;
    }
  } catch {
    /* no-op */
  }
  return null;
}

export const envConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

export function saveSupabaseConfig(url: string, anonKey: string) {
  const clean = url.trim().replace(/\/+$/, '');
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ url: clean.startsWith('http') ? clean : `https://${clean}`, anonKey: anonKey.trim() }));
  client = null;
  loading = null;
}

export function clearSupabaseConfig() {
  localStorage.removeItem(CONFIG_KEY);
  client = null;
  loading = null;
}

export const isSupabaseConfigured = () => getSupabaseConfig() !== null;

let client: SupabaseClient | null = null;
let loading: Promise<SupabaseClient | null> | null = null;

/** Carga el SDK solo si hay credenciales (no pesa en el bundle inicial). */
export function getSupabase(): Promise<SupabaseClient | null> {
  const cfg = getSupabaseConfig();
  if (!cfg) return Promise.resolve(null);
  if (client) return Promise.resolve(client);
  if (!loading) {
    loading = import('@supabase/supabase-js').then(({ createClient }) => {
      client = createClient(cfg.url, cfg.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: 'pos-auth' },
      });
      return client;
    });
  }
  return loading;
}
