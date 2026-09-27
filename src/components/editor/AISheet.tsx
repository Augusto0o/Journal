import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BottomSheet, Check, Icon, useFeedback } from '@/components/ui';
import { aiProblem, extractTasks, REPLACES, TEXT_ACTIONS, transform, type AITask, type TextAction } from '@/services/ai';
import { addTasks } from '@/services/actions';
import { createMapFromText } from '@/services/visual';
import { MAP_TYPES } from '@/services/maps';
import type { MapType } from '@/types';
import { markdownToHtml } from '@/utils/html';
import { formatRelativeDay } from '@/utils/date';

interface Props {
  open: boolean;
  onClose: () => void;
  source: { text: string; selection: boolean };
  sourceId: string | null;
  onReplace: (html: string, selection: boolean) => void;
  onAppend: (html: string) => void;
}

/** Menú de IA del editor: transforma el texto elegido o todo el documento. */
export function AISheet({ open, onClose, source, sourceId, onReplace, onAppend }: Props) {
  const [busy, setBusy] = useState<TextAction | 'tasks' | null>(null);
  const [result, setResult] = useState<{ action: TextAction; text: string } | null>(null);
  const [tasks, setTasks] = useState<(AITask & { keep: boolean })[] | null>(null);
  const { toast } = useFeedback();
  const navigate = useNavigate();
  const [compare, setCompare] = useState(false);
  const problem = aiProblem();

  const toMap = async (t: MapType | 'auto') => {
    setBusy('tasks');
    try {
      const { map, usedAI } = await createMapFromText(source.text, t, { sourceId });
      if (!usedAI) toast('Mapa armado con la estructura del texto (sin IA).');
      onClose();
      navigate(`/mapas/${map.id}`);
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (open) {
      setResult(null);
      setTasks(null);
      setCompare(false);
    }
  }, [open]);

  const run = async (a: TextAction) => {
    setBusy(a);
    try {
      setResult({ action: a, text: await transform(a, source.text) });
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const findTasks = async () => {
    setBusy('tasks');
    try {
      const list = await extractTasks(source.text);
      if (!list.length) toast('No encontré tareas en el texto.');
      else setTasks(list.map((t) => ({ ...t, keep: true })));
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const label = TEXT_ACTIONS.find((a) => a.id === result?.action)?.label;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={result ? label : tasks ? 'Tareas encontradas' : 'IA'}
      description={!result && !tasks ? (source.selection ? 'Sobre el texto seleccionado.' : 'Sobre toda la entrada.') : undefined}
      initialFocus="none"
    >
      {problem ? (
        <div className="stack">
          <p className="muted">{problem}</p>
          <Link to="/ajustes#ia" className="btn btn-tinted" onClick={onClose}>Configurar la IA</Link>
          {source.text.trim().length > 20 && (
            <>
              <p className="field-label mt-4">Sin IA también podés</p>
              <div className="group-body">
                {MAP_TYPES.map((t) => (
                  <button key={t.id} type="button" className="sheet-action" onClick={() => void toMap(t.id)}>
                    <span className="sheet-action-icon"><Icon name={t.icon} size={20} /></span>
                    <span className="sheet-action-label">{t.label}<span className="sheet-action-detail">A partir de títulos, listas y oraciones</span></span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      ) : !source.text.trim() ? (
        <p className="muted">Escribí algo primero.</p>
      ) : result ? (
        <div className="stack">
          <div className="compare-toggle">
            <button type="button" className="chip" aria-pressed={!compare} onClick={() => setCompare(false)}>Resultado</button>
            <button type="button" className="chip" aria-pressed={compare} onClick={() => setCompare(true)}>Comparar con el original</button>
          </div>
          {compare ? (
            <div className="compare">
              <div><p className="field-label">Original</p><div className="ai-result prose is-original">{source.text.split(/\n+/).map((p, i) => <p key={i}>{p}</p>)}</div></div>
              <div><p className="field-label">Nueva versión</p><div className="ai-result prose" dangerouslySetInnerHTML={{ __html: markdownToHtml(result.text) }} /></div>
            </div>
          ) : (
            <div className="ai-result prose" dangerouslySetInnerHTML={{ __html: markdownToHtml(result.text) }} />
          )}
          <div className="hstack">
            {REPLACES.includes(result.action) ? (
              <button type="button" className="btn btn-primary grow" onClick={() => { onReplace(markdownToHtml(result.text), source.selection); onClose(); }}>
                Reemplazar
              </button>
            ) : (
              <button type="button" className="btn btn-primary grow" onClick={() => { onAppend(`<h2>${label}</h2>` + markdownToHtml(result.text)); onClose(); }}>
                Agregar al final
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={() => { void navigator.clipboard?.writeText(result.text); toast('Copiado'); }}>
              Copiar
            </button>
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => setResult(null)}>Otra acción</button>
        </div>
      ) : tasks ? (
        <div className="stack">
          <div className="group-body">
            {tasks.map((t, i) => (
              <div key={i} className="row has-icon">
                <Check checked={t.keep} label={t.title} onChange={() => setTasks(tasks.map((x, j) => (j === i ? { ...x, keep: !x.keep } : x)))} />
                <span className="row-main">
                  <span className="row-label">{t.title}</span>
                  {(t.dueDate || t.dueTime) && <span className="row-sub">{[t.dueDate && formatRelativeDay(t.dueDate, 'short'), t.dueTime].filter(Boolean).join(', ')}</span>}
                </span>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!tasks.some((t) => t.keep)}
            onClick={async () => {
              const keep = tasks.filter((t) => t.keep);
              await addTasks(keep, sourceId);
              toast(`${keep.length} ${keep.length === 1 ? 'tarea creada' : 'tareas creadas'}`);
              onClose();
            }}
          >
            Crear {tasks.filter((t) => t.keep).length} en Tareas
          </button>
        </div>
      ) : (
        <div className="group-body">
          {TEXT_ACTIONS.map((a) => (
            <button key={a.id} type="button" className="sheet-action" onClick={() => void run(a.id)} disabled={!!busy}>
              <span className="sheet-action-label">
                {a.label}
                <span className="sheet-action-detail">{a.detail}</span>
              </span>
              {busy === a.id && <span className="spinner" />}
            </button>
          ))}
          <button type="button" className="sheet-action" onClick={() => void findTasks()} disabled={!!busy}>
            <span className="sheet-action-icon"><Icon name="tasks" size={20} /></span>
            <span className="sheet-action-label">
              Crear tareas
              <span className="sheet-action-detail">Convierte lo pendiente en tareas con fecha</span>
            </span>
            {busy === 'tasks' && <span className="spinner" />}
          </button>
          <p className="field-label" style={{ padding: '14px 16px 4px' }}>Transformar en</p>
          <button type="button" className="sheet-action" onClick={() => void toMap('auto')} disabled={!!busy}>
            <span className="sheet-action-icon"><Icon name="sparkle" size={20} /></span>
            <span className="sheet-action-label">Lo más adecuado<span className="sheet-action-detail">La IA elige mapa, concepto, sistema o flujo</span></span>
          </button>
          {MAP_TYPES.map((t) => (
            <button key={t.id} type="button" className="sheet-action" onClick={() => void toMap(t.id)} disabled={!!busy}>
              <span className="sheet-action-icon"><Icon name={t.icon} size={20} /></span>
              <span className="sheet-action-label">{t.label}<span className="sheet-action-detail">{t.detail}</span></span>
            </button>
          ))}
        </div>
      )}
    </BottomSheet>
  );
}
