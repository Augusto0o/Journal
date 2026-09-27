import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

/**
 * Guarda automáticamente tras `delay` ms sin cambios.
 * `flush()` fuerza el guardado inmediato (botón Guardar, salir, Ctrl+S).
 */
export function useAutosave<T>(save: (value: T) => Promise<void>, delay = 1000) {
  const [state, setState] = useState<SaveState>('idle');
  const pending = useRef<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<Promise<void> | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  const run = useCallback(async (): Promise<void> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (inflight.current) {
      await inflight.current;
    }
    if (pending.current === null) return;
    const value = pending.current;
    pending.current = null;
    setState('saving');
    const p = saveRef
      .current(value)
      .then(() => {
        setState(pending.current === null ? 'saved' : 'dirty');
      })
      .catch((err) => {
        console.error(err);
        // Reintenta con el próximo cambio o flush.
        if (pending.current === null) pending.current = value;
        setState('error');
      })
      .finally(() => {
        inflight.current = null;
      });
    inflight.current = p;
    await p;
  }, []);

  const schedule = useCallback(
    (value: T) => {
      pending.current = value;
      setState('dirty');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void run(), delay);
    },
    [delay, run],
  );

  const flush = useCallback(async () => {
    await run();
    if (pending.current !== null) await run();
  }, [run]);

  // Guardar al ocultar la app (cambio de app en el celular) y al desmontar.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void run();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      void run();
    };
  }, [run]);

  return { state, schedule, flush, hasPending: () => pending.current !== null || !!inflight.current };
}
