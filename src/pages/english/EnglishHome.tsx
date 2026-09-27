import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BottomSheet, Icon, IconButton, NavBar, Row, SheetAction, Stepper, useFeedback } from '@/components/ui';
import { useEnglishSettings, useStore, useToday } from '@/hooks/useData';
import { LESSONS, LEVELS, type Lesson } from '@/services/englishLessons';
import { deleteCustomLesson, dueCards, englishStats, nextLesson, saveCustomLesson } from '@/services/english';
import { aiProblem, generateLesson } from '@/services/ai';
import { PREF } from '@/services/prefs';
import type { CefrLevel } from '@/types';
import { cx } from '@/utils/misc';

export default function EnglishHome() {
  const snap = useStore();
  const today = useToday();
  const navigate = useNavigate();
  const [cfg, setCfg] = useEnglishSettings();
  const { toast, confirm } = useFeedback();
  const [sheet, setSheet] = useState<null | 'settings' | 'create'>(null);
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [viewLevel, setViewLevel] = useState<CefrLevel>(cfg.level);

  const custom = (snap.prefs[PREF.englishLessons] as Lesson[] | undefined) ?? [];
  const stats = englishStats(snap.lesson, snap.card, today);
  const due = dueCards(snap.card, today);
  const next = nextLesson(cfg.level, stats.lessonsDone);
  const levelInfo = LEVELS.find((l) => l.id === cfg.level)!;
  const todayEntry = snap.journal.find((e) => e.entryDate === today);
  const lessons = useMemo(() => [...custom.filter((l) => l.level === viewLevel), ...LESSONS.filter((l) => l.level === viewLevel)], [custom, viewLevel]);
  const levelDone = LESSONS.filter((l) => l.level === cfg.level && stats.lessonsDone.has(l.id)).length;
  const levelTotal = LESSONS.filter((l) => l.level === cfg.level).length;

  const create = async () => {
    setBusy(true);
    try {
      const l = await generateLesson(topic.trim(), cfg.level);
      await saveCustomLesson(l);
      setSheet(null);
      setTopic('');
      navigate(`/ingles/leccion/${l.id}`);
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <NavBar back="/" backLabel="Hoy" title="Inglés" end={<IconButton icon="settings" label="Ajustes de inglés" onClick={() => setSheet('settings')} />} />

      <section className="en-today surface-card mt-4">
        <div className="spread">
          <button type="button" className="en-level" onClick={() => setSheet('settings')}>{levelInfo.label}</button>
          <span className="faint small num">{levelDone}/{levelTotal} lecciones</span>
        </div>
        <p className="en-today-label">Sesión de hoy</p>
        <h1 className="en-today-title">{next.topic}</h1>
        <p className="en-today-sub">{next.title} · Learn → Practice → Listen → Speak · {next.minutes} min</p>
        <div className="en-today-row">
          <Link to={`/ingles/leccion/${next.id}`} className="play-disc is-lg" aria-label={`Empezar ${next.topic}`}>
            <Icon name="play" size={18} filled strokeWidth={0} />
          </Link>
          <div className="en-steps" aria-hidden="true">
            {['Learn', 'Practice', 'Listen', 'Speak', 'Review'].map((s) => <span key={s}>{s}</span>)}
          </div>
        </div>
      </section>

      <section className="group">
        <div className="group-body">
          <Row icon="repeat" hue={45} label="Repaso de vocabulario" sub={due.length ? `${due.length} ${due.length === 1 ? 'palabra para hoy' : 'palabras para hoy'}` : snap.card.length ? 'Al día. Volvé mañana.' : 'Se llena con las palabras de cada lección'} to="/ingles/repaso" value={due.length || undefined} />
          <Row icon="journal" hue={275} label="Practice your day in English" sub={todayEntry ? 'Contá en inglés lo que escribiste hoy' : 'Usa tus entradas del journal'} to={`/ingles/diario${todayEntry ? `?entrada=${todayEntry.id}` : ''}`} />
          <Row icon="pen" hue={150} label="Write in English" sub="Escribí y la IA corrige sin perder tu texto" to="/ingles/diario?modo=escribir" />
          <Row icon="book" hue={245} label="Mis palabras" value={snap.card.length || undefined} to="/ingles/palabras" />
        </div>
      </section>

      <dl className="habit-stats">
        <div><dt>Racha</dt><dd className="num">{stats.streak}<small> días</small></dd></div>
        <div><dt>Palabras</dt><dd className="num">{stats.learned}<small> / {snap.card.length}</small></dd></div>
        <div><dt>Práctica</dt><dd className="num">{stats.minutes}<small> min</small></dd></div>
      </dl>

      <section className="group">
        <h2 className="group-title">
          <span>Lecciones</span>
          <button type="button" onClick={() => setSheet('create')}>Crear con IA</button>
        </h2>
        <label className="level-pill">
          <span>Nivel</span>
          <select value={viewLevel} onChange={(e) => setViewLevel(e.target.value as CefrLevel)} aria-label="Nivel de las lecciones">
            {LEVELS.map((l) => <option key={l.id} value={l.id}>{l.id}</option>)}
          </select>
          <Icon name="chevronDown" size={14} />
        </label>
        <div className="group-body mt-4">
          {lessons.map((l) => {
            const done = stats.lessonsDone.has(l.id);
            const isCustom = l.id.startsWith('ai-');
            return (
              <div key={l.id} className="row has-icon lesson-row">
                <span className={cx('lesson-dot', done && 'is-done')} aria-label={done ? 'Completada' : 'Pendiente'}>{done ? <Icon name="check" size={14} strokeWidth={3} /> : null}</span>
                <Link to={`/ingles/leccion/${l.id}`} className="lesson-main">
                  <span className="row-label">{l.topic}</span>
                  <span className="row-sub">{l.title} · {l.minutes} min{isCustom ? ' · creada con IA' : ''}</span>
                </Link>
                {isCustom && (
                  <IconButton icon="trash" label="Eliminar lección" onClick={async () => { if (await confirm({ title: '¿Eliminar esta lección?', confirmLabel: 'Eliminar', danger: true })) await deleteCustomLesson(l.id); }} />
                )}
              </div>
            );
          })}
          {!lessons.length && <p className="home-quiet" style={{ padding: 16 }}>Todavía no hay lecciones de este nivel. Creá una con IA.</p>}
        </div>
      </section>

      <BottomSheet open={sheet === 'settings'} onClose={() => setSheet(null)} title="Inglés">
        <p className="field-label">Tu nivel (MCER)</p>
        <div className="group-body mt-2">
          {LEVELS.map((l) => <SheetAction key={l.id} label={l.label} hint={l.detail} checked={cfg.level === l.id} onClick={() => { void setCfg({ level: l.id }); setViewLevel(l.id); }} />)}
        </div>
        <div className="group-body mt-4">
          <div className="row"><span className="row-main"><span className="row-label">Palabras nuevas por día</span></span><Stepper label="Palabras nuevas" value={cfg.newPerDay} min={3} max={30} onChange={(v) => void setCfg({ newPerDay: v })} /></div>
          <div className="row"><span className="row-main"><span className="row-label">Velocidad de la voz</span></span><Stepper label="Velocidad" value={cfg.rate} min={0.6} max={1.1} step={0.1} onChange={(v) => void setCfg({ rate: v })} format={(v) => `${v.toFixed(1)}×`} /></div>
        </div>
        <p className="field-label mt-6">Sumar a un hábito al completar una sesión</p>
        <div className="group-body mt-2">
          <SheetAction label="Ninguno" checked={!cfg.habitId} onClick={() => void setCfg({ habitId: null })} />
          {snap.habit.filter((h) => !h.isArchived).map((h) => <SheetAction key={h.id} label={h.name} checked={cfg.habitId === h.id} onClick={() => void setCfg({ habitId: h.id })} />)}
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === 'create'} onClose={() => setSheet(null)} title="Crear lección" description={`Una micro-lección completa de nivel ${cfg.level} sobre el tema que quieras.`}>
        {aiProblem() ? (
          <p className="muted">{aiProblem()}</p>
        ) : (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); if (topic.trim()) void create(); }}>
            <input className="input" placeholder="Ej.: negociar con un proveedor, ir al gimnasio" value={topic} onChange={(e) => setTopic(e.target.value)} data-autofocus />
            <div className="chips-wrap">
              {['Hablar con clientes', 'En el aeropuerto', 'Contar una película', 'Small talk'].map((t) => <button key={t} type="button" className="chip" onClick={() => setTopic(t)}>{t}</button>)}
            </div>
            <button type="submit" className="btn btn-primary" disabled={!topic.trim() || busy}>{busy ? <span className="spinner" /> : <Icon name="sparkle" size={18} />} Crear lección</button>
          </form>
        )}
      </BottomSheet>
    </main>
  );
}
