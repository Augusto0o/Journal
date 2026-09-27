import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon, NavBar, Segmented, useFeedback } from '@/components/ui';
import { MicButton, SpeakButton, captureMode, useSpeechCapture } from '@/components/english/speech';
import { useEnglishSettings, useStore, useToday } from '@/hooks/useData';
import { aiProblem, correctEnglish, dayInEnglish, speakingFeedback, type DayInEnglish, type EnglishCorrection, type SpeakingFeedback } from '@/services/ai';
import { addCard, logSession } from '@/services/english';
import { newEntry, saveEntry } from '@/services/actions';
import { sortEntries } from '@/services/queries';
import { formatRelativeDay } from '@/utils/date';
import { escapeHtml, htmlToText } from '@/utils/html';
import { cx } from '@/utils/misc';

const TYPE_LABEL: Record<string, string> = { grammar: 'Gramática', vocabulary: 'Vocabulario', spelling: 'Ortografía', naturalness: 'Naturalidad' };

export default function JournalPractice() {
  const [params, setParams] = useSearchParams();
  const mode = params.get('modo') === 'escribir' ? 'write' : 'speak';
  const problem = aiProblem();
  return (
    <main className="page">
      <NavBar back="/ingles" backLabel="Inglés" title={mode === 'write' ? 'Write in English' : 'Practice your day'} />
      <div className="mt-4">
        <Segmented
          label="Modo"
          value={mode}
          onChange={(m) => setParams(m === 'write' ? { modo: 'escribir' } : params.get('entrada') ? { entrada: params.get('entrada')! } : {}, { replace: true })}
          options={[{ value: 'speak', label: 'Contar mi día' }, { value: 'write', label: 'Escribir' }]}
        />
      </div>
      {problem ? (
        <div className="stack mt-6">
          <p className="muted">Esta práctica usa la IA para adaptar tu día a tu nivel y corregirte. {problem}</p>
          <Link to="/ajustes#ia" className="btn btn-tinted">Configurar la IA</Link>
        </div>
      ) : mode === 'speak' ? (
        <SpeakDay entryParam={params.get('entrada')} />
      ) : (
        <WriteEnglish />
      )}
    </main>
  );
}

function Changes({ result }: { result: EnglishCorrection }) {
  if (!result.changes.length) return <p className="muted small mt-2">Sin correcciones. Muy bien.</p>;
  return (
    <ul className="changes">
      {result.changes.map((c, i) => (
        <li key={i}>
          <span className="change-type">{TYPE_LABEL[c.type] ?? c.type}</span>
          <span className="change-line"><s>{c.original}</s> → <b>{c.fix}</b></span>
          {c.note && <span className="change-note">{c.note}</span>}
        </li>
      ))}
    </ul>
  );
}

// ---------------- Contar tu día ----------------

