/**
 * Desbloqueo de la bóveda con Face ID / Touch ID (WebAuthn + extensión PRF).
 *
 * Cómo funciona, sin guardar nada legible:
 * 1. Se crea una llave de acceso (passkey) solo para esta app.
 * 2. La extensión PRF de la llave devuelve 32 bytes secretos, que solo se obtienen
 *    después de verificar tu cara o huella.
 * 3. Con esos bytes se cifra (AES-GCM) la contraseña maestra y se guarda cifrada.
 * Para desbloquear: Face ID → PRF → se descifra la maestra → se abre la bóveda.
 * Sin tu cara/huella, lo guardado es inútil. Requiere iOS 18 o superior.
 */
import { idb } from '@/database/idb';

interface BioRecord {
  id: 'bio';
  credentialId: string;
  prfSalt: string;
  iv: string;
  data: string;
}

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf instanceof Uint8Array ? buf : new Uint8Array(buf))));
const unb64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

type PrfResults = { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } };

export async function bioSupported(): Promise<boolean> {
  try {
    if (!window.PublicKeyCredential || !navigator.credentials) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function bioConfigured(): Promise<boolean> {
  return !!(await idb.get<BioRecord>('vault', 'bio'));
}

async function keyFromPrf(prf: ArrayBuffer) {
  const base = await crypto.subtle.importKey('raw', prf, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('personal-os-vault-bio'), info: new Uint8Array() },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function getPrf(credentialId: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> {
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: location.hostname,
      allowCredentials: [{ type: 'public-key', id: credentialId, transports: ['internal', 'hybrid'] }],
      userVerification: 'required',
      timeout: 60_000,
      extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  const ext = cred?.getClientExtensionResults() as PrfResults | undefined;
  const out = ext?.prf?.results?.first;
  if (!out) throw new Error('Este dispositivo no permite desbloquear con Face ID desde la web (hace falta iOS 18 o superior).');
  return out;
}

/** Activa Face ID: necesita la contraseña maestra (ya verificada) para guardarla cifrada. */
export async function enableBio(master: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { id: location.hostname, name: 'Personal OS' },
      user: { id: userId, name: 'Bóveda de Personal OS', displayName: 'Bóveda de Personal OS' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60_000,
      extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('No se creó la llave.');
  const ext = cred.getClientExtensionResults() as PrfResults;
  if (ext.prf?.enabled === false) throw new Error('Este dispositivo no permite desbloquear con Face ID desde la web (hace falta iOS 18 o superior).');
  const id = new Uint8Array(cred.rawId);
  // Algunos sistemas devuelven el PRF al crear; si no, se pide con un segundo Face ID.
  const prf = ext.prf?.results?.first ?? (await getPrf(id, salt));
  const key = await keyFromPrf(prf);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(master));
  const rec: BioRecord = { id: 'bio', credentialId: b64(id), prfSalt: b64(salt), iv: b64(iv), data: b64(data) };
  await idb.put('vault', rec);
}

/** Face ID → contraseña maestra (o null si se canceló). */
export async function bioMaster(): Promise<string | null> {
  const rec = await idb.get<BioRecord>('vault', 'bio');
  if (!rec) return null;
  try {
    const prf = await getPrf(unb64(rec.credentialId), unb64(rec.prfSalt));
    const key = await keyFromPrf(prf);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(rec.iv) }, key, unb64(rec.data));
    return new TextDecoder().decode(plain);
  } catch (e) {
    if ((e as DOMException).name === 'NotAllowedError' || (e as DOMException).name === 'AbortError') return null;
    throw e;
  }
}

export async function disableBio() {
  await idb.delete('vault', 'bio');
}
