import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon, useFeedback } from '@/components/ui';
import { useSettings, useStore } from '@/hooks/useData';
import { store } from '@/database/store';
import { buildDocs, search, type SearchDoc, type SearchKind } from '@/services/queries';
import { aiProblem, semanticSearch } from '@/services/ai';
import { QUOTES } from '@/services/quotes';
import { formatRelativeDay } from '@/utils/date';
import type { IconName } from '@/components/ui';

const ICON: Record<SearchKind, IconName> = { journal: 'journal', note: 'file', task: 'tasks', reminder: 'bell', habit: 'repeat', quote: 'quote', map: 'mindmap', doc: 'pdf', media: 'library' };
const LABEL: Record<SearchKind, string> = { journal: 'Journal', note: 'Nota', task: 'Tarea', reminder: 'Tarea', habit: 'Hábito', quote: 'Frase', map: 'Mapa', doc: 'PDF', media: 'Biblioteca' };

export function linkFor(d: Pick<SearchDoc, 'kind' | 'id'> & { tags?: string[] }) {
  switch (d.kind) {
    case 'journal': return `/journal/${d.id}/leer`;
    case 'note': return `/biblioteca/nota/${d.id}`;
    case 'task':
    case 'reminder': return '/';
    case 'habit': return `/habitos/${d.id}`;
    case 'map': return `/mapas/${d.id}`;
    case 'doc': return `/pdf/${d.id}`;
    case 'media': return d.tags?.[0] === 'art' ? '/arte' : '/biblioteca';
    default: return '/frases';
  }
}

/** «Buscar o preguntar»: busca en tu contenido y le pregunta a la IA. Solo eso. */
export default function Search() {
  const snap = useStore();
  const [settings] = useSettings();
  const { toast } = useFeedback();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [ai, setAi] = useState<{ answer: string; ids: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const recent = (snap.prefs.recentSearches as string[] | undefined) ?? [];
  const t = q.trim();

  const docs = useMemo(() => buildDocs(snap, QUOTES, 'all'), [snap]);
  const { hits, intent } = useMemo(() => (t ? search(t, docs, settings.weekStartsOn) : { hits: [], intent: null }), [t, docs, settings.weekStartsOn]);

  useEffect(() => {
    if (t.length < 3) return;
    const id = setTimeout(() => void store.setPref('recentSearches', [t, ...recent.filter((r) => r !== t)].slice(0, 8)), 1500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  const ask = () => navigate(`/asistente?send=1&q=${encodeURIComponent(t)}`);

  const meaning = async () => {
    setBusy(true);
    try {
      const index = docs.filter((d) => d.kind !== 'quote').map((d) => ({ id: d.id, type: d.kind, title: d.title, date: d.date ?? '', excerpt: d.body.slice(0, 240) }));
      setAi(await semanticSearch(t, index));
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const aiDocs = ai ? ai.ids.map((id) => docs.find((d) => d.id === id)).filter((d): d is SearchDoc => !!d) : [];
  const problem = aiProblem();

  return (
    <main className="page command">
      <div className="command-top">
      <form className="command-bar" onSubmit={(e) => { e.preventDefault(); if (t && !hits.length && !problem) ask(); }}>
        <Icon name="search" size={19} />
        <input type="search" autoFocus placeholder="Buscar en lo tuyo o preguntar" value={q} onChange={(e) => { setQ(e.target.value); setAi(null); }} enterKeyHint="search" aria-label="Buscar o preguntar" />
        {q && <button type="button" className="command-clear" aria-label="Borrar" onClick={() => setQ('')}><Icon name="x" size={14} strokeWidth={2.4} /></button>}
      </form>
      <button type="button" className="command-cancel" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>Cancelar</button>
      </div>

      {!t ? (
        <>
          <Link to="/asistente" className="ask-card">
            <span className="ask-card-icon"><Icon name="sparkle" size={20} /></span>
            <span className="grow">
              <span className="card-title">Preguntale a la IA</span>
              <span className="card-text">Resumir, organizar, crear tareas o mapas con lo tuyo.</span>
            </span>
            <Icon name="chevronRight" size={18} />
          </Link>

          {recent.length > 0 && (
            <section className="block">
              <div className="block-head">
                <h2>Recientes</h2>
                <button type="button" className="link-btn" onClick={() => void store.setPref('recentSearches', [])}>Borrar todo</button>
              </div>
              <div className="list">
                {recent.slice(0, 8).map((r) => (
                  <div key={r} className="recent-row">
                    <button type="button" className="plain-row grow" onClick={() => setQ(r)}>
                      <Icon name="clock" size={16} /><span className="grow">{r}</span>
                    </button>
                    <button type="button" className="recent-x" aria-label={`Borrar «${r}»`} onClick={() => void store.setPref('recentSearches', recent.filter((x) => x !== r))}>
                      <Icon name="x" size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

        </>
      ) : (
        <>
          {!problem && (
            <button type="button" className="ask-card is-query" onClick={ask}>
              <span className="ask-card-icon"><Icon name="sparkle" size={20} /></span>
              <span className="grow">
                <span className="card-kicker">Preguntar a la IA</span>
                <span className="card-title clamp-2">{t}</span>
              </span>
              <Icon name="arrowRight" size={18} />
            </button>
          )}

          {intent && <p className="group-foot mt-4">Filtrando por fecha: {intent.label.toLowerCase()}</p>}

          {hits.length > 0 && (
            <section className="block">
              <div className="block-head"><h2>En lo tuyo</h2><span className="num">{hits.length}</span></div>
              <div className="list">{hits.map((h) => <Hit key={`${h.kind}-${h.id}`} d={h} snippet={h.snippet} />)}</div>
            </section>
          )}

          {t.length > 2 && !problem && !ai && (
            <button type="button" className="quiet-link" onClick={() => void meaning()} disabled={busy}>
              {busy ? <span className="spinner" /> : null} Buscar por significado
            </button>
          )}

          {ai && (
            <section className="block">
              <div className="block-head"><h2>Por significado</h2></div>
              {ai.answer && <p className="ai-answer">{ai.answer}</p>}
              {aiDocs.length > 0 && <div className="list">{aiDocs.map((d) => <Hit key={`ai-${d.id}`} d={d} />)}</div>}
            </section>
          )}

          {!hits.length && !ai && <p className="quiet mt-6">Nada con esas palabras. Probá preguntarle a la IA o buscar por significado.</p>}
        </>
      )}
    </main>
  );
}

function Hit({ d, snippet }: { d: SearchDoc; snippet?: string }) {
  return (
    <Link to={linkFor(d)} className="plain-row is-hit">
      <Icon name={ICON[d.kind]} size={17} />
      <span className="grow">
        <span className="hit-title clamp-2">{d.title || (snippet ?? d.body).slice(0, 80) || 'Sin título'}</span>
        <span className="hit-sub clamp-2">{LABEL[d.kind]}{d.date ? ` · ${formatRelativeDay(d.date, 'short')}` : ''}{snippet && d.title ? ` — ${snippet}` : ''}</span>
      </span>
    </Link>
  );
}
