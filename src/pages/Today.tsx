import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon, IconButton } from '@/components/ui';
import { useCapture } from '@/components/capture/CaptureSheet';
import { TaskRow, useTaskSheet } from '@/components/entries/TaskSheet';
import { HabitTap } from '@/components/entries/HabitRow';
import { useArtwork } from '@/pages/discover/Artwork';
import { useEnglishSettings, useHome, useSettings, useStore, useToday } from '@/hooks/useData';
import { createTask } from '@/services/actions';
import { habitDone, habitScheduled, journalStreak, parseCtx, sortTasks, weekOf } from '@/services/queries';
import { dueCards, englishStats, nextLesson } from '@/services/english';
import { startFocus } from '@/services/pomodoro';
import { quoteOfDay } from '@/services/quotes';
import { parseTask, addDaysISO } from '@shared/parser.ts';
import { excerpt } from '@/utils/html';
import { MONTHS, WEEKDAYS, WEEKDAYS_INITIAL, capitalize, formatRelativeDay, getGreeting, parseISODate } from '@/utils/date';
import { cx, haptic } from '@/utils/misc';

/**
 * «Hoy»: una sola línea del día. Junta lo que antes eran Inicio, Tareas,
 * Recordatorios (tareas con alarma), Hábitos, Agenda (tira de la semana) y Foco.
 */
