import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BottomSheet, Empty, Icon, IconButton, SheetAction, useFeedback, type IconName } from '@/components/ui';
import { useStore, useToday } from '@/hooks/useData';
import { newMap, saveMap } from '@/services/maps';
import { createMapFromText } from '@/services/visual';
import { deleteFolder, saveFolder } from '@/services/actions';
import { importPdf } from '@/services/pdf';
import { excerpt, htmlToText, normalize } from '@/utils/html';
import { MONTHS, capitalize, parseISODate, WEEKDAYS } from '@/utils/date';

interface Item {
  id: string;
  kind: 'journal' | 'note' | 'idea' | 'link' | 'map' | 'pdf';
  title: string;
  text: string;
  date: string;
  path: string;
  pinned?: boolean;
  folderId?: string | null;
}

const KIND: Record<Item['kind'], { icon: IconName; label: string }> = {
  journal: { icon: 'journal', label: 'Journal' },
  note: { icon: 'file', label: 'Nota' },
  idea: { icon: 'idea', label: 'Idea' },
  link: { icon: 'link', label: 'Enlace' },
  map: { icon: 'mindmap', label: 'Mapa' },
  pdf: { icon: 'pdf', label: 'PDF' },
};

/**
 * «Cuaderno»: todo lo que escribís en una sola lista (journal, notas, ideas,
 * enlaces, mapas y PDFs). Sin filtros: se busca escribiendo.
 */
