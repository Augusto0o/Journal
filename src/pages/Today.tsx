import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon, IconButton } from '@/components/ui';
import { TopSearch } from '@/components/navigation/TopSearch';
import { useCapture } from '@/components/capture/CaptureSheet';
import { TaskRow, useTaskSheet } from '@/components/entries/TaskSheet';
import { HabitTap } from '@/components/entries/HabitRow';
import { useArtwork } from '@/pages/discover/Artwork';
import { useEnglishSettings, useHome, useSettings, useStore, useToday } from '@/hooks/useData';
import { createTask } from '@/services/actions';
import { habitDone, habitScheduled, journalStreak, parseCtx, sortTasks, weekOf } from '@/services/queries';
import { dueCards, englishStats, nextLesson } from '@/services/english';
import { startFocus } from '@/services/pomodoro';
import { todayOrder } from '@/services/prefs';
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
  const order = todayOrder(home);

  useEffect(() => {
    if (params.get('capturar')) {
      setParams({}, { replace: true });
      openCapture();
    }
    const d = params.get('dia');
    if (d) setDay(d);
  }, [params, setParams, openCapture]);

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

  const busyDays = useMemo(() => new Set([...tasks.filter((t) => !t.isDone && t.dueDate).map((t) => t.dueDate as string), ...snap.journal.map((e) => e.entryDate)]), [tasks, snap.journal]);

  const preview = draft.trim() ? parseTask(draft, parseCtx()) : null;

  const add = async () => {
    if (!draft.trim()) return;
    haptic();
    await createTask(draft, { dueDate: day });
    setDraft('');
  };


  return (
    <main className="page today">
      <TopSearch />
      <header className="today-head">
        <div className="grow">
          <p className="today-date">{capitalize(WEEKDAYS[d.getDay()])} {d.getDate()} de {MONTHS[d.getMonth()]}</p>
          <h1 className="today-title">{isToday ? 'Hoy' : formatRelativeDay(day)}</h1>
        </div>
        <IconButton icon="key" label="Contraseñas" tone="filled" onClick={() => navigate('/contrasenas')} />
        <IconButton icon="settings" label="Ajustes" tone="filled" onClick={() => navigate('/ajustes')} />
      </header>

      <DayStrip day={day} today={today} weekStartsOn={settings.weekStartsOn} onPick={setDay} hasSomething={(w) => busyDays.has(w)} />
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

      {order.map((id) => {
        switch (id) {
          case 'habits':
            return on('habits') ? (
              <div key={id}>
      {habits.length > 0 && (
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
      {!snap.habit.length && isToday && (
        <Link to="/habitos?nuevo=1" className="quiet-link">Sumar un hábito</Link>
      )}

              </div>
            ) : null;
          case 'journal':
            return isToday && on('journal') ? (
              <div key={id}>
      {(
        <Link to={entry ? `/journal/${entry.id}` : '/journal/hoy'} className="card-link">
          <span className="card-kicker">Journal{journalStreak(snap.journal, today) > 1 ? ` · ${journalStreak(snap.journal, today)} días seguidos` : ''}</span>
          <span className="card-title">{entry ? entry.title || 'Seguir escribiendo' : '¿Cómo va el día?'}</span>
          {entry && <span className="card-text clamp-2">{excerpt(entry.content, `${entry.id}:${entry.updatedAt}`, 160)}</span>}
        </Link>
      )}

              </div>
            ) : null;
          case 'english':
            return isToday && on('english') ? <EnglishCard key={id} /> : null;
          case 'pomodoro':
            return isToday && on('pomodoro') ? (
              <div key={id}>
      {(
        <button type="button" className="card-link is-row" onClick={() => { void startFocus(); navigate('/pomodoro'); }}>
          <span className="grow">
            <span className="card-kicker">Foco</span>
            <span className="card-title">Empezar un bloque</span>
          </span>
          <span className="play-disc"><Icon name="play" size={15} filled strokeWidth={0} /></span>
        </button>
      )}

              </div>
            ) : null;
          case 'quote':
            return isToday && on('quote') ? <QuoteCard key={id} day={today} /> : null;
          case 'artwork':
            return isToday && on('artwork') ? <ArtCard key={id} day={today} /> : null;
          default:
            return null;
        }
      })}

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

function QuoteCard({ day }: { day: string }) {
  const q = quoteOfDay(day);
  return (
    <Link to="/frases" className="quote-card">
      <span className="quote-card-text">“{q.text}”</span>
      <span className="quote-card-author">{q.author}</span>
    </Link>
  );
}

function ArtCard({ day }: { day: string }) {
  const { art } = useArtwork(day);
  if (!art) return null;
  return (
    <Link to="/arte" className="art-card">
      <img src={art.thumb} alt={`${art.title}, ${art.artist}`} loading="lazy" />
      <span className="art-card-text">
        <span className="card-kicker">Obra del día</span>
        <span className="card-title clamp-2">{art.title}</span>
        <span className="card-text">{art.artist}</span>
      </span>
    </Link>
  );
}

/**
 * Tira de días que se desliza con el dedo (con imán por día), como el calendario de iOS.
 * Muestra medio año hacia atrás y hacia adelante; el día elegido se centra con suavidad.
 */
function DayStrip({ day, today, weekStartsOn, onPick, hasSomething }: { day: string; today: string; weekStartsOn: 0 | 1; onPick: (d: string) => void; hasSomething: (d: string) => boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const days = useMemo(() => {
    const start = addDaysISO(weekOf(today, weekStartsOn)[0], -26 * 7);
    return Array.from({ length: 53 * 7 }, (_, i) => addDaysISO(start, i));
  }, [today, weekStartsOn]);
  const first = useRef(true);

  // Al elegir un día: si no se ve, se desplaza hasta su semana.
  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    const weekStart = weekOf(day, weekStartsOn)[0];
    const cell = box.querySelector<HTMLElement>(`[data-day="${weekStart}"]`);
    const sel = box.querySelector<HTMLElement>(`[data-day="${day}"]`);
    if (!cell || !sel) return;
    const visible = sel.offsetLeft >= box.scrollLeft - 1 && sel.offsetLeft + sel.offsetWidth <= box.scrollLeft + box.clientWidth + 1;
    if (first.current || !visible) box.scrollTo({ left: cell.offsetLeft, behavior: first.current ? 'auto' : 'smooth' });
    first.current = false;
  }, [day, weekStartsOn]);

  return (
    <div className="day-strip" ref={ref} role="tablist" aria-label="Días">
      {days.map((w) => {
        const d = parseISODate(w);
        return (
          <button key={w} type="button" role="tab" data-day={w} aria-selected={w === day} className={cx('week-cell', w === day && 'is-on', w === today && 'is-today', d.getDate() === 1 && 'is-month')} onClick={() => onPick(w)}>
            <span className="week-cell-wd">{d.getDate() === 1 ? MONTHS[d.getMonth()].slice(0, 3) : WEEKDAYS_INITIAL[d.getDay()]}</span>
            <span className="week-cell-n num">{d.getDate()}</span>
            <span className="week-cell-dot" data-on={hasSomething(w) || undefined} />
          </button>
        );
      })}
    </div>
  );
}
