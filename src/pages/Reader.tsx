import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BottomSheet, Icon, Stepper, Switch, useGoBack } from '@/components/ui';
import { Waveform } from '@/components/ui/Waveform';
import { LinkPicker, RelatedPanel } from '@/components/entries/Related';
import { useAppearance, useStore } from '@/hooks/useData';
import type { ContentFont, ReaderTheme, Weight } from '@/types';
import { formatEntryDate } from '@/utils/date';
import { htmlToText, wordCount } from '@/utils/html';
import { cx } from '@/utils/misc';

const FONTS: { id: ContentFont; label: string; family: string }[] = [
  { id: 'newYork', label: 'New York', family: '-apple-system-ui-serif, ui-serif, "New York", Georgia, serif' },
  { id: 'georgia', label: 'Georgia', family: 'Georgia, serif' },
  { id: 'iowan', label: 'Iowan', family: '"Iowan Old Style", Palatino, Georgia, serif' },
  { id: 'system', label: 'San Francisco', family: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif' },
  { id: 'avenir', label: 'Avenir', family: '"Avenir Next", Avenir, system-ui, sans-serif' },
  { id: 'rounded', label: 'Redondeada', family: 'ui-rounded, "SF Pro Rounded", system-ui, sans-serif' },
];

const THEMES: { id: ReaderTheme; label: string }[] = [
  { id: 'app', label: 'Igual que la app' },
  { id: 'white', label: 'Blanco' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'night', label: 'Noche' },
];

const WEIGHTS: Weight[] = [300, 400, 500, 600];
const WEIGHT_LABEL: Record<Weight, string> = { 300: 'Ligero', 400: 'Normal', 500: 'Medio', 600: 'Semi' };

export default function Reader({ kind }: { kind: 'journal' | 'note' }) {
  const { id = '' } = useParams();
  const snap = useStore();
  const navigate = useNavigate();
  const goBack = useGoBack('/cuaderno');
  const [a, setA] = useAppearance();
  const [barHidden, setBarHidden] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [linking, setLinking] = useState(false);
  const [mode, setMode] = useState<'read' | 'listen'>('read');
  const [speaking, setSpeaking] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [progress, setProgress] = useState(0);
  const [spoken, setSpoken] = useState(0);
  const [voiceName, setVoiceName] = useState('');
  const lastY = useRef(0);
  const [panel, setPanel] = useState(false);
  const [indexOpen, setIndexOpen] = useState(false);
  const [dim, setDim] = useState(0);
  const [find, setFind] = useState<string | null>(null);
  const [heads, setHeads] = useState<{ id: string; text: string; level: number }[]>([]);
  const prose = useRef<HTMLDivElement>(null);

  const doc = kind === 'journal' ? snap.journal.find((e) => e.id === id) : snap.note.find((n) => n.id === id);
  const text = useMemo(() => (doc ? htmlToText(doc.content, `${doc.id}:${doc.updatedAt}`) : ''), [doc]);
  const minutes = Math.max(1, Math.round(wordCount(text) / 220));

  // Oculta la barra al bajar y la muestra al subir (como Libros).
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, y / max) : 1);
      if (Math.abs(y - lastY.current) < 12) return;
      if (y > lastY.current && y > 120) setBarHidden(true);
      else if (y < lastY.current) setBarHidden(false);
      lastY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  // Índice: los títulos del texto.
  useEffect(() => {
    const el = prose.current;
    if (!el) return;
    const hs = [...el.querySelectorAll('h1, h2, h3')] as HTMLElement[];
    hs.forEach((h, i) => (h.id = `h-${i}`));
    setHeads(hs.map((h, i) => ({ id: `h-${i}`, text: h.textContent?.trim() || 'Sección', level: Number(h.tagName[1]) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, id]);

  const jump = (hid: string | null) => {
    setIndexOpen(false);
    if (!hid) return window.scrollTo({ top: 0, behavior: 'smooth' });
    document.getElementById(hid)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const findNext = (q: string) => {
    if (!q.trim()) return;
    const w = window as unknown as { find?: (s: string, cs?: boolean, back?: boolean, wrap?: boolean) => boolean };
    if (w.find && !w.find(q, false, false, true)) setFind(q);
  };

  // Exportar como PDF: usa la impresión del sistema («Guardar como PDF» en iOS y escritorio).
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get('imprimir') && doc) {
      setParams({}, { replace: true });
      setTimeout(() => window.print(), 400);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, doc]);

  const listen = () => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (speaking === 'playing') {
      synth.pause();
      setSpeaking('paused');
      return;
    }
    if (speaking === 'paused') {
      synth.resume();
      setSpeaking('playing');
      return;
    }
    synth.cancel();
    const title = doc?.title ? `${doc.title}. ` : '';
    // iOS corta los textos largos: se lee por párrafos.
    const parts = (title + text).split(/\n+/).map((s) => s.trim()).filter(Boolean);
    const voice = synth.getVoices().find((v) => v.lang.startsWith('es-AR')) ?? synth.getVoices().find((v) => v.lang.startsWith('es'));
    setVoiceName(voice?.name ?? 'Voz del sistema');
    setSpoken(0);
    parts.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p);
      u.lang = voice?.lang ?? 'es-ES';
      if (voice) u.voice = voice;
      u.rate = 1;
      u.onstart = () => setSpoken(i / parts.length);
      if (i === parts.length - 1) u.onend = () => { setSpeaking('idle'); setSpoken(1); };
      synth.speak(u);
    });
    setSpeaking('playing');
  };

  const setModeAndAct = (m: 'read' | 'listen') => {
    setMode(m);
    if (m === 'listen') listen();
    else {
      window.speechSynthesis?.cancel();
      setSpeaking('idle');
    }
  };

  if (!doc) {
    return (
      <main className="page">
        <p className="muted" style={{ paddingTop: 80 }}>No se encontró el documento.</p>
      </main>
    );
  }

  const editPath = kind === 'journal' ? `/journal/${doc.id}` : `/biblioteca/nota/${doc.id}`;
  const dateLabel = doc.kind === 'journal' ? formatEntryDate(doc.entryDate) : formatEntryDate(doc.updatedAt.slice(0, 10));

  return (
    <main className="reader" data-reader={a.readerTheme}>
      <div className="reader-progress" style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />
      <header className={cx('reader-top', barHidden && 'is-hidden')}>
        <button type="button" className="capsule reader-round" aria-label="Volver" onClick={goBack}>
          <Icon name="chevronLeft" size={22} strokeWidth={2.2} />
        </button>
        <span className="hstack" style={{ pointerEvents: 'auto' }}>
          <button type="button" className="capsule reader-round" aria-label="Editar" onClick={() => navigate(editPath)}>
            <Icon name="pencil" size={19} />
          </button>
          <button type="button" className="capsule reader-round" aria-label="Exportar como PDF" onClick={() => window.print()}>
            <Icon name="share" size={18} />
          </button>
        </span>
      </header>

      <article className="reader-article">
        <p className="reader-meta">{dateLabel} · {minutes} min de lectura</p>
        {doc.title && <h1 className="reader-title">{doc.title}</h1>}
        <div ref={prose} className="prose reader-prose" dangerouslySetInnerHTML={{ __html: doc.content }} />
        <p className="reader-end" aria-hidden="true">·</p>
        <RelatedPanel id={doc.id} onLink={() => setLinking(true)} />
      </article>
      <LinkPicker open={linking} onClose={() => setLinking(false)} fromId={doc.id} />

      <div className="reader-dim" style={{ opacity: dim }} aria-hidden="true" />

      {mode === 'listen' && (
        <div className="float-card listen-float" role="region" aria-label="Escuchar">
          <div className="float-card-head">
            <span className="float-card-kicker"><Icon name="headphones" size={14} /> {voiceName || 'Voz del sistema'}</span>
            <button type="button" className="float-x" aria-label="Dejar de escuchar" onClick={() => setModeAndAct('read')}><Icon name="x" size={14} strokeWidth={2.4} /></button>
          </div>
          <div className="listen-row">
            <button type="button" className="play-disc is-light" aria-label={speaking === 'playing' ? 'Pausar' : 'Reproducir'} onClick={listen}>
              <Icon name={speaking === 'playing' ? 'pause' : 'play'} size={16} filled strokeWidth={0} />
            </button>
            <Waveform seed={doc.id} bars={40} progress={speaking === 'idle' && spoken < 1 ? 0 : spoken} />
          </div>
        </div>
      )}

      {indexOpen && (
        <>
          <button type="button" className="scrim" aria-label="Cerrar índice" onClick={() => setIndexOpen(false)} />
          <nav className="float-card index-card" aria-label="Índice">
            <button type="button" className="index-item" onClick={() => jump(null)}>Principio</button>
            {heads.map((h) => (
              <button key={h.id} type="button" className={cx('index-item', h.level > 2 && 'is-sub')} onClick={() => jump(h.id)}>{h.text}</button>
            ))}
            {!heads.length && <p className="index-empty">Los títulos del texto aparecen acá.</p>}
          </nav>
        </>
      )}

      {panel && (
        <>
          <button type="button" className="scrim" aria-label="Cerrar" onClick={() => { setPanel(false); setFind(null); }} />
          <div className="float-card reader-panel" role="dialog" aria-label="Opciones de lectura">
            <div className="rp-main">
              <div className="rp-themes" role="radiogroup" aria-label="Tema">
                {THEMES.map((t) => (
                  <button key={t.id} type="button" role="radio" aria-checked={a.readerTheme === t.id} className={cx('theme-dot', `is-${t.id}`)} aria-label={t.label} onClick={() => void setA({ readerTheme: t.id })} />
                ))}
              </div>
              <button type="button" className="rp-row" onClick={() => { setPanel(false); setModeAndAct(mode === 'listen' ? 'read' : 'listen'); }}>
                <Icon name="headphones" size={18} /><span className="grow">Voz</span><span className="rp-val">{mode === 'listen' ? 'Parar' : 'Escuchar'}</span>
              </button>
              <button type="button" className="rp-row" onClick={() => { setPanel(false); setSettingsOpen(true); }}>
                <Icon name="type" size={18} /><span className="grow">Texto</span><span className="rp-val">Personalizar</span>
              </button>
              {find === null ? (
                <button type="button" className="rp-row" onClick={() => setFind('')}>
                  <Icon name="search" size={18} /><span className="grow">Buscar</span>
                </button>
              ) : (
                <form className="rp-row is-input" onSubmit={(e) => { e.preventDefault(); findNext(find); }}>
                  <Icon name="search" size={18} />
                  <input autoFocus value={find} onChange={(e) => setFind(e.target.value)} placeholder="Buscar en el texto" enterKeyHint="search" aria-label="Buscar en el texto" />
                </form>
              )}
            </div>
            <div className="rp-sliders">
              <VSlider label="Tamaño del texto" icon="textSize" value={a.fontSize} min={13} max={28} onChange={(v) => void setA({ fontSize: v })} />
              <VSlider label="Brillo" icon="sun" value={Math.round((1 - dim / 0.6) * 100)} min={0} max={100} onChange={(v) => setDim(((100 - v) / 100) * 0.6)} />
            </div>
          </div>
        </>
      )}

      <div className={cx('reader-dock', barHidden && !indexOpen && !panel && 'is-quiet')}>
        <button type="button" className="index-pill" onClick={() => setIndexOpen((v) => !v)} aria-expanded={indexOpen}>
          <span>Índice</span>
          <Icon name="chevronDown" size={14} strokeWidth={2.2} />
          <span className="index-sep" aria-hidden="true" />
          <Ring value={progress} />
          <span className="num">{Math.round(progress * 100)}%</span>
        </button>
        <button type="button" className="index-pill is-round" aria-label="Opciones de lectura" aria-expanded={panel} onClick={() => setPanel((v) => !v)}>
          <span className="aa">Aa</span>
        </button>
      </div>

      <BottomSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Texto" initialFocus="none" className="reader-sheet">
        <div className="reader-preview" data-reader={a.readerTheme}>
          <p className="prose">
            <b>La constancia gana.</b> Pocas líneas por día, releídas con calma, terminan diciendo más de lo que parecía.
          </p>
        </div>

        <div className="font-tiles" role="radiogroup" aria-label="Fuente">
          {FONTS.map((f) => (
            <button key={f.id} type="button" role="radio" aria-checked={a.font === f.id} className="font-tile" onClick={() => void setA({ font: f.id, preset: 'custom' })}>
              <span className="font-tile-aa" style={{ fontFamily: f.family }}>Aa</span>
              <span className="font-tile-name">{f.label}</span>
            </button>
          ))}
        </div>

        <p className="field-label mt-6">Tipografía</p>
        <div className="group-body mt-2">
          <div className="row">
            <span className="row-main"><span className="row-label">Tamaño</span></span>
            <Stepper label="Tamaño" value={a.fontSize} min={13} max={28} onChange={(v) => void setA({ fontSize: v })} format={(v) => `${v}pt`} />
          </div>
          <div className="row">
            <span className="row-main"><span className="row-label">Interlineado</span></span>
            <Stepper label="Interlineado" value={a.lineHeight} min={1.3} max={2.2} step={0.05} onChange={(v) => void setA({ lineHeight: v })} format={(v) => v.toFixed(2)} />
          </div>
          <div className="row">
            <span className="row-main"><span className="row-label">Peso</span></span>
            <Stepper
              label="Peso"
              value={WEIGHTS.indexOf(a.weight)}
              min={0}
              max={3}
              onChange={(i) => void setA({ weight: WEIGHTS[i] })}
              format={(i) => WEIGHT_LABEL[WEIGHTS[i]]}
            />
          </div>
          <div className="row">
            <span className="row-main"><span className="row-label">Ancho de columna</span></span>
            <Stepper
              label="Ancho"
              value={['narrow', 'medium', 'wide'].indexOf(a.editorWidth)}
              min={0}
              max={2}
              onChange={(i) => void setA({ editorWidth: (['narrow', 'medium', 'wide'] as const)[i] })}
              format={(i) => ['Angosto', 'Medio', 'Ancho'][i]}
            />
          </div>
          <div className="row">
            <span className="row-main"><span className="row-label">Ligaduras</span></span>
            <Switch label="Ligaduras" checked={a.ligatures} onChange={(v) => void setA({ ligatures: v })} />
          </div>
        </div>

        <p className="field-label mt-6">Alineación</p>
        <div className="align-cards mt-2" role="radiogroup" aria-label="Alineación">
          {[false, true].map((j) => (
            <button key={String(j)} type="button" role="radio" aria-checked={a.justify === j} className="align-card" onClick={() => void setA({ justify: j })}>
              <span className={cx('align-glyph', j && 'is-justify')} aria-hidden="true"><i /><i /><i /><i /></span>
              <span>{j ? 'Justificado' : 'Normal'}</span>
            </button>
          ))}
        </div>
      </BottomSheet>
    </main>
  );
}

function Ring({ value }: { value: number }) {
  const r = 7;
  const c = 2 * Math.PI * r;
  return (
    <svg className="ring" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r={r} className="ring-track" />
      <circle cx="9" cy="9" r={r} className="ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - value)} />
    </svg>
  );
}

/** Deslizador vertical como el de Libros: se arrastra en toda la altura. */
function VSlider({ label, icon, value, min, max, onChange }: { label: string; icon: 'textSize' | 'sun'; value: number; min: number; max: number; onChange: (v: number) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const pct = (value - min) / (max - min);
  const fromY = (y: number) => {
    const r = el.current!.getBoundingClientRect();
    const t = 1 - Math.min(1, Math.max(0, (y - r.top) / r.height));
    onChange(Math.round(min + t * (max - min)));
  };
  return (
    <div
      ref={el}
      className="vslider"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-orientation="vertical"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); fromY(e.clientY); }}
      onPointerMove={(e) => { if (e.buttons) fromY(e.clientY); }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') onChange(Math.min(max, value + 1));
        if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') onChange(Math.max(min, value - 1));
      }}
    >
      <span className="vslider-fill" style={{ transform: `scaleY(${pct})` }} />
      <Icon name={icon} size={18} className="vslider-icon" />
    </div>
  );
}
