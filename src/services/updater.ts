/**
 * Actualización sin reinstalar: iOS deja la app «dormida» con la versión vieja en memoria.
 * Cada vez que la app vuelve al frente (y cada 15 min) se fija si hay una versión nueva publicada;
 * si la hay, recarga sola — salvo que estés escribiendo: ahí avisa y recargás cuando quieras.
 */
const currentBundle = () => (document.querySelector('script[type="module"][src*="/assets/index-"]') as HTMLScriptElement | null)?.getAttribute('src') ?? null;

async function publishedBundle(): Promise<string | null> {
  try {
    const html = await fetch(`/?v=${Date.now()}`, { cache: 'no-store' }).then((r) => (r.ok ? r.text() : ''));
    return html.match(/\/assets\/index-[\w-]+\.js/)?.[0] ?? null;
  } catch {
    return null; // sin conexión
  }
}

const editing = () => {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) || /^\/(journal\/[^/]+$|biblioteca\/nota\/[^/]+$|mapas\/)/.test(location.pathname);
};

let announced = false;
function apply() {
  if (!editing()) {
    location.reload();
    return;
  }
  if (announced) return;
  announced = true;
  window.dispatchEvent(new CustomEvent('pos-update-ready'));
}

let lastCheck = 0;
async function check(reg?: ServiceWorkerRegistration) {
  if (Date.now() - lastCheck < 20_000) return;
  lastCheck = Date.now();
  void reg?.update().catch(() => undefined);
  const now = currentBundle();
  const pub = await publishedBundle();
  if (now && pub && now !== pub) apply();
}

export function startUpdater() {
  if (!('serviceWorker' in navigator)) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    apply();
  });
  window.addEventListener('load', async () => {
    const reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch((err) => {
      console.warn('SW no registrado', err);
      return undefined;
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void check(reg);
    });
    window.addEventListener('focus', () => void check(reg));
    setInterval(() => void check(reg), 15 * 60_000);
  });
}
