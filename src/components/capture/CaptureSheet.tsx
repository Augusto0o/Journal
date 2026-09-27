import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomSheet, Icon, useFeedback } from '@/components/ui';
import { Waveform } from '@/components/ui/Waveform';
import { classifyCapture, parseTask, type CaptureType } from '@shared/parser.ts';
import { saveCapture } from '@/services/actions';
import { parseCtx } from '@/services/queries';
import { aiAvailable, aiProblem, classify, transcribe } from '@/services/ai';
import { VoiceRecorder } from '@/services/recorder';
import { sendReminderToIOS } from '@/services/shortcuts';
import { store } from '@/database/store';
import { formatRelativeDay } from '@/utils/date';
import { cx, haptic, resizeImage } from '@/utils/misc';

const TYPES: { id: CaptureType | 'auto'; label: string }[] = [
  { id: 'auto', label: 'Automático' },
  { id: 'note', label: 'Nota' },
  { id: 'task', label: 'Tarea' },
  { id: 'reminder', label: 'Tarea con alarma' },
  { id: 'idea', label: 'Idea' },
  { id: 'journal', label: 'Journal' },
  { id: 'link', label: 'Enlace' },
];

const TYPE_NAME: Record<CaptureType, string> = {
  note: 'nota',
  task: 'tarea',
  reminder: 'tarea con alarma',
  idea: 'idea',
  journal: 'entrada de hoy',
  link: 'enlace',
};

const ROUTE: Record<string, (id: string) => string> = {
  task: () => '/',
  journal: (id) => `/journal/${id}`,
  note: (id) => `/biblioteca/nota/${id}`,
  media: () => '/biblioteca',
};

interface CaptureCtx {
  open: (type?: CaptureType | 'auto', text?: string) => void;
}

const Ctx = createContext<CaptureCtx>({ open: () => undefined });
export const useCapture = () => useContext(Ctx);

export function CaptureProvider({ children }: { children: (open: () => void) => ReactNode }) {
  const [state, setState] = useState<{ open: boolean; type: CaptureType | 'auto'; text: string; key: number }>({ open: false, type: 'auto', text: '', key: 0 });
  const open = (type: CaptureType | 'auto' = 'auto', text = '') => setState((s) => ({ open: true, type, text, key: s.key + 1 }));
  return (
    <Ctx.Provider value={{ open }}>
      {children(() => open())}
      <BottomSheet open={state.open} onClose={() => setState((s) => ({ ...s, open: false }))} title="Captura rápida" hideTitle initialFocus="none">
        <CaptureForm key={state.key} initialType={state.type} initialText={state.text} onDone={() => setState((s) => ({ ...s, open: false }))} />
      </BottomSheet>
    </Ctx.Provider>
  );
}

