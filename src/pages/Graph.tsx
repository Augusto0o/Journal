import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BottomSheet, Empty, Icon, NavBar } from '@/components/ui';
import { useStore } from '@/hooks/useData';
import { buildGraph, forceLayout, KIND_HUE, KIND_LABEL, related, type GraphKind } from '@/services/graph';
import { cx } from '@/utils/misc';

export default function Graph() {
  const snap = useStore();
  const g = useMemo(() => buildGraph(snap), [snap]);
  const [filter, setFilter] = useState<GraphKind | null>(null);
  const positioned = useMemo(() => forceLayout(g.nodes, g.edges), [g]);
  const byId = useMemo(() => new Map(positioned.map((n) => [n.id, n])), [positioned]);
  const [sel, setSel] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ sx: number; sy: number; vx: number; vy: number; moved: boolean } | null>(null);
  const pinch = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ d: number; k: number } | null>(null);

  useLayoutEffect(() => {
    const el = svg.current;
    if (!el || !positioned.length) return;
    const { width, height } = el.getBoundingClientRect();
    const xs = positioned.map((n) => n.x), ys = positioned.map((n) => n.y);
    const w = Math.max(...xs) - Math.min(...xs) + 120, h = Math.max(...ys) - Math.min(...ys) + 120;
    const k = Math.min(1.4, Math.max(0.45, Math.min(width / w, (height - 60) / h)));
    setView({ k, x: width / 2 - ((Math.max(...xs) + Math.min(...xs)) / 2) * k, y: (height - 60) / 2 - ((Math.max(...ys) + Math.min(...ys)) / 2) * k });
  }, [positioned]);

  const kinds = [...new Set(g.nodes.map((n) => n.kind))];
  const degree = new Map<string, number>();
  g.edges.forEach((e) => { degree.set(e.a, (degree.get(e.a) ?? 0) + 1); degree.set(e.b, (degree.get(e.b) ?? 0) + 1); });
  const selNode = sel ? byId.get(sel) : null;
  const rel = sel ? related(snap, sel, 12) : [];
  const neighbors = new Set(rel.map((r) => r.node.id));

  if (g.nodes.length < 2) {
    return (
      <main className="page">
        <NavBar back="/cuaderno" backLabel="Cuaderno" title="Grafo de conocimiento" />
        <Empty title="Tu grafo empieza a crecer con lo que guardás" message="Las entradas, notas, libros, PDFs y mapas se conectan solos por etiquetas, enlaces y temas en común. Probá vincular una nota a un libro o crear un mapa desde un texto." />
      </main>
    );
  }

  return (
    <main className="graph-page">
      <NavBar back="/cuaderno" backLabel="Cuaderno" title="Grafo de conocimiento" />
      <div className="graph-legend">
        {kinds.map((k) => (
          <button key={k} type="button" className="chip" aria-pressed={filter === k} onClick={() => setFilter(filter === k ? null : k)}>
            <i className="legend-dot" style={{ background: `oklch(0.62 0.13 ${KIND_HUE[k]})` }} /> {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <p className="graph-hint">Cada punto es algo tuyo; las líneas unen lo que comparte etiquetas, temas o vínculos. Tocá un punto para ver con qué se conecta y saltar ahí.</p>
      <svg
        ref={svg}
        className="graph-canvas"
        onPointerDown={(e) => {
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pinch.current.size === 2) {
            const [a, b] = [...pinch.current.values()];
            pinchStart.current = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k };
          }
          drag.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
        }}
        onPointerMove={(e) => {
          if (pinch.current.has(e.pointerId)) pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pinch.current.size === 2 && pinchStart.current) {
            const [a, b] = [...pinch.current.values()];
            const k = Math.min(3, Math.max(0.2, (pinchStart.current.k * Math.hypot(a.x - b.x, a.y - b.y)) / pinchStart.current.d));
            setView((v) => ({ ...v, k }));
            return;
          }
          const d = drag.current;
          if (!d) return;
          if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 5) d.moved = true;
          if (d.moved) setView((v) => ({ ...v, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy }));
        }}
        onPointerUp={(e) => {
          pinch.current.delete(e.pointerId);
          if (pinch.current.size < 2) pinchStart.current = null;
          const d = drag.current;
          drag.current = null;
          if (d && !d.moved) {
            const target = (e.target as Element).closest('[data-node]');
            setSel(target ? target.getAttribute('data-node') : null);
          }
        }}
        onWheel={(e) => setView((v) => ({ ...v, k: Math.min(3, Math.max(0.2, v.k * (e.deltaY < 0 ? 1.1 : 0.9))) }))}
        role="img"
        aria-label={`Grafo con ${g.nodes.length} contenidos y ${g.edges.length} conexiones`}
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {g.edges.map((e, i) => {
            const a = byId.get(e.a), b = byId.get(e.b);
            if (!a || !b) return null;
            const on = sel && (e.a === sel || e.b === sel);
            const dim = (sel && !on) || (filter && a.kind !== filter && b.kind !== filter);
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={cx('g-edge', on && 'is-on', dim && 'is-dim')} strokeWidth={0.6 + e.weight * 0.5} />;
          })}
          {positioned.map((n) => {
            const r = (5 + Math.min(10, (degree.get(n.id) ?? 0) * 1.6)) / Math.sqrt(view.k);
            const dim = (sel && n.id !== sel && !neighbors.has(n.id)) || (filter && n.kind !== filter);
            return (
              <g key={n.id} transform={`translate(${n.x} ${n.y})`} data-node={n.id} className={cx('g-node', dim && 'is-dim', n.id === sel && 'is-sel')}>
                <circle r={r + 8} fill="transparent" />
                <circle r={r} fill={`oklch(0.62 0.13 ${KIND_HUE[n.kind]})`} />
                {(g.nodes.length <= 40 || view.k > 0.7 || n.id === sel || neighbors.has(n.id) || (degree.get(n.id) ?? 0) > 3) && (
                  <text y={r + 6 + 11 / view.k} textAnchor="middle" className="g-label" style={{ fontSize: `${12 / view.k}px` }}>{n.label.length > 26 ? `${n.label.slice(0, 24)}…` : n.label}</text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      <p className="graph-foot">{g.nodes.length} contenidos · {g.edges.length} conexiones · tocá un punto para ver sus relaciones</p>

      <BottomSheet open={!!selNode} onClose={() => setSel(null)} title={selNode?.label ?? ''} description={selNode ? KIND_LABEL[selNode.kind] : undefined} initialFocus="none">
        {selNode && (
          <div className="stack">
            <Link to={selNode.path} className="cta" style={{ alignSelf: 'flex-start' }}>Abrir <Icon name="arrowRight" size={22} strokeWidth={1.4} className="arrow" /></Link>
            <p className="field-label mt-4">Relacionado</p>
            <div className="group-body">
              {rel.length ? rel.map((r) => (
                <button key={r.node.id} type="button" className="row" onClick={() => setSel(r.node.id)}>
                  <i className="legend-dot" style={{ background: `oklch(0.62 0.13 ${KIND_HUE[r.node.kind]})` }} />
                  <span className="row-main"><span className="row-label">{r.node.label}</span><span className="row-sub">{KIND_LABEL[r.node.kind]} · {r.reason}</span></span>
                </button>
              )) : <p className="home-quiet" style={{ padding: 16 }}>Sin conexiones todavía.</p>}
            </div>
          </div>
        )}
      </BottomSheet>
    </main>
  );
}