export default function Notebook() {
  const snap = useStore();
  const today = useToday();
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const [params, setParams] = useSearchParams();
  const folderId = params.get('carpeta');
  const archived = params.get('archivo') === '1';
  const [q, setQ] = useState('');
  const [sheet, setSheet] = useState<null | 'new' | 'folders' | 'maptext' | 'folder'>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const folder = folderId ? snap.folder.find((f) => f.id === folderId) : null;

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    if (!folderId && !archived) {
      for (const e of snap.journal) out.push({ id: e.id, kind: 'journal', title: e.title || '', text: excerpt(e.content, `${e.id}:${e.updatedAt}`, 140), date: e.entryDate, path: `/journal/${e.id}/leer` });
      for (const m of snap.map) out.push({ id: m.id, kind: 'map', title: m.title, text: `${m.nodes.length} ideas`, date: m.updatedAt.slice(0, 10), path: `/mapas/${m.id}` });
      for (const d of snap.doc) out.push({ id: d.id, kind: 'pdf', title: d.title, text: `${d.pages} páginas`, date: d.createdAt.slice(0, 10), path: `/pdf/${d.id}` });
    }
    for (const n of snap.note) {
      if (n.isArchived !== archived) continue;
      if (folderId && n.folderId !== folderId) continue;
      const kind = n.noteType === 'idea' ? 'idea' : n.noteType === 'link' ? 'link' : 'note';
      out.push({ id: n.id, kind, title: n.title || '', text: (n.noteType === 'link' && n.url) || excerpt(n.content, `${n.id}:${n.updatedAt}`, 140), date: n.updatedAt.slice(0, 10), path: `/biblioteca/nota/${n.id}`, pinned: n.isPinned, folderId: n.folderId });
    }
    const nq = normalize(q.trim());
    const filtered = nq
      ? out.filter((i) => {
          const rec = snap.note.find((n) => n.id === i.id) ?? snap.journal.find((j) => j.id === i.id);
          const full = rec && 'content' in rec ? htmlToText(rec.content, `${rec.id}:${rec.updatedAt}`) : '';
          return normalize(`${i.title} ${i.text} ${full} ${rec && 'tags' in rec ? rec.tags.join(' ') : ''}`).includes(nq);
        })
      : out;
    return filtered.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.date.localeCompare(a.date));
  }, [snap.journal, snap.note, snap.map, snap.doc, q, folderId, archived]);

  const groups = useMemo(() => {
    const g: { key: string; label: string; items: Item[] }[] = [];
    for (const it of items) {
      const key = it.pinned ? 'pinned' : it.date.slice(0, 7);
      let cur = g.find((x) => x.key === key);
      if (!cur) {
        const d = parseISODate(it.date);
        cur = { key, label: it.pinned ? 'Fijadas' : `${capitalize(MONTHS[d.getMonth()])}${it.date.slice(0, 4) === today.slice(0, 4) ? '' : ` ${d.getFullYear()}`}`, items: [] };
        g.push(cur);
      }
      cur.items.push(it);
    }
    return g;
  }, [items, today]);

  const archivedCount = snap.note.filter((n) => n.isArchived).length;
  const title = folder ? folder.name : archived ? 'Archivo' : 'Cuaderno';
  const sub = folderId || archived;

  return (
    <main className="page notebook">
      <header className="today-head">
        {sub && <IconButton icon="arrowLeft" label="Volver" tone="filled" onClick={() => setParams({}, { replace: true })} />}
        <h1 className="today-title grow">{title}</h1>
        {folder && <IconButton icon="more" label="Carpeta" tone="filled" onClick={() => { setFolderName(folder.name); setSheet('folder'); }} />}
        {!archived && <IconButton icon="plus" label="Nuevo" tone="filled" onClick={() => setSheet('new')} />}
      </header>

      <label className="search-field">
        <Icon name="search" size={18} />
        <input type="search" placeholder={folder ? `Buscar en ${folder.name}` : 'Buscar en lo que escribiste'} value={q} onChange={(e) => setQ(e.target.value)} />
      </label>

      {progress !== null && <div className="import-progress"><span>Leyendo el PDF… {Math.round(progress * 100)}%</span><i style={{ transform: `scaleX(${progress})` }} /></div>}

      {!items.length ? (
        q ? <Empty title="Sin resultados" message="Probá otras palabras, o buscá por significado desde la lupa." />
          : <Empty title="Tu cuaderno está vacío" message="Todo lo que escribas vive acá: el journal, notas, ideas, enlaces, mapas y PDFs." action={<button type="button" className="btn btn-primary" onClick={() => navigate('/journal/hoy')}>Escribir sobre hoy</button>} />
      ) : (
        groups.map((g) => (
          <section key={g.key} className="nb-group">
            <h2 className="nb-month">{g.label}</h2>
            <ol className="nb-list">
              {g.items.map((it) => {
                const d = parseISODate(it.date);
                return (
                  <li key={`${it.kind}-${it.id}`}>
                    <Link to={it.path} className="nb-item">
                      <span className="nb-date">
                        <span className="nb-day num">{d.getDate()}</span>
                        <span className="nb-wd">{WEEKDAYS[d.getDay()].slice(0, 3)}</span>
                      </span>
                      <span className="nb-body">
                        <span className="nb-title">{it.title || (it.kind === 'journal' ? 'Journal' : 'Sin título')}</span>
                        {it.text && <span className="nb-text clamp-2">{it.text}</span>}
                      </span>
                      <Icon name={KIND[it.kind].icon} size={16} className="nb-kind" aria-label={KIND[it.kind].label} />
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
        ))
      )}

      {!sub && items.length > 0 && (
        <div className="nb-foot">
          <button type="button" onClick={() => setSheet('folders')}><Icon name="folder" size={16} /> Carpetas{snap.folder.length ? ` · ${snap.folder.length}` : ''}</button>
          {archivedCount > 0 && <button type="button" onClick={() => setParams({ archivo: '1' })}><Icon name="archive" size={16} /> Archivo · {archivedCount}</button>}
        </div>
      )}

      <BottomSheet open={sheet === 'new'} onClose={() => setSheet(null)} title="Nuevo" hideTitle initialFocus="none">
        <div className="new-grid">
          {([
            ['journal', 'Journal de hoy', () => navigate('/journal/hoy')],
            ['file', 'Nota', () => navigate(`/biblioteca/nota/nueva?tipo=note${folderId ? `&carpeta=${folderId}` : ''}`)],
            ['idea', 'Idea', () => navigate(`/biblioteca/nota/nueva?tipo=idea${folderId ? `&carpeta=${folderId}` : ''}`)],
            ['link', 'Enlace', () => navigate(`/biblioteca/nota/nueva?tipo=link${folderId ? `&carpeta=${folderId}` : ''}`)],
            ['mindmap', 'Mapa', async () => { const m = newMap('mind', 'Idea central'); await saveMap(m); navigate(`/mapas/${m.id}`); }],
            ['wand', 'Mapa de un texto', () => setSheet('maptext')],
            ['pdf', 'PDF', () => { setSheet(null); file.current?.click(); }],
          ] as [IconName, string, () => void][]).map(([icon, label, fn]) => (
            <button key={label} type="button" className="new-tile" onClick={fn}>
              <span className="new-tile-icon"><Icon name={icon} size={22} /></span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === 'folders'} onClose={() => setSheet(null)} title="Carpetas">
        <div className="group-body">
          {[...snap.folder].sort((a, b) => a.name.localeCompare(b.name, 'es')).map((f) => (
            <SheetAction key={f.id} icon={<Icon name="folder" size={20} />} label={f.name} hint={String(snap.note.filter((n) => n.folderId === f.id && !n.isArchived).length)} onClick={() => { setSheet(null); setParams({ carpeta: f.id }); }} />
          ))}
        </div>
        <form className="hstack mt-4" onSubmit={async (e) => { e.preventDefault(); if (!folderName.trim()) return; await saveFolder(folderName.trim()); setFolderName(''); }}>
          <input className="input grow" placeholder="Nueva carpeta" value={folderName} onChange={(e) => setFolderName(e.target.value)} />
          <button type="submit" className="btn btn-secondary" disabled={!folderName.trim()}>Crear</button>
        </form>
        <p className="group-foot">Para mover una nota, abrila y elegí la carpeta en sus opciones.</p>
      </BottomSheet>

      <BottomSheet open={sheet === 'folder'} onClose={() => setSheet(null)} title="Carpeta">
        <form className="stack" onSubmit={async (e) => { e.preventDefault(); if (folder && folderName.trim()) { await saveFolder(folderName.trim(), folder.id); setSheet(null); } }}>
          <input className="input" value={folderName} onChange={(e) => setFolderName(e.target.value)} aria-label="Nombre" />
          <button type="submit" className="btn btn-primary" disabled={!folderName.trim()}>Renombrar</button>
          <button type="button" className="btn btn-ghost danger-text" onClick={async () => {
            if (!folder || !(await confirm({ title: `¿Eliminar «${folder.name}»?`, message: 'Las notas no se borran: quedan sin carpeta.', confirmLabel: 'Eliminar', danger: true }))) return;
            await deleteFolder(folder.id);
            setSheet(null);
            setParams({}, { replace: true });
          }}>Eliminar carpeta</button>
        </form>
      </BottomSheet>

      <BottomSheet open={sheet === 'maptext'} onClose={() => setSheet(null)} title="Mapa de un texto" description="Pegá apuntes o un proceso: se arma el mapa con el formato que mejor le quede.">
        <div className="stack">
          <textarea className="textarea" rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder="Pegá un texto, apuntes de clase, un proceso…" data-autofocus />
          <button type="button" className="btn btn-primary" disabled={text.trim().length < 20 || busy} onClick={async () => {
            setBusy(true);
            try {
              const { map } = await createMapFromText(text, 'auto');
              setText('');
              navigate(`/mapas/${map.id}`);
            } catch (err) {
              toast((err as Error).message, { tone: 'error' });
            } finally {
              setBusy(false);
            }
          }}>{busy ? <span className="spinner" /> : null} Crear mapa</button>
        </div>
      </BottomSheet>

      <input
        ref={file}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setProgress(0);
          try {
            const d = await importPdf(f, setProgress);
            navigate(`/pdf/${d.id}`);
          } catch (err) {
            console.error(err);
            toast('No se pudo leer el PDF.', { tone: 'error' });
          } finally {
            setProgress(null);
          }
        }}
      />
    </main>
  );
}