function CaptureForm({ initialType, initialText, onDone }: { initialType: CaptureType | 'auto'; initialText: string; onDone: () => void }) {
  const [text, setText] = useState(initialText);
  const [type, setType] = useState<CaptureType | 'auto'>(initialType);
  const [image, setImage] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState<null | 'save' | 'ai' | 'voice'>(null);
  const [aiGuess, setAiGuess] = useState<{ type: CaptureType; category: string | null; title: string | null } | null>(null);
  const [rec, setRec] = useState<VoiceRecorder | null>(null);
  const [levels, setLevels] = useState<number[]>(() => Array(40).fill(0.1));
  const [secs, setSecs] = useState(0);
  const ta = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const { toast } = useFeedback();
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => ta.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!rec) return;
    let raf = 0;
    const tick = () => {
      const l = rec.level();
      setLevels((prev) => [...prev.slice(1), 0.12 + l * (0.7 + Math.random() * 0.3)]);
      setSecs(Math.floor((Date.now() - rec.startedAt) / 1000));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [rec]);

  useEffect(() => () => rec?.cancel(), [rec]);

  const guess = useMemo(() => (text.trim() ? classifyCapture(text, parseCtx()) : null), [text]);
  const finalType: CaptureType = type === 'auto' ? aiGuess?.type ?? guess?.type ?? 'note' : type;

  const preview = useMemo(() => {
    if (!text.trim()) return null;
    const bits: string[] = [`Se guarda como ${TYPE_NAME[finalType]}`];
    if (finalType === 'task' || finalType === 'reminder') {
      const cleaned = text.replace(/^(recordame|recuerdame|recordarme|avisame)\s+(que\s+)?/i, '');
      const p = parseTask(cleaned, parseCtx());
      if (p.dueDate) bits.push(formatRelativeDay(p.dueDate).toLowerCase());
      if (p.dueTime) bits.push(p.dueTime);
      if (p.priority) bits.push(['', 'prioridad baja', 'prioridad media', 'prioridad alta'][p.priority]);
    }
    const cat = aiGuess?.category ?? guess?.category;
    if (cat) bits.push(`#${cat}`);
    return bits.join(' · ');
  }, [text, guess, aiGuess, finalType]);

  const save = async () => {
    if (!text.trim() && !image) return;
    setBusy('save');
    try {
      const res = await saveCapture({
        text,
        type: finalType,
        category: aiGuess?.category ?? guess?.category ?? null,
        title: aiGuess?.title ?? null,
        imageDataUrl: image,
      });
      haptic();
      onDone();
      const t = res.kind === 'task' ? store.get('task', res.id) : null;
      const media = res.kind === 'media' ? store.get('media', res.id) : null;
      const where = res.kind === 'task' ? 'Hoy' : res.kind === 'journal' ? 'el journal de hoy' : media ? `Biblioteca · ${media.mediaType === 'music' ? 'Para escuchar' : 'Para ver'}` : 'el Cuaderno';
      if (t?.alarm && t.dueDate && t.dueTime) {
        toast(`Alarma ${formatRelativeDay(t.dueDate).toLowerCase()} a las ${t.dueTime}`, {
          action: { label: 'Agendar en iOS', onClick: () => sendReminderToIOS(t.title, t.dueDate!, t.dueTime!) },
          duration: 6000,
        });
      } else {
        toast(`Guardado en ${where}`, { action: { label: 'Ver', onClick: () => navigate(ROUTE[res.kind]?.(res.id) ?? '/') } });
      }
    } catch (e) {
      toast((e as Error).message || 'No se pudo guardar', { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const askAI = async () => {
    if (!text.trim()) return;
    setBusy('ai');
    try {
      const g = await classify(text);
      setAiGuess(g);
      setType('auto');
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const toggleVoice = async () => {
    if (rec) {
      const r = rec;
      setRec(null);
      setBusy('voice');
      try {
        const blob = await r.stop();
        const words = await transcribe(blob);
        if (words) setText((t) => (t.trim() ? `${t.trim()} ${words}` : words));
        else toast('No se entendió el audio', { tone: 'error' });
      } catch (e) {
        toast((e as Error).message, { tone: 'error' });
      } finally {
        setBusy(null);
      }
      return;
    }
    if (!aiAvailable()) {
      toast(aiProblem() ?? 'Usá el micrófono del teclado para dictar.', { duration: 4200 });
      ta.current?.focus();
      return;
    }
    if (!VoiceRecorder.supported()) {
      toast('Este navegador no permite grabar audio. Usá el dictado del teclado.');
      return;
    }
    try {
      const r = new VoiceRecorder();
      await r.start();
      haptic(12);
      setRec(r);
    } catch {
      toast('Sin permiso para usar el micrófono.', { tone: 'error' });
    }
  };

  return (
    <div className="capture">
      <textarea
        ref={ta}
        className="capture-input"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (aiGuess) setAiGuess(null);
        }}
        placeholder={'¿Qué tenés en mente?\nProbá: "llamar al contador mañana a las 15 !alta #trabajo"'}
        rows={4}
        enterKeyHint="done"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save();
        }}
      />

      {image && (
        <div className="capture-image">
          <img src={image} alt="Imagen adjunta" />
          <button type="button" className="icon-btn" aria-label="Quitar imagen" onClick={() => setImage(null)}>
            <Icon name="x" size={18} />
          </button>
        </div>
      )}

      {rec && (
        <div className="capture-rec" aria-live="polite">
          <span className="rec-dot" />
          <span className="num">{`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`}</span>
          <Waveform levels={levels} className="is-live" />
          <span className="faint small">Tocá el micrófono para terminar</span>
        </div>
      )}

      <div className="capture-meta">
        <p className={cx('capture-preview', !preview && 'is-empty')}>{preview ?? 'Escribí, dictá o adjuntá una foto. Se ordena solo.'}</p>
        {text.trim() && (
          <button type="button" className="type-toggle" onClick={() => setPicking((v) => !v)} aria-expanded={picking}>
            Cambiar <Icon name="chevronDown" size={14} />
          </button>
        )}
      </div>
      {picking && (
        <div className="type-picker" role="radiogroup" aria-label="Guardar como">
          {TYPES.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={type === t.id} onClick={() => { setType(t.id); if (t.id !== 'auto') setAiGuess(null); setPicking(false); }}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="capture-bar">
        <button type="button" className={cx('icon-btn', rec && 'is-recording')} aria-label={rec ? 'Terminar grabación' : 'Dictar'} onClick={() => void toggleVoice()} disabled={busy === 'voice'}>
          {busy === 'voice' ? <span className="spinner" /> : <Icon name={rec ? 'stop' : 'mic'} size={22} />}
        </button>
        <button type="button" className="icon-btn" aria-label="Adjuntar foto" onClick={() => file.current?.click()}>
          <Icon name="image" size={22} />
        </button>
        <button type="button" className="icon-btn" aria-label="Clasificar con IA" onClick={() => void askAI()} disabled={!text.trim() || busy === 'ai'}>
          {busy === 'ai' ? <span className="spinner" /> : <Icon name="sparkle" size={22} />}
        </button>
        <span className="grow" />
        <button type="button" className="btn btn-primary" disabled={(!text.trim() && !image) || busy === 'save' || !!rec} onClick={() => void save()}>
          Guardar
        </button>
      </div>
      <input
        ref={file}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) setImage(await resizeImage(f, 1400, 0.8));
        }}
      />
    </div>
  );
}
