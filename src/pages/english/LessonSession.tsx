import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Icon, NavBar, useFeedback } from '@/components/ui';
import { Waveform } from '@/components/ui/Waveform';
import { MicButton, SpeakButton, captureMode, useSpeechCapture } from '@/components/english/speech';
import { useEnglishSettings, useStore } from '@/hooks/useData';
import { addLessonCards, findLesson, logSession, say, scorePronunciation, stopSpeaking } from '@/services/english';
import type { Lesson } from '@/services/englishLessons';
import { cx, haptic } from '@/utils/misc';

const STEPS = ['Learn', 'Practice', 'Listen', 'Speak', 'Review'] as const;

type Q = { prompt: string; hint?: string; options: string[]; answer: string; say?: string };

function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function buildPractice(l: Lesson): Q[] {
  const vocab = shuffle(l.vocab).slice(0, 4).map((v): Q => ({
    prompt: v.en,
    hint: '¿Qué significa?',
    say: v.en,
    answer: v.es,
    options: shuffle([v.es, ...shuffle(l.vocab.filter((x) => x.en !== v.en)).slice(0, 2).map((x) => x.es)]),
  }));
  const grammar = l.grammar.exercises.map((e): Q => ({ prompt: e.prompt, hint: 'Completá', answer: e.answer, options: shuffle(e.options) }));
  return [...vocab, ...grammar];
}

export default function LessonSession() {
  const { id = '' } = useParams();
  useStore();
  const lesson = findLesson(id);
  const navigate = useNavigate();
  const [cfg] = useEnglishSettings();
  const [step, setStep] = useState(0);
  const startedAt = useRef(Date.now());
  const [practiceScore, setPracticeScore] = useState<number | null>(null);
  const [listenScore, setListenScore] = useState<number | null>(null);
  const [speakScores, setSpeakScores] = useState<number[]>([]);

  useEffect(() => () => stopSpeaking(), []);
  useEffect(() => {
    window.scrollTo(0, 0);
    stopSpeaking();
  }, [step]);

  if (!lesson) return <main className="page"><NavBar back="/ingles" backLabel="Inglés" /><p className="muted">No se encontró la lección.</p></main>;

  const total = Math.round(
    [practiceScore, listenScore, speakScores.length ? speakScores.reduce((a, b) => a + b, 0) / speakScores.length : null]
      .filter((x): x is number => x !== null)
      .reduce((a, b, _, arr) => a + b / arr.length, 0),
  );

  return (
    <main className="page en-session">
      <NavBar back="/ingles" backLabel="Inglés" title={lesson.topic} />
      <ol className="en-stepper" aria-label="Pasos">
        {STEPS.map((s, i) => (
          <li key={s} className={cx(i < step && 'is-done', i === step && 'is-current')}>
            <i />
            <span>{s}</span>
          </li>
        ))}
      </ol>

      {step === 0 && <Learn lesson={lesson} rate={cfg.rate} onNext={() => setStep(1)} />}
      {step === 1 && <Practice lesson={lesson} rate={cfg.rate} onDone={(s) => { setPracticeScore(s); setStep(2); }} />}
      {step === 2 && <Listen lesson={lesson} rate={cfg.rate} onDone={(s) => { setListenScore(s); setStep(3); }} />}
      {step === 3 && <Speak lesson={lesson} rate={cfg.rate} onDone={(s) => { setSpeakScores(s); setStep(4); }} />}
      {step === 4 && (
        <ReviewStep
          lesson={lesson}
          score={total}
          parts={{ practice: practiceScore, listen: listenScore, speak: speakScores.length ? Math.round(speakScores.reduce((a, b) => a + b, 0) / speakScores.length) : null }}
          onFinish={async () => {
            const added = await addLessonCards(lesson);
            await logSession({ lessonId: lesson.id, title: lesson.topic, level: lesson.level, minutes: Math.max(1, Math.round((Date.now() - startedAt.current) / 60000)), score: total, mode: 'lesson' });
            navigate('/ingles', { replace: true, state: { added } });
          }}
        />
      )}
    </main>
  );
}

// ---------------- Learn ----------------

function Learn({ lesson, rate, onNext }: { lesson: Lesson; rate: number; onNext: () => void }) {
  return (
    <div className="en-step">
      <h2 className="en-step-title">Vocabulario</h2>
      <div className="group-body">
        {lesson.vocab.map((v) => (
          <div key={v.en} className="row vocab-row" onClick={() => void say(v.en, rate)}>
            <span className="row-main">
              <span className="vocab-en">{v.en}</span>
              <span className="vocab-es">{v.es}</span>
              <span className="vocab-ex">{v.example}</span>
            </span>
            <SpeakButton text={v.example} rate={rate} size="sm" label="Escuchar ejemplo" />
          </div>
        ))}
      </div>

      <h2 className="en-step-title mt-6">{lesson.grammar.title}</h2>
      <div className="surface-card grammar-card">
        <p className="grammar-explain">{lesson.grammar.explain}</p>
        <ul className="grammar-examples">
          {lesson.grammar.examples.map((e) => (
            <li key={e.en}>
              <span className="grow">
                <span className="vocab-en">{e.en}</span>
                <span className="vocab-es">{e.es}</span>
              </span>
              <SpeakButton text={e.en} rate={rate} size="sm" />
            </li>
          ))}
        </ul>
      </div>
      <button type="button" className="btn btn-primary btn-block mt-6" onClick={onNext}>Practicar</button>
    </div>
  );
}