function SpeakDay({ entryParam }: { entryParam: string | null }) {
  const snap = useStore();
  const today = useToday();
  const [cfg] = useEnglishSettings();
  const { toast } = useFeedback();
  const entries = useMemo(() => sortEntries(snap.journal).slice(0, 10), [snap.journal]);
  const [entryId, setEntryId] = useState<string | null>(entryParam ?? entries.find((e) => e.entryDate === today)?.id ?? entries[0]?.id ?? null);
  const entry = entries.find((e) => e.id === entryId) ?? snap.journal.find((e) => e.id === entryId);
  const [prep, setPrep] = useState<DayInEnglish | null>(null);
  const [busy, setBusy] = useState<null | 'prep' | 'feedback'>(null);
  const [fb, setFb] = useState<SpeakingFeedback | null>(null);
  const cap = useSpeechCapture();
  const started = useRef(Date.now());

  useEffect(() => {
    setPrep(null);
    setFb(null);
  }, [entryId]);

  useEffect(() => {
    if (cap.error) toast(cap.error, { tone: 'error' });
  }, [cap.error, toast]);

  if (!entries.length) {
    return <div className="empty"><p className="empty-title">Primero escribí en el journal</p><p className="empty-message">Esta práctica toma lo que viviste y te ayuda a contarlo en inglés.</p><Link to="/journal/hoy" className="btn btn-primary">Escribir hoy</Link></div>;
  }

  const prepare = async () => {
    if (!entry) return;
    setBusy('prep');
    try {
      setPrep(await dayInEnglish(`${entry.title ?? ''}\n${htmlToText(entry.content)}`.slice(0, 6000), cfg.level));
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const evaluate = async () => {
    if (!cap.text.trim()) return;
    setBusy('feedback');
    try {
      const r = await speakingFeedback(cap.text, prep?.prompts[0] ?? 'Tell me about your day.', cfg.level);
      setFb(r);
      await logSession({ lessonId: `journal-${entryId}`, title: 'Practice your day', level: cfg.level, minutes: Math.max(1, Math.round((Date.now() - started.current) / 60000)), score: r.score, mode: 'journal' });
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="stack-lg mt-6">
      <div>
        <p className="field-label">Entrada</p>
        <div className="chips mt-2">
          {entries.map((e) => (
            <button key={e.id} type="button" className="chip" aria-pressed={e.id === entryId} onClick={() => setEntryId(e.id)}>
              {formatRelativeDay(e.entryDate, 'short')}{e.title ? ` · ${e.title.slice(0, 18)}` : ''}
            </button>
          ))}
        </div>
        {entry && <p className="entry-preview">{htmlToText(entry.content).slice(0, 220)}{htmlToText(entry.content).length > 220 ? '…' : ''}</p>}
      </div>

      {!prep ? (
        <button type="button" className="btn btn-primary" onClick={() => void prepare()} disabled={!entry || busy === 'prep'}>
          {busy === 'prep' ? <span className="spinner" /> : <Icon name="sparkle" size={18} />} Preparar mi día en inglés
        </button>
      ) : (
        <>
          <section className="listen-card surface-card" style={{ marginTop: 0 }}>
            <p className="listen-voice"><Icon name="sparkle" size={14} /> Tu día, nivel {cfg.level}</p>
            <p className="model-text">{prep.model}</p>
            <div className="hstack mt-2"><SpeakButton text={prep.model} rate={cfg.rate} /><span className="faint small">Escuchalo antes de contarlo vos</span></div>
          </section>

          {prep.vocab.length > 0 && (
            <section>
              <p className="field-label">Palabras útiles</p>
              <div className="group-body mt-2">
                {prep.vocab.map((v) => (
                  <div key={v.en} className="row vocab-row">
                    <span className="row-main"><span className="vocab-en">{v.en}</span><span className="vocab-es">{v.es}</span></span>
                    <SpeakButton text={v.en} size="sm" />
                    <button type="button" className="icon-btn" aria-label={`Agregar ${v.en} al repaso`} onClick={async () => toast((await addCard(v, cfg.level)) ? 'Agregada al repaso' : 'Ya estaba en tu mazo')}>
                      <Icon name="plus" size={18} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="speak-card surface-card">
            <p className="speak-es">Ahora contalo vos, en voz alta</p>
            <p className="speak-en">{prep.prompts[0] ?? 'Tell me about your day.'}</p>
            {prep.prompts.slice(1).map((p) => <p key={p} className="faint small">{p}</p>)}
          </section>

          {captureMode() === 'none' ? (
            <textarea className="textarea" rows={4} placeholder="Tu navegador no reconoce voz: escribí lo que dirías." value={cap.text} onChange={(e) => cap.setText(e.target.value)} />
          ) : (
            <MicButton cap={cap} label="Tocá y contá tu día en inglés" />
          )}
          {cap.text && (
            <div className="heard-box">
              <p className="field-label">Lo que dijiste</p>
              <textarea className="textarea" rows={3} value={cap.text} onChange={(e) => cap.setText(e.target.value)} />
              <button type="button" className="btn btn-primary btn-block mt-2" onClick={() => void evaluate()} disabled={busy === 'feedback' || cap.state !== 'idle'}>
                {busy === 'feedback' ? <span className="spinner" /> : 'Analizar'}
              </button>
            </div>
          )}
          {fb && (
            <section className="feedback-card surface-card">
              <div className="spread"><p className="field-label" style={{ padding: 0 }}>Devolución</p><span className="pron-score is-sm num">{fb.score}%</span></div>
              {fb.comment && <p className="mt-2">{fb.comment}</p>}
              <p className="field-label mt-4" style={{ padding: 0 }}>Cómo lo diría un nativo</p>
              <p className="model-text">{fb.corrected}</p>
              <SpeakButton text={fb.corrected} rate={cfg.rate} />
              <Changes result={fb} />
              {fb.fluency && <p className="muted small mt-4"><b>Fluidez:</b> {fb.fluency}</p>}
              <p className="faint small mt-4">La pronunciación se estima a partir de lo que reconoció el micrófono.</p>
            </section>
          )}
        </>
      )}
    </div>
  );
}

// ---------------- Escribir en inglés ----------------

function WriteEnglish() {
  const [cfg] = useEnglishSettings();
  const { toast } = useFeedback();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<EnglishCorrection | null>(null);
  const started = useRef(Date.now());

  const check = async () => {
    setBusy(true);
    try {
      const r = await correctEnglish(text, cfg.level);
      setRes(r);
      await logSession({ lessonId: 'writing', title: 'Write in English', level: cfg.level, minutes: Math.max(1, Math.round((Date.now() - started.current) / 60000)), score: r.score, mode: 'journal' });
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!res) return;
    const paras = (s: string) => s.split(/\n{2,}|\n/).filter((p) => p.trim()).map((p) => `<p>${escapeHtml(p)}</p>`).join('');
    const notes = res.changes.map((c) => `<li><s>${escapeHtml(c.original)}</s> → <b>${escapeHtml(c.fix)}</b>${c.note ? ` — ${escapeHtml(c.note)}` : ''}</li>`).join('');
    const e = newEntry();
    e.title = 'Written in English';
    e.tags = ['english'];
    e.content = `${paras(text)}<h2>Corrected</h2>${paras(res.corrected)}${notes ? `<h2>Notes</h2><ul>${notes}</ul>` : ''}`;
    await saveEntry(e);
    toast('Guardado en el journal', { action: { label: 'Ver', onClick: () => navigate(`/journal/${e.id}/leer`) } });
  };

  return (
    <div className="stack-lg mt-6">
      <div>
        <p className="field-label">Escribí en inglés sobre lo que quieras</p>
        <textarea className="textarea write-en mt-2" rows={7} value={text} onChange={(e) => { setText(e.target.value); setRes(null); }} placeholder="Today I went to the gym and after I had dinner with my friends…" autoCapitalize="sentences" spellCheck={false} />
      </div>
      {!res ? (
        <button type="button" className="btn btn-primary" onClick={() => void check()} disabled={text.trim().length < 8 || busy}>
          {busy ? <span className="spinner" /> : <Icon name="sparkle" size={18} />} Corregir
        </button>
      ) : (
        <section className="feedback-card surface-card">
          <div className="spread"><p className="field-label" style={{ padding: 0 }}>Corrección</p><span className="pron-score is-sm num">{res.score}%</span></div>
          {res.comment && <p className="mt-2">{res.comment}</p>}
          <p className="field-label mt-4" style={{ padding: 0 }}>Tu texto (original)</p>
          <p className={cx('model-text', 'is-original')}>{text}</p>
          <p className="field-label mt-4" style={{ padding: 0 }}>Versión corregida</p>
          <p className="model-text">{res.corrected}</p>
          <SpeakButton text={res.corrected} rate={cfg.rate} />
          <Changes result={res} />
          <button type="button" className="btn btn-secondary btn-block mt-4" onClick={() => void save()}><Icon name="journal" size={18} /> Guardar ambos en el journal</button>
        </section>
      )}
    </div>
  );
}
