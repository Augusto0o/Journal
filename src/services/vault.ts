/**
 * Bóveda de contraseñas cifrada en el dispositivo (WebCrypto).
 * - Clave: PBKDF2-SHA256 (310.000 iteraciones) a partir de tu contraseña maestra.
 * - Cifrado: AES-GCM 256 por elemento, con IV aleatorio.
 * - Nunca se guarda la contraseña maestra ni se envía nada a Supabase o a la IA.
 */
import { idb } from '@/database/idb';
import { uuid } from '@/utils/misc';

export type PasswordCategory = 'web' | 'app' | 'wifi' | 'card' | 'email' | 'other';

export const PASSWORD_CATEGORIES: { id: PasswordCategory; label: string }[] = [
  { id: 'web', label: 'Web' },
  { id: 'app', label: 'App' },
  { id: 'email', label: 'Email' },
  { id: 'wifi', label: 'Wi-Fi' },
  { id: 'card', label: 'Tarjeta' },
  { id: 'other', label: 'Otro' },
];

export interface PasswordItem {
  id: string;
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  category: PasswordCategory;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
}

interface VaultConfig {
  id: 'config';
  salt: string;
  iterations: number;
  check: { iv: string; data: string };
}

interface EncryptedItem {
  id: string;
  iv: string;
  data: string;
}

const CHECK = 'personal-os-vault-v1';
const AUTO_LOCK_MS = 5 * 60_000;

let key: CryptoKey | null = null;
let items: PasswordItem[] = [];
let lockTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
let snapshot = { unlocked: false, items: [] as PasswordItem[], configured: false };

function emit() {
  snapshot = { unlocked: !!key, items: [...items].sort((a, b) => a.title.localeCompare(b.title, 'es')), configured: snapshot.configured };
  listeners.forEach((l) => l());
}

export const vaultStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  getSnapshot: () => snapshot,
};

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf instanceof Uint8Array ? buf : new Uint8Array(buf))));
const unb64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encrypt(k: CryptoKey, text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(text));
  return { iv: b64(iv), data: b64(data) };
}

async function decrypt(k: CryptoKey, e: { iv: string; data: string }) {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(e.iv) }, k, unb64(e.data));
  return new TextDecoder().decode(plain);
}

export async function loadVaultState() {
  const cfg = await idb.get<VaultConfig>('vault', 'config');
  snapshot = { ...snapshot, configured: !!cfg };
  emit();
}