export default function Today() {
  const snap = useStore();
  const today = useToday();
  const [settings] = useSettings();
  const [home] = useHome();
  const { open: openCapture } = useCapture();
  const [sheet, openTask] = useTaskSheet();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [day, setDay] = useState(today);
  const [draft, setDraft] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const isToday = day === today;
  const on = (id: string) => home.modules.find((m) => m.id === id)?.enabled ?? true;

  useEffect(() => {
    if (params.get('capturar')) {
      setParams({}, { replace: true });
      openCapture();
    }
    const d = params.get('dia');
    if (d) setDay(d);
  }, [params, setParams, openCapture]);

  const week = weekOf(day, settings.weekStartsOn);
  const tasks = snap.task;
  const pending = useMemo(
    () => sortTasks(tasks.filter((t) => !t.isDone && t.dueDate && (isToday ? t.dueDate <= day : t.dueDate === day))),
    [tasks, day, isToday],
  );
  const done = tasks.filter((t) => t.isDone && (t.completedAt?.slice(0, 10) === day || (!t.completedAt && t.dueDate === day)));
  const inbox = sortTasks(tasks.filter((t) => !t.isDone && !t.dueDate));
  const upcoming = useMemo(() => sortTasks(tasks.filter((t) => !t.isDone && t.dueDate && t.dueDate > day && t.dueDate <= addDaysISO(day, 7))), [tasks, day]);
  const habits = snap.habit.filter((h) => !h.isArchived && habitScheduled(h, day)).sort((a, b) => a.order - b.order);
  const entry = snap.journal.find((e) => e.entryDate === day);

  const d = parseISODate(day);
  const left = pending.length + habits.filter((h) => !habitDone(h, day)).length;
  const summary = !isToday
    ? `${pending.length ? `${pending.length} ${pending.length === 1 ? 'pendiente' : 'pendientes'}` : 'Sin pendientes'}`
    : left
      ? `${getGreeting()}${settings.userName ? `, ${settings.userName}` : ''}. Te quedan ${left} ${left === 1 ? 'cosa' : 'cosas'}.`
      : `${getGreeting()}${settings.userName ? `, ${settings.userName}` : ''}. Día despejado.`;

  const preview = draft.trim() ? parseTask(draft, parseCtx()) : null;

  const add = async () => {
    if (!draft.trim()) return;
    haptic();
    await createTask(draft, { dueDate: day });
    setDraft('');
  };

  // Deslizar la tira de la semana para cambiar de semana.
  const swipe = useRef<number | null>(null);

  return (
    <main className="page today">
      <header className="today-head">
        <div className="grow">
          <p className="today-date">{capitalize(WEEKDAYS[d.getDay()])} {d.getDate()} de {MONTHS[d.getMonth()]}</p>
          <h1 className="today-title">{isToday ? 'Hoy' : formatRelativeDay(day)}</h1>
        </div>
        <IconButton icon="settings" label="Ajustes" tone="filled" onClick={() => navigate('/ajustes')} />
      </header>

      <div
        className="week"
        onPointerDown={(e) => (swipe.current = e.clientX)}
        onPointerUp={(e) => {
          if (swipe.current === null) return;
          const dx = e.clientX - swipe.current;
          swipe.current = null;
          if (Math.abs(dx) > 50) setDay(addDaysISO(day, dx < 0 ? 7 : -7));
        }}
        role="tablist"
        aria-label="Semana"
      >
        {week.map((w) => {
          const n = tasks.filter((t) => !t.isDone && t.dueDate === w).length;
          const wrote = snap.journal.some((e) => e.entryDate === w);
          return (
            <button key={w} type="button" role="tab" aria-selected={w === day} className={cx('week-cell', w === day && 'is-on', w === today && 'is-today')} onClick={() => setDay(w)}>
              <span className="week-cell-wd">{WEEKDAYS_INITIAL[parseISODate(w).getDay()]}</span>
              <span className="week-cell-n num">{parseISODate(w).getDate()}</span>
              <span className="week-cell-dot" data-on={n > 0 || wrote || undefined} />
            </button>
          );
        })}
      </div>
      {!isToday && <button type="button" className="back-today" onClick={() => setDay(today)}>Volver a hoy</button>}

      <p className="today-summary">{summary}</p>

      <form className="add-line" onSubmit={(e) => { e.preventDefault(); void add(); }}>
        <Icon name="plus" size={18} />
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={isToday ? 'Agregar algo para hoy' : `Agregar para ${formatRelativeDay(day).toLowerCase()}`} enterKeyHint="done" aria-label="Nueva tarea" />
      </form>
      {preview && (preview.dueDate || preview.dueTime || preview.priority > 0) && (
        <p className="add-hint">{[preview.dueDate && formatRelativeDay(preview.dueDate, 'short'), preview.dueTime, preview.priority ? ['', 'baja', 'media', 'alta'][preview.priority] : null].filter(Boolean).join(' · ')}</p>
      )}

      {pending.length > 0 && (
        <section className="block">
          <div className="list">
            {pending.map((t) => <TaskRow key={t.id} task={t} onOpen={openTask} showDate={t.dueDate !== day} />)}
          </div>
        </section>
      )}

      {done.length > 0 && (
        <button type="button" className="fold" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
          <span>Hechas · {done.length}</span>
          <Icon name={showDone ? 'chevronUp' : 'chevronDown'} size={16} />
        </button>
      )}
      {showDone && <div className="list">{done.map((t) => <TaskRow key={t.id} task={t} onOpen={openTask} showDate={false} />)}</div>}

      {habits.length > 0 && on('habits') && (
        <section className="block">
          <div className="block-head">
            <h2>Hábitos</h2>
            <Link to="/habitos">Editar</Link>
          </div>
          <div className="habit-grid">
            {habits.map((h) => (
              <div key={h.id} className="habit-cell">
                <HabitTap habit={h} day={day} />
                <Link to={`/habitos/${h.id}`} className="habit-cell-name">{h.name}</Link>
              </div>
            ))}
          </div>
        </section>
      )}
      {!snap.habit.length && isToday && on('habits') && (
        <Link to="/habitos?nuevo=1" className="quiet-link">Sumar un hábito</Link>
      )}

      {isToday && on('journal') && (
        <Link to={entry ? `/journal/${entry.id}` : '/journal/hoy'} className="card-link">
          <span className="card-kicker">Journal{journalStreak(snap.journal, today) > 1 ? ` · ${journalStreak(snap.journal, today)} días seguidos` : ''}</span>
          <span className="card-title">{entry ? entry.title || 'Seguir escribiendo' : '¿Cómo va el día?'}</span>
          {entry && <span className="card-text clamp-2">{excerpt(entry.content, `${entry.id}:${entry.updatedAt}`, 160)}</span>}
        </Link>
      )}

      {isToday && on('english') && <EnglishCard />}

      {isToday && on('pomodoro') && (
        <button type="button" className="card-link is-row" onClick={() => { void startFocus(); navigate('/pomodoro'); }}>
          <span className="grow">
            <span className="card-kicker">Foco</span>
            <span className="card-title">Empezar un bloque</span>
          </span>
          <span className="play-disc"><Icon name="play" size={15} filled strokeWidth={0} /></span>
        </button>
      )}

      {isToday && inbox.length > 0 && (
        <>
          <button type="button" className="fold" onClick={() => setShowInbox((v) => !v)} aria-expanded={showInbox}>
            <span>Sin fecha · {inbox.length}</span>
            <Icon name={showInbox ? 'chevronUp' : 'chevronDown'} size={16} />
          </button>
          {showInbox && <div className="list">{inbox.map((t) => <TaskRow key={t.id} task={t} onOpen={openTask} />)}</div>}
        </>
      )}

      {upcoming.length > 0 && (
        <>
          <button type="button" className="fold" onClick={() => setShowNext((v) => !v)} aria-expanded={showNext}>
            <span>Próximos 7 días · {upcoming.length}</span>
            <Icon name={showNext ? 'chevronUp' : 'chevronDown'} size={16} />
          </button>
          {showNext && <div className="list">{upcoming.map((t) => <TaskRow key={t.id} task={t} onOpen={openTask} />)}</div>}
        </>
      )}

      {isToday && (on('quote') || on('artwork')) && <Inspiration day={today} quote={on('quote')} artwork={on('artwork')} />}

      {sheet}
    </main>
  );
}

