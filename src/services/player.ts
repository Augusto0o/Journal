/**
 * Un solo audio a la vez en toda la app: al reproducir algo nuevo se pausa lo anterior
 * (vistas previas de canciones, reproductores <audio> y lectura en voz alta).
 */
type Stop = () => void;
let current: { el: HTMLMediaElement; stop: Stop } | null = null;

export function claimPlayback(el: HTMLMediaElement, stop: Stop = () => el.pause()) {
  if (current && current.el !== el) current.stop();
  current = { el, stop };
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* no-op */
  }
}

export function releasePlayback(el: HTMLMediaElement) {
  if (current?.el === el) current = null;
}

/** Borra «Está sonando» del iPhone (pantalla bloqueada y Centro de control). */
function clearNowPlaying() {
  try {
    const ms = navigator.mediaSession;
    if (!ms) return;
    ms.metadata = null;
    ms.playbackState = 'none';
    for (const a of ['play', 'pause', 'seekbackward', 'seekforward', 'previoustrack', 'nexttrack', 'stop'] as MediaSessionAction[]) {
      try {
        ms.setActionHandler(a, null);
      } catch {
        /* acción no soportada */
      }
    }
  } catch {
    /* no-op */
  }
}

const resetting = new WeakSet<HTMLMediaElement>();

/**
 * iOS deja el reproductor del sistema mientras el audio siga cargado, aunque esté en pausa.
 * Al pausar o terminar, se descarga el audio (así desaparece) y se vuelve a preparar
 * en la misma posición, para que «reproducir» siga funcionando.
 */
export function releaseMedia(el: HTMLMediaElement) {
  if (resetting.has(el)) return;
  const src = el.currentSrc || el.getAttribute('src') || '';
  if (!src) return;
  const t = el.ended ? 0 : el.currentTime;
  resetting.add(el);
  el.pause();
  el.removeAttribute('src');
  el.load();
  clearNowPlaying();
  releasePlayback(el);
  el.src = src;
  if (t > 0) {
    el.preload = 'metadata';
    el.addEventListener('loadedmetadata', () => {
      el.currentTime = t;
    }, { once: true });
  }
  setTimeout(() => resetting.delete(el), 0);
}

export function isReleasing(el: HTMLMediaElement) {
  return resetting.has(el);
}

// Cualquier <audio>/<video> del documento que empiece a sonar también pausa al resto,
// y al pausarse o terminar deja de ocupar el reproductor del iPhone.
if (typeof document !== 'undefined') {
  document.addEventListener('play', (e) => {
    const el = e.target as HTMLMediaElement;
    if (el instanceof HTMLMediaElement) claimPlayback(el);
  }, true);
  for (const type of ['pause', 'ended']) {
    document.addEventListener(type, (e) => {
      const el = e.target as HTMLMediaElement;
      // Esperar un instante: si es un salto (seek) o se reanuda enseguida, no hay que descargar.
      if (el instanceof HTMLMediaElement && !resetting.has(el)) setTimeout(() => { if (el.paused && !el.seeking) releaseMedia(el); }, type === 'ended' ? 0 : 600);
    }, true);
  }
  // Al salir de la app o cerrar una pantalla, que no quede nada colgado.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && (!current || current.el.paused)) clearNowPlaying();
  });
}