export async function createVault(master: string) {
  if (master.length < 8) throw new Error('La contraseña maestra debe tener al menos 8 caracteres.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 310_000;
  const k = await derive(master, salt, iterations);
  const cfg: VaultConfig = { id: 'config', salt: b64(salt), iterations, check: await encrypt(k, CHECK) };
  await idb.put('vault', cfg);
  key = k;
  items = [];
  snapshot.configured = true;
  touch();
  emit();
}

export async function unlock(master: string): Promise<boolean> {
  const cfg = await idb.get<VaultConfig>('vault', 'config');
  if (!cfg) return false;
  const k = await derive(master, unb64(cfg.salt), cfg.iterations);
  try {
    if ((await decrypt(k, cfg.check)) !== CHECK) return false;
  } catch {
    return false;
  }
  key = k;
  const all = await idb.getAll<EncryptedItem | VaultConfig>('vault');
  const out: PasswordItem[] = [];
  for (const e of all) {
    if (e.id === 'config' || e.id === 'bio') continue;
    try {
      out.push(JSON.parse(await decrypt(k, e as EncryptedItem)) as PasswordItem);
    } catch {
      /* elemento dañado: se ignora */
    }
  }
  items = out;
  touch();
  emit();
  return true;
}

export function lock() {
  key = null;
  items = [];
  if (lockTimer) clearTimeout(lockTimer);
  emit();
}

/** Reinicia el temporizador de bloqueo automático. */
export function touch() {
  if (lockTimer) clearTimeout(lockTimer);
  if (key) lockTimer = setTimeout(lock, AUTO_LOCK_MS);
}

export function newPassword(): PasswordItem {
  const now = new Date().toISOString();
  return { id: uuid(), title: '', username: '', password: '', url: '', notes: '', category: 'web', favorite: false, createdAt: now, updatedAt: now };
}

export async function savePassword(item: PasswordItem) {
  if (!key) throw new Error('La bóveda está bloqueada.');
  const next = { ...item, updatedAt: new Date().toISOString() };
  await idb.put('vault', { id: next.id, ...(await encrypt(key, JSON.stringify(next))) });
  items = [...items.filter((i) => i.id !== next.id), next];
  touch();
  emit();
}

export async function deletePassword(id: string) {
  await idb.delete('vault', id);
  items = items.filter((i) => i.id !== id);
  emit();
}

export async function changeMaster(current: string, next: string) {
  if (!(await unlock(current))) throw new Error('La contraseña actual no es correcta.');
  const keep = [...items];
  const all = await idb.getAll<{ id: string }>('vault');
  await idb.batch(all.map((e) => ({ store: 'vault' as const, type: 'delete' as const, key: e.id })));
  await createVault(next);
  for (const i of keep) await savePassword(i);
}

export async function destroyVault() {
  const all = await idb.getAll<{ id: string }>('vault');
  await idb.batch(all.map((e) => ({ store: 'vault' as const, type: 'delete' as const, key: e.id })));
  lock();
  snapshot = { ...snapshot, configured: false };
  emit();
}

/** Copia con borrado automático del portapapeles (si el navegador lo permite). */
export async function copySecret(value: string, clearAfterMs = 45_000) {
  await navigator.clipboard.writeText(value);
  setTimeout(async () => {
    try {
      if ((await navigator.clipboard.readText()) === value) await navigator.clipboard.writeText('');
    } catch {
      /* iOS no permite leer el portapapeles sin gesto: se ignora */
    }
  }, clearAfterMs);
}

// ---------------- Generador ----------------

export interface GeneratorOptions {
  length: number;
  upper: boolean;
  lower: boolean;
  numbers: boolean;
  symbols: boolean;
  avoidAmbiguous: boolean;
}

export const DEFAULT_GENERATOR: GeneratorOptions = { length: 20, upper: true, lower: true, numbers: true, symbols: true, avoidAmbiguous: true };

function secureIndex(n: number) {
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

export function generatePassword(o: GeneratorOptions): string {
  const amb = new Set('O0oIl1|`\'"'.split(''));
  const f = (s: string) => s.split('').filter((c) => !o.avoidAmbiguous || !amb.has(c));
  const sets: string[][] = [];
  if (o.upper) sets.push(f('ABCDEFGHIJKLMNOPQRSTUVWXYZ'));
  if (o.lower) sets.push(f('abcdefghijklmnopqrstuvwxyz'));
  if (o.numbers) sets.push(f('0123456789'));
  if (o.symbols) sets.push(f('!@#$%^&*()-_=+[]{};:,.?/~'));
  if (!sets.length) sets.push(f('abcdefghijklmnopqrstuvwxyz'));
  const pool = sets.flat();
  const len = Math.max(o.length, sets.length);
  const out = sets.map((s) => s[secureIndex(s.length)]);
  while (out.length < len) out.push(pool[secureIndex(pool.length)]);
  for (let i = out.length - 1; i > 0; i--) {
    const j = secureIndex(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join('');
}

export function strength(p: string): { label: string; level: number; bits: number } {
  let pool = 0;
  if (/[A-Z]/.test(p)) pool += 26;
  if (/[a-z]/.test(p)) pool += 26;
  if (/\d/.test(p)) pool += 10;
  if (/[^A-Za-z0-9]/.test(p)) pool += 25;
  const bits = pool ? Math.round(p.length * Math.log2(pool)) : 0;
  const level = bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
  return { label: ['', 'Débil', 'Aceptable', 'Fuerte', 'Muy fuerte'][level], level, bits };
}