function EnglishCard() {
  const snap = useStore();
  const today = useToday();
  const [cfg] = useEnglishSettings();
  const stats = englishStats(snap.lesson, snap.card, today);
  const next = nextLesson(cfg.level, stats.lessonsDone);
  const due = dueCards(snap.card, today).length;
  return (
    <div className="card-link is-row">
      <Link to="/ingles" className="grow" style={{ color: 'inherit', textDecoration: 'none' }}>
        <span className="card-kicker">Inglés · {cfg.level}</span>
        <span className="card-title">{stats.todayDone ? 'Sesión de hoy hecha' : next.topic}</span>
        <span className="card-text">{stats.todayDone ? `${stats.streak} ${stats.streak === 1 ? 'día' : 'días'} seguidos` : `${next.minutes} min`}{due ? ` · ${due} palabras para repasar` : ''}</span>
      </Link>
      <Link to={stats.todayDone && due ? '/ingles/repaso' : `/ingles/leccion/${next.id}`} className="play-disc" aria-label="Empezar sesión de inglés">
        <Icon name="play" size={15} filled strokeWidth={0} />
      </Link>
    </div>
  );
}

function Inspiration({ day, quote, artwork }: { day: string; quote: boolean; artwork: boolean }) {
  const q = quoteOfDay(day);
  const { art } = useArtwork(day);
  return (
    <section className="inspiration">
      {quote && (
        <Link to="/frases" className="quote-card">
          <span className="quote-card-text">“{q.text}”</span>
          <span className="quote-card-author">{q.author}</span>
        </Link>
      )}
      {artwork && art && (
        <Link to="/arte" className="art-card">
          <img src={art.thumb} alt={`${art.title}, ${art.artist}`} loading="lazy" />
          <span className="art-card-text">
            <span className="card-kicker">Obra del día</span>
            <span className="card-title clamp-2">{art.title}</span>
            <span className="card-text">{art.artist}</span>
          </span>
        </Link>
      )}
    </section>
  );
}
