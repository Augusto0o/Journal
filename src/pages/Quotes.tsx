import { Icon, NavBar, useFeedback } from '@/components/ui';
import { useStore, useToday } from '@/hooks/useData';
import { store } from '@/database/store';
import { PREF } from '@/services/prefs';
import { quoteId, quoteOfDay, QUOTES } from '@/services/quotes';
import { cx } from '@/utils/misc';

export default function Quotes() {
  const snap = useStore();
  const today = useToday();
  const { toast } = useFeedback();
  const favs = (snap.prefs[PREF.favoriteQuotes] as string[] | undefined) ?? [];
  const todayQ = quoteOfDay(today);
  const list = QUOTES.filter((q) => quoteId(q) !== quoteId(todayQ));

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


      {[{ title: 'Guardadas', items: list.filter((q) => favs.includes(quoteId(q))) }, { title: 'Más frases', items: list.filter((q) => !favs.includes(quoteId(q))) }].filter((g) => g.items.length).map((g) => (
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
    </main>
  );
}
