import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BottomSheet, Icon, useFeedback } from '@/components/ui';
import { store } from '@/database/store';
import { useStore } from '@/hooks/useData';
import { buildGraph, KIND_HUE, KIND_LABEL, related } from '@/services/graph';
import type { AnyRecord } from '@/types';
import { normalize } from '@/utils/html';

/** «Relacionado»: navegación por el grafo desde cualquier contenido. */
export function RelatedPanel({ id, onLink }: { id: string; onLink?: () => void }) {
  const snap = useStore();
  const rel = useMemo(() => related(snap, id, 6), [snap, id]);
  // Sin conexiones no se muestra nada (vincular está en el menú de opciones).
  if (!rel.length) return null;
  return (
    <section className="related">
      <div className="spread">
        <h2 className="related-title">Relacionado</h2>
        {onLink && <button type="button" className="link-btn" onClick={onLink}>Vincular</button>}
      </div>
      {rel.length ? (
        <ul>
          {rel.map((r) => (
            <li key={r.node.id}>
              <Link to={r.node.path} className="related-item">
                <i className="legend-dot" style={{ background: `oklch(0.62 0.13 ${KIND_HUE[r.node.kind]})` }} />
                <span className="grow"><span className="related-label">{r.node.label}</span><span className="row-sub">{KIND_LABEL[r.node.kind]} · {r.reason}</span></span>
                <Icon name="arrowRight" size={16} strokeWidth={1.5} className="faint" />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** Agrega un enlace explícito entre dos contenidos. */
export async function addLink(fromId: string, toId: string) {
  const r = store.raw(fromId) as AnyRecord | undefined;
  if (!r || fromId === toId) return;
  if (r.kind === 'note') {
    if (!r.linkedIds.includes(toId)) await store.put({ ...r, linkedIds: [...r.linkedIds, toId] });
  } else if (r.kind === 'journal' || r.kind === 'map' || r.kind === 'doc' || r.kind === 'media') {
    const links = r.links ?? [];
    if (!links.includes(toId)) await store.put({ ...r, links: [...links, toId] } as AnyRecord);
  }
}

export function LinkPicker({ open, onClose, fromId }: { open: boolean; onClose: () => void; fromId: string }) {
  const snap = useStore();
  const { toast } = useFeedback();
  const [q, setQ] = useState('');
  const g = useMemo(() => buildGraph(snap), [snap]);
  const list = g.nodes.filter((n) => n.id !== fromId && (!q.trim() || normalize(n.label).includes(normalize(q.trim())))).slice(0, 40);
  return (
    <BottomSheet open={open} onClose={onClose} title="Vincular con…" description="Libros, PDFs, notas, mapas o entradas. Aparecen en «Relacionado» y en el grafo.">
      <label className="search-field"><Icon name="search" size={18} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" data-autofocus /></label>
      <div className="group-body mt-4">
        {list.map((n) => (
          <button key={n.id} type="button" className="row" onClick={async () => { await addLink(fromId, n.id); toast(`Vinculado con «${n.label}»`); onClose(); }}>
            <i className="legend-dot" style={{ background: `oklch(0.62 0.13 ${KIND_HUE[n.kind]})` }} />
            <span className="row-main"><span className="row-label">{n.label}</span><span className="row-sub">{KIND_LABEL[n.kind]}</span></span>
          </button>
        ))}
        {!list.length && <p className="home-quiet" style={{ padding: 16 }}>Nada para vincular todavía.</p>}
      </div>
    </BottomSheet>
  );
}
