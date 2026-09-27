import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomSheet, Icon, useFeedback, type IconName } from '@/components/ui';
import { useCapture } from './CaptureSheet';
import { newMap, saveMap } from '@/services/maps';
import { createMapFromText } from '@/services/visual';
import { importPdf } from '@/services/pdf';

interface NewMenuCtx {
  /** Abre el menú «Nuevo». Si viene de una carpeta, las notas se crean ahí. */
  open: (folderId?: string | null) => void;
}

const Ctx = createContext<NewMenuCtx>({ open: () => undefined });
export const useNewMenu = () => useContext(Ctx);

/**
 * Menú «Nuevo» compartido: el + azul del dock y el + de Cuaderno abren lo mismo.
 * Anotar rápido, tarea, journal de hoy, nota, idea, enlace, mapa, mapa de un texto y PDF.
 */
export function NewMenuProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const capture = useCapture();
  const { toast } = useFeedback();
  const [sheet, setSheet] = useState<null | 'new' | 'maptext'>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const open = (folderId: string | null = null) => {
    setFolder(folderId);
    setSheet('new');
  };
  const go = (to: string) => {
    setSheet(null);
    navigate(to);
  };
  const noteUrl = (tipo: string) => `/biblioteca/nota/nueva?tipo=${tipo}${folder ? `&carpeta=${folder}` : ''}`;

  const tiles: [IconName, string, () => void][] = [
    ['bolt', 'Anotar rápido', () => { setSheet(null); capture.open('auto'); }],
    ['check', 'Tarea', () => { setSheet(null); capture.open('task'); }],
    ['journal', 'Journal de hoy', () => go('/journal/hoy')],
    ['file', 'Nota', () => go(noteUrl('note'))],
    ['idea', 'Idea', () => go(noteUrl('idea'))],
    ['link', 'Enlace', () => go(noteUrl('link'))],
    ['mindmap', 'Mapa', async () => { const m = newMap('mind', 'Idea central'); await saveMap(m); go(`/mapas/${m.id}`); }],
    ['wand', 'Mapa de un texto', () => setSheet('maptext')],
    ['pdf', 'PDF', () => { setSheet(null); file.current?.click(); }],
  ];

  return (
    <Ctx.Provider value={{ open }}>
      {children}
      {progress !== null && (
        <div className="import-progress is-floating"><span>Leyendo el PDF… {Math.round(progress * 100)}%</span><i style={{ transform: `scaleX(${progress})` }} /></div>
      )}
      <BottomSheet open={sheet === 'new'} onClose={() => setSheet(null)} title="Nuevo" hideTitle initialFocus="none">
        <div className="new-grid">
          {tiles.map(([icon, label, fn]) => (
            <button key={label} type="button" className="new-tile" onClick={fn}>
              <span className="new-tile-icon"><Icon name={icon} size={22} /></span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === 'maptext'} onClose={() => setSheet(null)} title="Mapa de un texto" description="Pegá apuntes o un proceso: se arma el mapa con el formato que mejor le quede.">
        <div className="stack">
          <textarea className="textarea" rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder="Pegá un texto, apuntes de clase, un proceso…" data-autofocus />
          <button type="button" className="btn btn-primary" disabled={text.trim().length < 20 || busy} onClick={async () => {
            setBusy(true);
            try {
              const { map } = await createMapFromText(text, 'auto');
              setText('');
              go(`/mapas/${map.id}`);
            } catch (err) {
              toast((err as Error).message, { tone: 'error' });
            } finally {
              setBusy(false);
            }
          }}>{busy ? <span className="spinner" /> : null} Crear mapa</button>
        </div>
      </BottomSheet>

      <input
        ref={file}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setProgress(0);
          try {
            const d = await importPdf(f, setProgress);
            navigate(`/pdf/${d.id}`);
          } catch (err) {
            console.error(err);
            toast('No se pudo leer el PDF.', { tone: 'error' });
          } finally {
            setProgress(null);
          }
        }}
      />
    </Ctx.Provider>
  );
}