// ---------------- Practice ----------------

function Practice({ lesson, rate, onDone }: { lesson: Lesson; rate: number; onDone: (score: number) => void }) {
  const qs = useMemo(() => buildPractice(lesson), [lesson]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [right, setRight] = useState(0);
  const q = qs[i];

  const choose = (o: string) => {
    if (picked) return;
    setPicked(o);
    const ok = o === q.answer;
    haptic(ok ? 8 : 20);
    if (ok) setRight((r) => r + 1);
    if (q.say) void say(q.say, rate);
  };

  const next = () => {
    if (i + 1 >= qs.length) onDone(Math.round((right / qs.length) * 100));
    else {
      setI(i + 1);
      setPicked(null);
    }
  };

  return (
    <div className="en-step">
      <p className="en-counter num">{i + 1} / {qs.length}</p>
      <div className="quiz-card surface-card">
        {q.hint && <p className="quiz-hint">{q.hint}</p>}
        <p className="quiz-prompt">{q.prompt}</p>
        {q.say && <SpeakButton text={q.say} rate={rate} />}
      </div>
      <div className="quiz-options">
        {q.options.map((o) => (
          <button
            key={o}
            type="button"
            className={cx('quiz-option', picked && o === q.answer && 'is-right', picked === o && o !== q.answer && 'is-wrong')}
            onClick={() => choose(o)}
            disabled={!!picked && o !== picked && o !== q.answer}
          >
            {o}
          </button>
        ))}
      </div>
      {picked && (
        <div className="quiz-feedback">
          <p className={picked === q.answer ? 'ok' : 'bad'}>{picked === q.answer ? 'Bien.' : `Era «${q.answer}».`}</p>
          <button type="button" className="btn btn-primary btn-block" onClick={next}>{i + 1 >= qs.length ? 'Seguir con Listening' : 'Siguiente'}</button>
        </div>
      )}
    </div>
  );
}

// ---------------- Listen ----------------

function Listen({ lesson, rate, onDone }: { lesson: Lesson; rate: number; onDone: (score: number) => void }) {
  const [line, setLine] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [showText, setShowText] = useState(false);
  const [showEs, setShowEs] = useState(false);
  const [answers, setAnswers] = useState<(number | null)[]>(() => lesson.questions.map(() => null));
  const stopRef = useRef(false);

  const play = async (slow = false) => {
    if (playing) {
      stopRef.current = true;
      stopSpeaking();
      setPlaying(false);
      setLine(-1);
      return;
    }
    stopRef.current = false;
    setPlaying(true);
    for (let k = 0; k < lesson.dialogue.length; k++) {
      if (stopRef.current) break;
      setLine(k);
      await say(lesson.dialogue[k].en, slow ? Math.max(0.6, rate - 0.25) : rate);
      await new Promise((r) => setTimeout(r, 250));
    }
    setPlaying(false);
    setLine(-1);
  };

  const done = answers.every((a) => a !== null);
  const score = lesson.questions.length ? Math.round((answers.filter((a, k) => a === lesson.questions[k].answer).length / lesson.questions.length) * 100) : 100;

  return (
    <div className="en-step">
      <div className="listen-card surface-card">
        <p className="listen-voice"><Icon name="headphones" size={14} /> Diálogo · {lesson.dialogue.length} líneas</p>
        <div className="listen-row">
          <button type="button" className="play-disc" aria-label={playing ? 'Detener' : 'Reproducir'} onClick={() => void play()}>
            <Icon name={playing ? 'pause' : 'play'} size={16} filled strokeWidth={0} />
          </button>
          <Waveform seed={lesson.id} bars={56} progress={line < 0 ? 0 : (line + 1) / lesson.dialogue.length} />
        </div>
        <div className="hstack mt-4">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void play(true)} disabled={playing}>Más lento</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowText((v) => !v)}>{showText ? 'Ocultar texto' : 'Ver texto'}</button>
          {showText && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowEs((v) => !v)}>{showEs ? 'Sin traducción' : 'Traducción'}</button>}
        </div>
      </div>

      {showText && (
        <ol className="dialogue">
          {lesson.dialogue.map((d, k) => (
            <li key={k} className={cx(k === line && 'is-now', d.speaker === 'B' && 'is-b')} onClick={() => void say(d.en, rate)}>
              <span className="dialogue-who">{d.speaker}</span>
              <span className="grow">
                <span className="dialogue-en">{d.en}</span>
                {showEs && <span className="dialogue-es">{d.es}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}

      <h2 className="en-step-title mt-6">Comprensión</h2>
      {lesson.questions.map((q, k) => (
        <div key={k} className="comp-q">
          <p className="comp-prompt">{q.q}</p>
          <div className="quiz-options">
            {q.options.map((o, oi) => {
              const a = answers[k];
              return (
                <button
                  key={o}
                  type="button"
                  className={cx('quiz-option is-sm', a !== null && oi === q.answer && 'is-right', a === oi && oi !== q.answer && 'is-wrong')}
                  onClick={() => a === null && setAnswers(answers.map((x, j) => (j === k ? oi : x)))}
                >
                  {o}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-primary btn-block mt-6" disabled={!done} onClick={() => onDone(score)}>Seguir con Speaking</button>
    </div>
  );
}

// ---------------- Speak ----------------

function Speak({ lesson, rate, onDone }: { lesson: Lesson; rate: number; onDone: (scores: number[]) => void }) {
  const [i, setI] = useState(0);
  const [scores, setScores] = useState<number[]>([]);
  const cap = useSpeechCapture();
  const { toast } = useFeedback();
  const phrase = lesson.speak[i];
  const result = cap.text && cap.state === 'idle' ? scorePronunciation(phrase.en, cap.text) : null;
  const mode = captureMode();

  useEffect(() => {
    if (cap.error) toast(cap.error, { tone: 'error', duration: 4000 });
  }, [cap.error, toast]);

  const next = (score: number) => {
    const all = [...scores, score];
    setScores(all);
    cap.setText('');
    if (i + 1 >= lesson.speak.length) onDone(all);
    else setI(i + 1);
  };

  return (
    <div className="en-step">
      <p className="en-counter num">{i + 1} / {lesson.speak.length}</p>
      <div className="speak-card surface-card">
        <p className="speak-es">{phrase.es}</p>
        <p className="speak-en">
          {result ? result.display.map((w, k) => <span key={k} className={w.ok ? 'w-ok' : 'w-miss'}>{w.word} </span>) : phrase.en}
        </p>
        <SpeakButton text={phrase.en} rate={rate} />
      </div>

      {mode !== 'none' ? (
        <MicButton cap={cap} label="Escuchá la frase y repetila" />
      ) : (
        <p className="group-foot mt-4">Tu navegador no reconoce voz y la IA no está activa: decí la frase en voz alta y marcala como hecha.</p>
      )}

      {cap.state === 'listening' && cap.text && <p className="heard">«{cap.text}»</p>}

      {result && (
        <div className="pron-result">
          <p className="pron-score"><span className="num">{result.score}</span>%</p>
          <p className="muted small">Oí: «{cap.text}». En rojo, las palabras que no se reconocieron.</p>
          <div className="hstack mt-4">
            <button type="button" className="btn btn-secondary grow" onClick={() => { cap.setText(''); void cap.start(); }}>Otra vez</button>
            <button type="button" className="btn btn-primary grow" onClick={() => next(result.score)}>{i + 1 >= lesson.speak.length ? 'Terminar' : 'Siguiente'}</button>
          </div>
        </div>
      )}
      {!result && (
        <button type="button" className="btn btn-ghost btn-block mt-4" onClick={() => next(mode === 'none' ? 80 : 0)}>
          {mode === 'none' ? 'La dije' : 'Saltar'}
        </button>
      )}
    </div>
  );
}

// ---------------- Review ----------------

function ReviewStep({ lesson, score, parts, onFinish }: { lesson: Lesson; score: number; parts: { practice: number | null; listen: number | null; speak: number | null }; onFinish: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="en-step">
      <div className="review-hero surface-card">
        <p className="review-score num">{score}<small>%</small></p>
        <p className="review-title">{score >= 85 ? 'Excelente sesión' : score >= 60 ? 'Buen trabajo' : 'Bien por practicar'}</p>
        <p className="muted small">{lesson.topic} · {lesson.level}</p>
      </div>
      <div className="group-body mt-4">
        {([['Practice', parts.practice], ['Listening', parts.listen], ['Speaking', parts.speak]] as const).map(([k, v]) => (
          <div key={k} className="row">
            <span className="row-main"><span className="row-label">{k}</span></span>
            <span className="row-value">{v === null ? '—' : `${v}%`}</span>
          </div>
        ))}
      </div>
      <p className="group-foot mt-4">Las {lesson.vocab.length} palabras de la lección pasan a tu repaso con repetición espaciada: vuelven justo antes de que las olvides.</p>
      <button type="button" className="btn btn-primary btn-block mt-6" disabled={busy} onClick={() => { setBusy(true); onFinish(); }}>Terminar sesión</button>
    </div>
  );
}
