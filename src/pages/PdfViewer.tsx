import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { BottomSheet, Icon, IconButton, NavBar, Segmented, SheetAction, useFeedback } from '@/components/ui';
import { useStore } from '@/hooks/useData';
import { store } from '@/database/store';
import { deletePdf, docPages, openPdf, searchDoc } from '@/services/pdf';
import { aiProblem, askDocument, transform } from '@/services/ai';
import { createMapFromText } from '@/services/visual';
import { MAP_TYPES } from '@/services/maps';
import { newNote, saveNote } from '@/services/actions';
import { markdownToHtml } from '@/utils/html';
import { cx } from '@/utils/misc';

type Scope = 'page' | 'all';

export default function PdfViewer() {
  const { id = '' } = useParams();
  const snap = useStore();
  const d = snap.doc.find((x) => x.id === id);
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [missing, setMissing] = useState(false);
  const [page, setPage] = useState(d?.page ?? 1);
  const [sheet, setSheet] = useState<null | 'search' | 'ai' | 'ask' | 'menu'>(null);
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<Scope>('page');
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ title: string; md: string } | null>(null);
  const [chat, setChat] = useState<{ q: string; a: string; quotes: string[] }[]>([]);
  const [question, setQuestion] = useState('');
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    void openPdf(id).then((p) => {
      if (!alive) return;
      if (p) setPdf(p);
      else setMissing(true);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  // Guarda la página de lectura.
  useEffect(() => {
    if (!d || d.page === page) return;
    const t = setTimeout(() => void store.put({ ...d, page }, { touch: false }), 800);
    return () => clearTimeout(t);
  }, [page, d]);

  useEffect(() => {
    if (!pdf || !d?.page || d.page <= 1) return;
    setTimeout(() => document.getElementById(`pdf-p${d.page}`)?.scrollIntoView(), 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf]);

  if (!d) return <main className="page"><NavBar back="/cuaderno" backLabel="Cuaderno" /><p className="muted">No se encontró el documento.</p></main>;

  const pages = docPages(d);
  const scopeText = () => (scope === 'page' ? pages.slice(Math.max(0, page - 2), page + 1).join('\n\n') : d.text).slice(0, 24000);
  const problem = aiProblem();

  const runTransform = async (action: 'summarize' | 'explain' | 'structure', title: string) => {
    setBusy(action);
    try {
      setResult({ title, md: await transform(action, scopeText()) });
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const toMap = async (type: 'mind' | 'concept' | 'system' | 'flow' | 'auto') => {
    setBusy(`map-${type}`);
    try {
      const { map } = await createMapFromText(scopeText(), type, { sourceId: d.id });
      navigate(`/mapas/${map.id}`);
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const saveAsNote = async () => {
    if (!result) return;
    const n = newNote('note');
    n.title = `${result.title}: ${d.title}`;
    n.content = markdownToHtml(result.md);
    n.linkedIds = [d.id];
    await saveNote(n);
    toast('Nota creada', { action: { label: 'Ver', onClick: () => navigate(`/biblioteca/nota/${n.id}`) } });
  };

  const ask = async () => {
    const qq = question.trim();
    if (!qq) return;
    setBusy('ask');
    try {
      const r = await askDocument(qq, d.text);
      setChat((c) => [...c, { q: qq, a: r.answer, quotes: r.quotes }]);
      setQuestion('');
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const hits = sheet === 'search' ? searchDoc(d, q) : [];

  return (
    <main className="pdf-page">
      <NavBar
        back="/cuaderno"
        backLabel="Cuaderno"
        title={<span className="navbar-state">{page} / {d.pages}</span>}
        end={
          <>
            <IconButton icon="search" label="Buscar en el PDF" onClick={() => setSheet('search')} />
            <IconButton icon="more" label="Opciones" onClick={() => setSheet('menu')} />
          </>
        }
      />
      <header className="pdf-head">
        <h1>{d.title}</h1>
        <p className="row-sub">{d.pages} páginas</p>
      </header>

      {missing ? (
        <div className="pdf-text prose">
          <p className="muted small">El archivo original está en otro dispositivo. Acá se muestra el texto extraído.</p>
          {pages.map((t, i) => <section key={i}><p className="pdf-page-num">{i + 1}</p>{t.split('\n\n').map((p, k) => <p key={k}>{p}</p>)}</section>)}
        </div>
      ) : !pdf ? (
        <div className="pdf-loading"><span className="spinner" /></div>
      ) : (
        <div className="pdf-pages" ref={container}>
          {Array.from({ length: pdf.numPages }, (_, i) => <PdfPage key={i} pdf={pdf} n={i + 1} onVisible={setPage} />)}
        </div>
      )}

      <div className="pdf-dock">
        <button type="button" className="cta pdf-ai" onClick={() => setSheet('ai')}>
          <Icon name="sparkle" size={18} className="arrow" /> Estudiar con IA
        </button>
        <button type="button" className="cta pdf-ai" onClick={() => setSheet('ask')}>
          Preguntar <Icon name="arrowRight" size={20} strokeWidth={1.4} className="arrow" />
        </button>
      </div>

      <BottomSheet open={sheet === 'search'} onClose={() => setSheet(null)} title="Buscar en el documento">
        <label className="search-field"><Icon name="search" size={18} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Palabra o frase" data-autofocus /></label>
        {q.trim() && (
          <div className="group-body mt-4">
            {hits.length ? hits.slice(0, 40).map((h) => (
              <button key={h.page} type="button" className="row" onClick={() => { setSheet(null); document.getElementById(`pdf-p${h.page}`)?.scrollIntoView({ behavior: 'smooth' }); }}>
                <span className="step-num">{h.page}</span>
                <span className="row-main"><span className="row-sub">{h.snippet}</span></span>
              </button>
            )) : <p className="home-quiet" style={{ padding: 16 }}>Sin coincidencias.</p>}
          </div>
        )}
      </BottomSheet>

      <BottomSheet open={sheet === 'ai'} onClose={() => { setSheet(null); setResult(null); }} title={result ? result.title : 'Estudiar'} description={result ? undefined : 'Elegí sobre qué parte trabajar.'}>
        {problem ? (
          <p className="muted">{problem} Los mapas se pueden crear igual a partir de la estructura del texto.</p>
        ) : null}
        {!result ? (
          <>
            <Segmented<Scope> label="Alcance" value={scope} onChange={setScope} options={[{ value: 'page', label: `Págs. ${Math.max(1, page - 1)}–${Math.min(d.pages, page + 1)}` }, { value: 'all', label: 'Todo el documento' }]} />
            <div className="group-body mt-4">
              <Action label="Resumir" detail="Ideas principales y conclusiones" busy={busy === 'summarize'} disabled={!!problem} onClick={() => void runTransform('summarize', 'Resumen')} />
              <Action label="Explicar" detail="Como si fueras principiante" busy={busy === 'explain'} disabled={!!problem} onClick={() => void runTransform('explain', 'Explicación')} />
              <Action label="Extraer conceptos" detail="Títulos, listas e ideas clave" busy={busy === 'structure'} disabled={!!problem} onClick={() => void runTransform('structure', 'Conceptos')} />
            </div>
            <p className="field-label mt-6">Convertir en</p>
            <div className="group-body mt-2">
              <Action label="Automático" detail="La IA elige el formato" busy={busy === 'map-auto'} onClick={() => void toMap('auto')} />
              {MAP_TYPES.map((t) => <Action key={t.id} icon={t.icon} label={t.label} detail={t.detail} busy={busy === `map-${t.id}`} onClick={() => void toMap(t.id)} />)}
            </div>
          </>
        ) : (
          <div className="stack">
            <div className="ai-result prose" dangerouslySetInnerHTML={{ __html: markdownToHtml(result.md) }} />
            <button type="button" className="btn btn-primary" onClick={() => void saveAsNote()}>Guardar como nota</button>
            <button type="button" className="btn btn-secondary" onClick={() => setResult(null)}>Otra acción</button>
          </div>
        )}
      </BottomSheet>

      <BottomSheet open={sheet === 'ask'} onClose={() => setSheet(null)} title="Preguntar al documento">
        {problem ? (
          <p className="muted">{problem}</p>
        ) : (
          <div className="stack">
            {chat.map((c, i) => (
              <div key={i} className="qa">
                <p className="qa-q">{c.q}</p>
                <div className="qa-a prose" dangerouslySetInnerHTML={{ __html: markdownToHtml(c.a) }} />
                {c.quotes.slice(0, 2).map((qq, k) => <blockquote key={k} className="qa-quote">«{qq}»</blockquote>)}
              </div>
            ))}
            <form className="chat-input" onSubmit={(e) => { e.preventDefault(); void ask(); }}>
              <input className="input" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="¿Qué dice sobre…?" data-autofocus />
              <button type="submit" className="send-btn" aria-label="Preguntar" disabled={!question.trim() || busy === 'ask'}>{busy === 'ask' ? <span className="spinner" /> : <Icon name="arrowRight" size={20} />}</button>
            </form>
          </div>
        )}
      </BottomSheet>

      <BottomSheet open={sheet === 'menu'} onClose={() => setSheet(null)} title={d.title} hideTitle initialFocus="none">
        <div className="group-body">
          <SheetAction icon={<Icon name="search" size={20} />} label="Buscar en el documento" onClick={() => setSheet('search')} />
          <SheetAction icon={<Icon name="mindmap" size={20} />} label="Crear mapa mental" onClick={() => { setSheet(null); void toMap('mind'); }} />
          <SheetAction icon={<Icon name="trash" size={20} />} label="Eliminar PDF" danger onClick={async () => { setSheet(null); if (await confirm({ title: '¿Eliminar el PDF?', confirmLabel: 'Eliminar', danger: true })) { await deletePdf(d.id); navigate('/biblioteca?tab=pdf', { replace: true }); } }} />
        </div>
      </BottomSheet>
    </main>
  );
}

function Action({ label, detail, onClick, busy, disabled, icon }: { label: string; detail: string; onClick: () => void; busy?: boolean; disabled?: boolean; icon?: 'mindmap' | 'graph' | 'system' | 'flow' }) {
  return (
    <button type="button" className="sheet-action" onClick={onClick} disabled={disabled || busy}>
      {icon && <span className="sheet-action-icon"><Icon name={icon} size={20} /></span>}
      <span className="sheet-action-label">{label}<span className="sheet-action-detail">{detail}</span></span>
      {busy && <span className="spinner" />}
    </button>
  );
}

/** Página renderizada solo cuando entra en pantalla. */
function PdfPage({ pdf, n, onVisible }: { pdf: PDFDocumentProxy; n: number; onVisible: (n: number) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ratio, setRatio] = useState(1.3);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    void pdf.getPage(n).then((p) => {
      const v = p.getViewport({ scale: 1 });
      setRatio(v.height / v.width);
    });
  }, [pdf, n]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio > 0.3) onVisible(n);
          if (e.isIntersecting && !drawn) {
            setDrawn(true);
            void pdf.getPage(n).then((p) => {
              const c = canvas.current;
              if (!c) return;
              const width = el.clientWidth;
              const dpr = Math.min(2.5, window.devicePixelRatio || 1);
              const vp = p.getViewport({ scale: (width / p.getViewport({ scale: 1 }).width) * dpr });
              c.width = vp.width;
              c.height = vp.height;
              void p.render({ canvasContext: c.getContext('2d')!, viewport: vp, canvas: c } as Parameters<typeof p.render>[0]).promise;
            });
          }
        }
      },
      { threshold: [0, 0.3], rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [pdf, n, drawn, onVisible]);

  return (
    <div id={`pdf-p${n}`} ref={wrap} className={cx('pdf-page-box')} style={{ aspectRatio: `1 / ${ratio}` }}>
      <canvas ref={canvas} aria-label={`Página ${n}`} />
    </div>
  );
}
