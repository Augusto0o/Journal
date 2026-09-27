import { useMemo, useState } from 'react';
import { BottomSheet, Icon, NavBar, SheetAction, useFeedback } from '@/components/ui';
import { normalize } from '@/utils/html';
import { useStore, useToday } from '@/hooks/useData';
import { store } from '@/database/store';
import { PREF } from '@/services/prefs';
import { quoteAuthors, quoteId, quoteOfDay, QUOTES } from '@/services/quotes';
import { cx } from '@/utils/misc';

export default function Quotes() {
  const snap = useStore();
  const today = useToday();
  const { toast } = useFeedback();
  const favs = (snap.prefs[PREF.favoriteQuotes] as string[] | undefined) ?? [];
  const todayQ = quoteOfDay(today);
  const [q, setQ] = useState('');
  const [author, setAuthor] = useState<string | null>(null);
  const [authorsOpen, setAuthorsOpen] = useState(false);
  const authors = useMemo(() => quoteAuthors(), []);
  const nq = normalize(q.trim());
  const filtering = !!nq || !!author;
  const list = QUOTES.filter((x) => (filtering || quoteId(x) !== quoteId(todayQ)) && (!author || x.author === author) && (!nq || normalize(`${x.text} ${x.author}`).includes(nq)));

  const toggleFav = (id: string) => void store.setPref(PREF.favoriteQuotes, favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id]);

  return (
    <main className="page">
      <NavBar back="/" backLabel="Hoy" title="Frases" />
      <article className="quote-today">
        <p className="home-label">Frase del día</p>
        <blockquote className="serif">“{todayQ.text}”</blockquote>
        <p className="quote-author">{todayQ.author}</p>
        <p className="quote-context">{todayQ.context}</p>
        <p className="quote-meaning">{todayQ.meaning}</p>
        <div className="hstack mt-4">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => toggleFav(quoteId(todayQ))}>
            <Icon name="star" size={16} filled={favs.includes(quoteId(todayQ))} strokeWidth={favs.includes(quoteId(todayQ)) ? 0 : 1.75} />
            {favs.includes(quoteId(todayQ)) ? 'Guardada' : 'Guardar'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { await navigator.clipboard?.writeText(`“${todayQ.text}” — ${todayQ.author}`); toast('Copiada'); }}>Copiar</button>
        </div>
      </article>


      <div className="quote-tools">
        <label className="search-field grow">
          <Icon name="search" size={18} />
          <input type="search" placeholder="Buscar frase o autor" aria-label={`Buscar entre ${QUOTES.length} frases`} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <button type="button" className="pill-btn" onClick={() => setAuthorsOpen(true)}><Icon name="user" size={16} /> Escritores</button>
      </div>
      {author && (
        <button type="button" className="author-filter" onClick={() => setAuthor(null)}>
          {author} · {list.length} <Icon name="x" size={14} strokeWidth={2.4} />
        </button>
      )}
      {filtering && !list.length && <p className="quiet mt-6">No hay frases con esa búsqueda.</p>}

      {[{ title: 'Guardadas', items: list.filter((q) => favs.includes(quoteId(q))) }, { title: filtering ? `${list.length} ${list.length === 1 ? 'frase' : 'frases'}` : 'Más frases', items: list.filter((q) => !favs.includes(quoteId(q))) }].filter((g) => g.items.length).map((g) => (
      <section key={g.title} className="block">
      <div className="block-head"><h2>{g.title}</h2></div>
      <ol className="quote-list">
        {g.items.map((q) => (
          <li key={quoteId(q)}>
            <details className="quote-item">
              <summary>
                <span className="serif">“{q.text}”</span>
                <span className="quote-author">{q.author}</span>
              </summary>
              <p className="quote-context">{q.context}</p>
              <p className="quote-meaning">{q.meaning}</p>
              <button type="button" className={cx('link-btn', favs.includes(quoteId(q)) && 'is-on')} onClick={() => toggleFav(quoteId(q))}>
                {favs.includes(quoteId(q)) ? 'Quitar de guardadas' : 'Guardar'}
              </button>
            </details>
          </li>
        ))}
      </ol>
      </section>
      ))}
      <BottomSheet open={authorsOpen} onClose={() => setAuthorsOpen(false)} title={`Escritores · ${authors.length}`}>
        <div className="group-body">
          {authors.map((a) => (
            <SheetAction key={a.name} icon={<Icon name="user" size={18} />} label={a.name} hint={String(a.count)} onClick={() => { setAuthor(a.name); setQ(''); setAuthorsOpen(false); }} />
          ))}
        </div>
      </BottomSheet>
    </main>
  );
}
