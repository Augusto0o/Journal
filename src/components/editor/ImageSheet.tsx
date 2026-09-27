import { useRef, useState } from 'react';
import { BottomSheet, Icon, useFeedback } from '@/components/ui';
import { aiProblem, analyzeImage } from '@/services/ai';
import { escapeHtml, markdownToHtml } from '@/utils/html';
import { resizeImage } from '@/utils/misc';

type Mode = 'insert' | 'camera' | 'scan' | 'draw' | 'analyze';

/** Mejora simple para documentos escaneados: escala de grises y más contraste. */
async function enhanceScan(dataUrl: string): Promise<string> {
  const img = new Image();
  await new Promise((r) => { img.onload = r; img.src = dataUrl; });
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  const px = d.data;
  // Umbral suave con estiramiento de contraste.
  let min = 255, max = 0;
  for (let i = 0; i < px.length; i += 16) {
    const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = Math.max(40, max - min);
  for (let i = 0; i < px.length; i += 4) {
    let g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    g = ((g - min) / range) * 255;
    g = g > 200 ? 255 : g < 70 ? g * 0.6 : g;
    px[i] = px[i + 1] = px[i + 2] = Math.max(0, Math.min(255, g));
  }
  ctx.putImageData(d, 0, 0);
  return c.toDataURL('image/jpeg', 0.85);
}

export function ImageSheet({ open, onClose, onInsert, onDrawOn }: { open: boolean; onClose: () => void; onInsert: (src: string, html?: string) => void; onDrawOn: (src: string) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const cam = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>('insert');
  const [busy, setBusy] = useState(false);
  const { toast } = useFeedback();

  const pick = (m: Mode) => {
    setMode(m);
    if (m === 'camera' || m === 'scan') cam.current?.click();
    else file.current?.click();
  };

  const handle = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      let src = await resizeImage(f, mode === 'scan' ? 1800 : 1400, 0.82);
      if (mode === 'scan') src = await enhanceScan(src);
      if (mode === 'draw') {
        onClose();
        onDrawOn(src);
      } else if (mode === 'analyze') {
        const text = await analyzeImage(src, 'Describí la imagen y transcribí el texto que tenga.');
        onInsert(src, markdownToHtml(text) || `<p>${escapeHtml(text)}</p>`);
        onClose();
      } else {
        onInsert(src);
        onClose();
      }
    } catch (e) {
      toast((e as Error).message || 'No se pudo cargar la imagen', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const Item = ({ m, icon, label, detail, disabled }: { m: Mode; icon: 'image' | 'camera' | 'scan' | 'draw' | 'sparkle'; label: string; detail: string; disabled?: boolean }) => (
    <button type="button" className="sheet-action" onClick={() => pick(m)} disabled={busy || disabled}>
      <span className="sheet-action-icon"><Icon name={icon} size={20} /></span>
      <span className="sheet-action-label">{label}<span className="sheet-action-detail">{detail}</span></span>
      {busy && mode === m && <span className="spinner" />}
    </button>
  );

  return (
    <BottomSheet open={open} onClose={onClose} title="Imagen" initialFocus="none">
      <div className="group-body">
        <Item m="insert" icon="image" label="Fotos o archivos" detail="Elegí una imagen" />
        <Item m="camera" icon="camera" label="Cámara" detail="Sacar una foto ahora" />
        <Item m="scan" icon="scan" label="Escanear documento" detail="Foto con más contraste, lista para leer" />
        <Item m="draw" icon="draw" label="Dibujar sobre una foto" detail="Marcar, subrayar o anotar" />
        <Item m="analyze" icon="sparkle" label="Analizar con IA" detail={aiProblem() ?? 'Describe la imagen y transcribe su texto'} disabled={!!aiProblem()} />
      </div>
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { void handle(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void handle(e.target.files?.[0]); e.target.value = ''; }} />
    </BottomSheet>
  );
}
