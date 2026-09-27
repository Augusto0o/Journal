import { useEffect, useRef, useState } from 'react';
import { todayISO } from '@/utils/date';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Icon, IconButton, NavBar, useFeedback } from '@/components/ui';
import { useStore, useSettings } from '@/hooks/useData';
import { store } from '@/database/store';
import { aiProblem, assistant, transcribe, type AssistantAction } from '@/services/ai';
import { newNote, newTask, saveNote, saveTask } from '@/services/actions';
import { buildDocs, search } from '@/services/queries';
import { createMapFromText } from '@/services/visual';
import { QUOTES } from '@/services/quotes';
import { VoiceRecorder } from '@/services/recorder';
import { htmlToText, markdownToHtml } from '@/utils/html';
import { cx } from '@/utils/misc';

interface Msg { role: 'user' | 'assistant'; content: string; actions?: (AssistantAction & { done?: boolean })[] }

const PREF_CHAT = 'assistantChat';

const SUGGESTIONS = [
  'Buscá todo lo que escribí sobre el proyecto',
  'Resumí mis entradas de esta semana',
  'Convertí esto en tareas: mañana llamo al contador y el viernes pago la luz',
  'Recordame regar las plantas mañana a las 9',
  'Haceme un mapa mental sobre estoicismo',
  'Explicame qué es el interés compuesto como si fuera principiante',
];

