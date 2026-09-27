import { useMemo, useState } from 'react';
import { BottomSheet, Empty, Icon, IconButton, NavBar, useFeedback } from '@/components/ui';
import { SpeakButton } from '@/components/english/speech';
import { useEnglishSettings, useStore, useToday } from '@/hooks/useData';
import { addCard, deleteCard } from '@/services/english';
import { formatRelativeDay } from '@/utils/date';
import { normalize } from '@/utils/html';

export default function Words() {
  const snap = useStore();
  const today = useToday();
  const [cfg] = useEnglishSettings();
  const { toast, confirm } = useFeedback();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ en: '', es: '', example: '' });

  const list = useMemo(() => {
    const n = normalize(q.trim());
    return [...snap.card].filter((c) => !n || normalize(`${c.en} ${c.es}`).includes(n)).sort((a, b) => a.en.localeCompare(b.en, 'en'));
  }, [snap.card, q]);

  return (
    <main className="page">
      <NavBar back="/ingles" backLabel="Inglés" title="Mis palabras" end={<IconButton icon="plus" label="Agregar palabra" onClick={() => setOpen(true)} />} />
      <label className="search-field mt-4"><Icon name="search" size={18} /><input type="search" placeholder="Buscar en inglés o español" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      {!list.length ? (
        <Empty title={q ? 'Sin resultados' : 'Todavía no hay palabras'} message={q ? undefined : 'Se agregan solas al terminar cada lección. También podés sumar las tuyas.'} />
      ) : (
        <section className="group">
          <h2 className="group-title"><span>{list.length} palabras</span></h2>
          <div className="group-body">
            {list.map((c) => (
              <div key={c.id} className="row vocab-row">
                <span className="row-main">
                  <span className="vocab-en">{c.en}</span>
                  <span className="vocab-es">{c.es}</span>
                  <span className="vocab-ex">{c.reps === 0 ? 'Nueva' : c.due <= today ? 'Para repasar hoy' : `Próximo repaso: ${formatRelativeDay(c.due, 'short').toLowerCase()}`}{c.interval >= 21 ? ' · dominada' : ''}</span>
                </span>
                <SpeakButton text={c.en} size="sm" />
                <IconButton icon="trash" label={`Eliminar ${c.en}`} onClick={async () => { if (await confirm({ title: `¿Eliminar «${c.en}»?`, confirmLabel: 'Eliminar', danger: true })) await deleteCard(c.id); }} />
              </div>
            ))}
          </div>
        </section>
      )}
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Nueva palabra">
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await addCard(form, cfg.level);
            toast(ok ? 'Agregada al repaso' : 'Esa palabra ya está en tu mazo');
            if (ok) {
              setForm({ en: '', es: '', example: '' });
              setOpen(false);
            }
          }}
        >
          <input className="input" placeholder="En inglés — «look forward to»" autoCapitalize="none" value={form.en} onChange={(e) => setForm({ ...form, en: e.target.value })} data-autofocus />
          <input className="input" placeholder="En español" value={form.es} onChange={(e) => setForm({ ...form, es: e.target.value })} />
          <input className="input" placeholder="Ejemplo (opcional)" autoCapitalize="none" value={form.example} onChange={(e) => setForm({ ...form, example: e.target.value })} />
          <button type="submit" className="btn btn-primary" disabled={!form.en.trim() || !form.es.trim()}>Agregar</button>
        </form>
      </BottomSheet>
    </main>
  );
}
