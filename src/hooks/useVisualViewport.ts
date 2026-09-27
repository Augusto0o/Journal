import { useEffect } from 'react';

/**
 * Publica el viewport visual como variables CSS para que las pantallas
 * a pantalla completa (editor, búsqueda) se ajusten al teclado virtual:
 *   --vvh   alto visible
 *   --vvtop desplazamiento superior del viewport visual
 *   --kb    alto estimado del teclado
 * y añade la clase .kb-open a <html> cuando el teclado está abierto.
 */
export function useVisualViewport() {
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    let raf = 0;

    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const h = vv ? vv.height : window.innerHeight;
        const top = vv ? vv.offsetTop : 0;
        const kb = Math.max(0, window.innerHeight - h - top);
        root.style.setProperty('--vvh', `${h}px`);
        root.style.setProperty('--vvtop', `${top}px`);
        root.style.setProperty('--kb', `${kb}px`);
        // En Android (resizes-content) innerHeight también baja: comparamos contra el alto de pantalla.
        const shrunk = window.screen.height - h > 260 && matchMedia('(pointer: coarse)').matches;
        root.classList.toggle('kb-open', kb > 120 || (shrunk && isEditing()));
      });
    };

    const isEditing = () => {
      const a = document.activeElement as HTMLElement | null;
      return !!a && (a.isContentEditable || a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
    };

    update();
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      cancelAnimationFrame(raf);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
    };
  }, []);
}
