import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Empty, NavBar } from '@/components/ui';
import { SpeakButton } from '@/components/english/speech';
import { useEnglishSettings, useStore, useToday } from '@/hooks/useData';
import { dueCards, logSession, previewIntervals, reviewCard, say, type Grade } from '@/services/english';
import type { EnglishCard } from '@/types';
import { cx, haptic } from '@/utils/misc';

const GRADES: { g: Grade; label: string }[] = [
  { g: 0, label: 'Otra vez' },
  { g: 1, label: 'Difícil' },
  { g: 2, label: 'Bien' },
  { g: 3, label: 'Fácil' },
];

export default function Review() {
  const snap = useStore();
  const today = useToday();
  const [cfg] = useEnglishSettings();
  // Cola fija al entrar: repasos pendientes + un tope de tarjetas nuevas por día.
  const queue = useMemo(() => {
    const due = dueCards(snap.card, today);
    const old = due.filter((c) => c.reps > 0);
    const fresh = due.filter((c) => c.reps === 0).slice(0, cfg.newPerDay);
    return [...old, ...fresh].map((c) => c.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [pos, setPos] = useState(0);
  const [again, setAgain] = useState<string[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const started = useRef(Date.now());
  const logged = useRef(false);

  const order = [...queue, ...again];
  const id = order[pos];
  const card: EnglishCard | undefined = id ? snap.card.find((c) => c.id === id) : undefined;
  const finished = !card && order.length > 0;

  useEffect(() => {
    if (!finished || logged.current || !done) return;
    logged.current = true;
    void logSession({ lessonId: 'review', title: 'Repaso', level: cfg.level, minutes: Math.max(1, Math.round((Date.now() - started.current) / 60000)), score: 100, mode: 'review' });
  }, [finished, done, cfg.level]);

  const grade = async (g: Grade) => {
    if (!card) return;
    haptic(g === 0 ? 20 : 8);
    await reviewCard(card, g);
    if (g === 0) setAgain((a) => [...a, card.id]);
    setDone((d) => d + 1);
    setFlipped(false);
    setPos((p) => p + 1);
  };

  return (
    <main className="page">
      <NavBar back="/ingles" backLabel="Inglés" title="Repaso" end={order.length ? <span className="navbar-state num">{Math.min(pos + 1, order.length)}/{order.length}</span> : undefined} />
      {!order.length ? (
        <Empty
          title={snap.card.length ? 'Estás al día' : 'Tu mazo está vacío'}
          message={snap.card.length ? 'No hay palabras para repasar hoy. Las próximas vuelven cuando estén por olvidarse.' : 'Completá una lección y sus palabras aparecen acá, o agregalas a mano.'}
          action={<Link to={snap.card.length ? '/ingles' : '/ingles/palabras'} className="btn btn-primary">{snap.card.length ? 'Volver' : 'Agregar palabras'}</Link>}
        />
      ) : finished ? (
        <Empty title="Repaso terminado" message={`Repasaste ${done} ${done === 1 ? 'tarjeta' : 'tarjetas'}. Mañana siguen las que tocan.`} action={<Link to="/ingles" className="btn btn-primary">Listo</Link>} />
      ) : card ? (
        <>
          <div className="review-progress" aria-hidden="true"><i style={{ transform: `scaleX(${pos / order.length})` }} /></div>
          <button type="button" className={cx('flashcard surface-card', flipped && 'is-flipped')} onClick={() => { if (!flipped) { setFlipped(true); void say(card.en); } }}>
            <span className="flash-level">{card.level}{card.reps === 0 ? ' · nueva' : ''}</span>
            <span className="flash-en">{card.en}</span>
            {flipped ? (
              <>
                <span className="flash-es">{card.es}</span>
                {card.example && <span className="flash-ex">{card.example}</span>}
              </>
            ) : (
              <span className="flash-tap">Tocá para ver la respuesta</span>
            )}
          </button>
          <div className="flash-speak"><SpeakButton text={card.example || card.en} /></div>
          {flipped && (
            <div className="grade-row">
              {GRADES.map(({ g, label }, k) => (
                <button key={g} type="button" className={cx('grade-btn', `g${g}`)} onClick={() => void grade(g)}>
                  <span>{label}</span>
                  <small>{previewIntervals(card)[k]}</small>
                </button>
              ))}
            </div>
          )}
        </>
      ) : null}
    </main>
  );
}