export default function Assistant() {
  const snap = useStore();
  const [settings] = useSettings();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const [msgs, setMsgs] = useState<Msg[]>(() => (store.pref<Msg[]>(PREF_CHAT, []) ?? []).slice(-30));
  const [input, setInput] = useState(params.get('q') ?? '');
  const [busy, setBusy] = useState(false);
  const ctxId = params.get('ctx');
  const ctxRec = ctxId ? store.raw(ctxId) : undefined;
  const end = useRef<HTMLDivElement>(null);
  const problem = aiProblem();
  const [rec, setRec] = useState<VoiceRecorder | null>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    void store.setPref(PREF_CHAT, msgs.slice(-30));
  }, [msgs]);

  const contextFor = (q: string) => {
    if (ctxRec && (ctxRec.kind === 'journal' || ctxRec.kind === 'note')) return `Contenido seleccionado («${ctxRec.title ?? ''}»):\n${htmlToText(ctxRec.content)}`;
    if (ctxRec && ctxRec.kind === 'doc') return `PDF «${ctxRec.title}»:\n${ctxRec.text.slice(0, 30000)}`;
    const { hits } = search(q, buildDocs(snap, QUOTES, 'all'), settings.weekStartsOn);
    if (!hits.length) return '';
    return 'Resultados de búsqueda en el contenido del usuario:\n' + hits.slice(0, 8).map((h) => `- [${h.kind}] ${h.title} (${h.date ?? ''}): ${h.body.slice(0, 1200)}`).join('\n');
  };

  const send = async (text = input) => {
    const t = text.trim();
    if (!t || busy) return;
    const next: Msg[] = [...msgs, { role: 'user', content: t }];
    setMsgs(next);
    setInput('');
    setBusy(true);
    try {
      const r = await assistant(next.map((m) => ({ role: m.role, content: m.content })), contextFor(t));
      setMsgs((m) => [...m, { role: 'assistant', content: r.reply || 'Listo.', actions: r.actions }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'assistant', content: `No pude responder: ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  };

  // Viene de la barra «Buscar o preguntar»: enviar directo.
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current || params.get('send') !== '1' || !input.trim() || problem) return;
    sent.current = true;
    void send(input);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (mi: number, ai: number, a: AssistantAction) => {
    try {
      if (a.type === 'create_task') {
        const t = newTask({ title: a.title ?? 'Tarea', dueDate: a.date ?? null, dueTime: a.time ?? null, sourceId: ctxId });
        await saveTask(t);
        toast('Tarea creada', { action: { label: 'Ver', onClick: () => navigate('/') } });
      } else if (a.type === 'create_reminder') {
        const d = new Date(Date.now() + 3600_000);
        await saveTask(newTask({ title: a.title ?? 'Recordatorio', dueDate: a.date ?? todayISO(), dueTime: a.time ?? `${String(d.getHours()).padStart(2, '0')}:00`, alarm: true, sourceId: ctxId }));
        toast('Recordatorio creado', { action: { label: 'Ver', onClick: () => navigate('/') } });
      } else if (a.type === 'create_note') {
        const n = newNote('note');
        n.title = a.title ?? 'Nota del asistente';
        n.content = markdownToHtml(a.text ?? '');
        if (ctxId) n.linkedIds = [ctxId];
        await saveNote(n);
        toast('Nota creada', { action: { label: 'Ver', onClick: () => navigate(`/biblioteca/nota/${n.id}`) } });
      } else if (a.type === 'create_map') {
        const { map } = await createMapFromText(a.text || a.title || '', a.mapType ?? 'auto', { title: a.title, sourceId: ctxId });
        navigate(`/mapas/${map.id}`);
      } else if (a.type === 'search') {
        navigate(`/buscar?q=${encodeURIComponent(a.query ?? '')}`);
        return;
      }
      setMsgs((m) => m.map((x, i) => (i === mi ? { ...x, actions: x.actions?.map((y, j) => (j === ai ? { ...y, done: true } : y)) } : x)));
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  };

  const label = (a: AssistantAction) =>
    a.type === 'create_task' ? `Crear tarea: ${a.title}${a.date ? ` (${a.date}${a.time ? ` ${a.time}` : ''})` : ''}`
      : a.type === 'create_reminder' ? `Recordatorio: ${a.title} · ${a.date ?? ''} ${a.time ?? ''}`
        : a.type === 'create_note' ? `Guardar como nota: ${a.title}`
          : a.type === 'create_map' ? `Crear ${a.mapType === 'flow' ? 'flujo' : a.mapType === 'system' ? 'diagrama' : a.mapType === 'concept' ? 'mapa conceptual' : 'mapa mental'}: ${a.title ?? ''}`
            : a.type === 'search' ? `Buscar «${a.query}»` : 'Abrir';

  const voice = async () => {
    if (rec) {
      const r = rec;
      setRec(null);
      try {
        const t = await transcribe(await r.stop());
        if (t) void send(t);
      } catch (e) {
        toast((e as Error).message, { tone: 'error' });
      }
      return;
    }
    try {
      const r = new VoiceRecorder();
      await r.start();
      setRec(r);
    } catch {
      toast('Sin permiso para el micrófono.', { tone: 'error' });
    }
  };

  return (
    <main className="chat-page">
      <NavBar back="/buscar" backLabel="Buscar" title="Asistente" end={msgs.length ? <IconButton icon="refresh" label="Nueva conversación" onClick={() => setMsgs([])} /> : undefined} />
      <div className="chat-scroll">
        {ctxRec && <p className="chat-context"><Icon name="file" size={14} /> Sobre: {('title' in ctxRec && ctxRec.title) || 'contenido seleccionado'}</p>}
        {problem ? (
          <p className="home-quiet mt-6">{problem}</p>
        ) : !msgs.length ? (
          <div className="chat-empty">
            <h1 className="chat-hello">¿En qué te ayudo?</h1>
            <p className="muted">Puedo buscar en todo lo tuyo, resumir, explicar, corregir, traducir, organizar ideas, armar tablas y mapas, y crear tareas o recordatorios.</p>
            <ol className="suggestions">
              {SUGGESTIONS.map((s, i) => (
                <li key={s}><button type="button" onClick={() => void send(s)}><span className="step-num">{i + 1}</span><span className="grow">{s}</span><Icon name="arrowRight" size={18} strokeWidth={1.4} className="arrow" /></button></li>
              ))}
            </ol>
          </div>
        ) : (
          <div className="chat-list">
            {msgs.map((m, i) => (
              <div key={i} className={cx('bubble', m.role === 'user' ? 'is-user' : 'is-ai')}>
                {m.role === 'assistant' ? <div className="prose" dangerouslySetInnerHTML={{ __html: markdownToHtml(m.content) }} /> : <p>{m.content}</p>}
                {m.actions?.length ? (
                  <div className="bubble-actions">
                    {m.actions.map((a, j) => (
                      <button key={j} type="button" className={cx('chip', a.done && 'is-done')} aria-pressed={!!a.done} disabled={a.done} onClick={() => void run(i, j, a)}>
                        {a.done ? <Icon name="check" size={14} /> : <Icon name="plus" size={14} />} {label(a)}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {busy && <div className="bubble is-ai"><span className="typing"><i /><i /><i /></span></div>}
            <div ref={end} />
          </div>
        )}
      </div>
      <form className="chat-bar" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <button type="button" className={cx('icon-btn', rec && 'is-recording')} aria-label={rec ? 'Terminar' : 'Dictar'} onClick={() => void voice()} disabled={!!problem}>
          <Icon name={rec ? 'stop' : 'mic'} size={20} />
        </button>
        <input className="chat-input-field" value={input} onChange={(e) => setInput(e.target.value)} placeholder={rec ? 'Escuchando…' : 'Escribí o pedí algo'} disabled={!!problem} enterKeyHint="send" />
        <button type="submit" className="send-btn" aria-label="Enviar" disabled={!input.trim() || busy || !!problem}><Icon name="arrowRight" size={20} /></button>
      </form>
    </main>
  );
}
