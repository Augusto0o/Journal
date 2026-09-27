import { useEffect, useState } from 'react';
import { todayISO } from '@/utils/date';
import { BottomSheet, Icon, useFeedback } from '@/components/ui';
import { analyzeVoice, type VoiceAnalysis } from '@/services/ai';
import { addTasks, newNote, newTask, saveNote, saveTask } from '@/services/actions';
import { escapeHtml } from '@/utils/html';

/**
 * Después de grabar: resumen, ideas, tareas, fechas, personas, lugares y decisiones.
 * Cada resultado se puede convertir en nota, tarea o recordatorio.
 */
export function VoiceAnalysisSheet({ open, onClose, transcript, sourceId, onInsert }: { open: boolean; onClose: () => void; transcript: string; sourceId: string | null; onInsert: (html: string) => void }) {
  const [res, setRes] = useState<VoiceAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useFeedback();

  useEffect(() => {
    if (!open || !transcript) return;
    setRes(null);
    setBusy(true);
    analyzeVoice(transcript)
      .then(setRes)
      .catch((e) => toast((e as Error).message, { tone: 'error' }))
      .finally(() => setBusy(false));
  }, [open, transcript, toast]);

  const asNote = async (title: string, text: string) => {
    const n = newNote('note');
    n.title = title;
    n.content = `<p>${escapeHtml(text)}</p>`;
    if (sourceId) n.linkedIds = [sourceId];
    await saveNote(n);
    toast('Nota creada');
  };
  const asReminder = async (text: string) => {
    await saveTask(newTask({ title: text, dueDate: todayISO(), dueTime: `${String((new Date().getHours() + 1) % 24).padStart(2, '0')}:00`, alarm: true }));
    toast('Recordatorio creado para dentro de una hora. Podés ajustarlo en Recordatorios.');
  };

  const Section = ({ title, items }: { title: string; items: string[] }) =>
    items.length ? (
      <section className="va-section">
        <p className="field-label">{title}</p>
        <ul>
          {items.map((it, i) => (
            <li key={i}>
              <span className="grow">{it}</span>
              <button type="button" className="icon-btn" aria-label="Guardar como nota" onClick={() => void asNote(title, it)}><Icon name="file" size={17} /></button>
              <button type="button" className="icon-btn" aria-label="Crear recordatorio" onClick={() => void asReminder(it)}><Icon name="bell" size={17} /></button>
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  return (
    <BottomSheet open={open} onClose={onClose} title="Lo que dijiste" description="Resumen e información importante de la grabación.">
      {busy || !res ? (
        <div className="pdf-loading"><span className="spinner" /></div>
      ) : (
        <div className="stack-lg">
          {res.summary && (
            <section className="va-section">
              <p className="field-label">Resumen</p>
              <p className="model-text">{res.summary}</p>
              <div className="hstack">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => { onInsert(`<h2>Resumen</h2><p>${escapeHtml(res.summary)}</p>`); onClose(); }}>Insertar en el texto</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => void asNote('Resumen de audio', res.summary)}>Guardar como nota</button>
              </div>
            </section>
          )}
          {res.tasks.length > 0 && (
            <section className="va-section">
              <p className="field-label">Tareas</p>
              <ul>{res.tasks.map((t, i) => <li key={i}><span className="grow">{t.title}{t.dueDate ? ` · ${t.dueDate}` : ''}{t.dueTime ? ` ${t.dueTime}` : ''}</span></li>)}</ul>
              <button type="button" className="btn btn-primary btn-sm" onClick={async () => { await addTasks(res.tasks, sourceId); toast(`${res.tasks.length} tareas creadas`); }}>Crear {res.tasks.length} tareas</button>
            </section>
          )}
          <Section title="Ideas clave" items={res.ideas} />
          <Section title="Decisiones" items={res.decisions} />
          <Section title="Fechas" items={res.dates} />
          <Section title="Personas" items={res.people} />
          <Section title="Lugares" items={res.places} />
        </div>
      )}
    </BottomSheet>
  );
}
