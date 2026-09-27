import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BottomSheet, Icon, IconButton, NavBar, SheetAction, useFeedback, type IconName } from '@/components/ui';
import { store } from '@/database/store';
import { useAutosave } from '@/hooks/useAutosave';
import { useStore } from '@/hooks/useData';
import { MAP_TYPES, deleteMap, layout, nodeSize, saveMap } from '@/services/maps';
import type { MapEdge, MapNode, MapType, MindMap } from '@/types';
import { cx, haptic, shareOrDownload, uuid } from '@/utils/misc';

const NODE_COLORS: { id: string | null; label: string; hue: number | null }[] = [
  { id: null, label: 'Sin color', hue: null },
  { id: 'crimson', label: 'Carmín', hue: 22 },
  { id: 'amber', label: 'Ámbar', hue: 70 },
  { id: 'green', label: 'Verde', hue: 150 },
  { id: 'blue', label: 'Azul', hue: 245 },
  { id: 'violet', label: 'Violeta', hue: 300 },
];
const hueOf = (c?: string | null) => NODE_COLORS.find((x) => x.id === c)?.hue ?? null;

function useThemeColors() {
  const [c, setC] = useState(() => read());
  function read() {
    const s = getComputedStyle(document.documentElement);
    const v = (n: string) => s.getPropertyValue(n).trim();
    return { text: v('--text'), text2: v('--text-2'), surface: v('--surface'), bg: v('--bg'), line: v('--line-strong'), accent: v('--accent'), accentInk: v('--accent-ink'), soft: v('--accent-soft'), dark: document.documentElement.dataset.theme === 'dark' };
  }
  useEffect(() => {
    const o = new MutationObserver(() => setC(read()));
    o.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-accent'] });
    return () => o.disconnect();
  }, []);
  return c;
}

export default function MapEditor() {
  const { id = '' } = useParams();
  const snap = useStore();
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const stored = snap.map.find((m) => m.id === id);
  const [map, setMap] = useState<MindMap | null>(stored ?? null);
  const [sel, setSel] = useState<string | null>(null);
  const [selEdge, setSelEdge] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [sheet, setSheet] = useState<null | 'text' | 'edge' | 'menu' | 'color'>(null);
  const [draft, setDraft] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);
  const colors = useThemeColors();
  const autosave = useAutosave<MindMap>(saveMap, 500);

  useEffect(() => {
    if (!map && stored) setMap(stored);
  }, [stored, map]);

  const update = useCallback((fn: (m: MindMap) => MindMap) => {
    setMap((m) => {
      if (!m) return m;
      const next = fn(m);
      autosave.schedule(next);
      return next;
    });
  }, [autosave]);

  // ---------- Encajar en pantalla ----------
  const fit = useCallback((m: MindMap | null = map) => {
    const svg = svgRef.current;
    if (!svg || !m?.nodes.length) return;
    const { width, height } = svg.getBoundingClientRect();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of m.nodes) {
      const s = nodeSize(n);
      minX = Math.min(minX, n.x - s.w / 2); maxX = Math.max(maxX, n.x + s.w / 2);
      minY = Math.min(minY, n.y - s.h / 2); maxY = Math.max(maxY, n.y + s.h / 2);
    }
    const pad = 40;
    const k = Math.min(1.4, Math.max(0.25, Math.min((width - pad * 2) / (maxX - minX || 1), (height - pad * 2 - 90) / (maxY - minY || 1))));
    setView({ k, x: width / 2 - ((minX + maxX) / 2) * k, y: (height - 90) / 2 - ((minY + maxY) / 2) * k + 10 });
  }, [map]);

  useLayoutEffect(() => {
    if (map) fit(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!map]);

  // ---------- Gestos ----------
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<null | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number } | { kind: 'pinch'; d: number; k: number; cx: number; cy: number; vx: number; vy: number } | { kind: 'node'; id: string; ox: number; oy: number; moved: boolean; sx: number; sy: number }>(null);

  const toWorld = (cx: number, cy: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k };
  };

  const onBgDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const r = svgRef.current!.getBoundingClientRect();
      gesture.current = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k, cx: (a.x + b.x) / 2 - r.left, cy: (a.y + b.y) / 2 - r.top, vx: view.x, vy: view.y };
    } else if (!gesture.current || gesture.current.kind !== 'node') {
      gesture.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'pan') setView((v) => ({ ...v, x: g.vx + e.clientX - g.sx, y: g.vy + e.clientY - g.sy }));
    else if (g.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const k = Math.min(2.5, Math.max(0.2, (g.k * Math.hypot(a.x - b.x, a.y - b.y)) / g.d));
      setView({ k, x: g.cx - ((g.cx - g.vx) / g.k) * k, y: g.cy - ((g.cy - g.vy) / g.k) * k });
    } else if (g.kind === 'node') {
      if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 6) return;
      g.moved = true;
      const w = toWorld(e.clientX, e.clientY);
      setMap((m) => (m ? { ...m, nodes: m.nodes.map((n) => (n.id === g.id ? { ...n, x: Math.round(w.x - g.ox), y: Math.round(w.y - g.oy) } : n)) } : m));
    }
  };

  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g?.kind === 'node') {
      if (g.moved) {
        setMap((m) => {
          if (m) autosave.schedule(m);
          return m;
        });
      } else tapNode(g.id);
    } else if (g?.kind === 'pan' && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 5) {
      setSel(null);
      setSelEdge(null);
      setConnectFrom(null);
    }
    if (pointers.current.size === 0) gesture.current = null;
    else if (g?.kind === 'pinch') gesture.current = null;
  };

  const onNodeDown = (e: React.PointerEvent, n: MapNode) => {
    e.stopPropagation();
    svgRef.current!.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const w = toWorld(e.clientX, e.clientY);
    gesture.current = { kind: 'node', id: n.id, ox: w.x - n.x, oy: w.y - n.y, moved: false, sx: e.clientX, sy: e.clientY };
  };

  const lastTap = useRef<{ id: string; t: number } | null>(null);
  const tapNode = (nid: string) => {
    if (connectFrom && connectFrom !== nid) {
      update((m) => (m.edges.some((x) => (x.from === connectFrom && x.to === nid) || (x.from === nid && x.to === connectFrom)) ? m : { ...m, edges: [...m.edges, { id: uuid(), from: connectFrom, to: nid, label: null }] }));
      setConnectFrom(null);
      setSel(nid);
      haptic();
      return;
    }
    const now = Date.now();
    if (lastTap.current?.id === nid && now - lastTap.current.t < 320) openText(nid);
    lastTap.current = { id: nid, t: now };
    setSel(nid);
    setSelEdge(null);
  };

  const onWheel = (e: React.WheelEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    const cx = e.clientX - r.left, cy = e.clientY - r.top;
    const k = Math.min(2.5, Math.max(0.2, view.k * (e.deltaY < 0 ? 1.1 : 0.9)));
    setView((v) => ({ k, x: cx - ((cx - v.x) / v.k) * k, y: cy - ((cy - v.y) / v.k) * k }));
  };

  // ---------- Acciones ----------
  const openText = (nid: string) => {
    const n = map?.nodes.find((x) => x.id === nid);
    if (!n) return;
    setSel(nid);
    setDraft(n.text);
    setSheet('text');
  };

  const addChild = (sibling = false) => {
    if (!map) return;
    const base = map.nodes.find((n) => n.id === sel) ?? map.nodes[0];
    const parentEdge = map.edges.find((e) => e.to === base.id);
    const parentId = sibling && parentEdge ? parentEdge.from : base.id;
    const parent = map.nodes.find((n) => n.id === parentId)!;
    const count = map.edges.filter((e) => e.from === parentId).length;
    const angle = parent.depth === 0 || parent.id === map.nodes[0].id ? (count * Math.PI) / 3 : Math.atan2(parent.y - map.nodes[0].y, parent.x - map.nodes[0].x) + (count - 1) * 0.5;
    const dist = map.mapType === 'flow' ? 0 : 200;
    const nn: MapNode = {
      id: uuid(),
      text: map.mapType === 'flow' ? 'Siguiente paso' : 'Nueva idea',
      x: Math.round(map.mapType === 'flow' ? parent.x + count * 240 : parent.x + Math.cos(angle) * dist),
      y: Math.round(map.mapType === 'flow' ? parent.y + 140 : parent.y + Math.sin(angle) * dist * 0.75),
      depth: (parent.depth ?? 0) + 1,
    };
    update((m) => ({ ...m, nodes: [...m.nodes, nn], edges: [...m.edges, { id: uuid(), from: parentId, to: nn.id, label: null }] }));
    setSel(nn.id);
    setDraft(nn.text);
    setSheet('text');
  };

  const addLoose = () => {
    if (!map) return;
    const r = svgRef.current!.getBoundingClientRect();
    const w = toWorld(r.left + r.width / 2, r.top + r.height / 2 - 60);
    const nn: MapNode = { id: uuid(), text: 'Nueva idea', x: Math.round(w.x), y: Math.round(w.y), depth: 1 };
    update((m) => ({ ...m, nodes: [...m.nodes, nn] }));
    setSel(nn.id);
    setDraft(nn.text);
    setSheet('text');
  };

  const removeNode = () => {
    if (!map || !sel) return;
    if (sel === map.nodes[0].id && map.nodes.length > 1) {
      toast('La idea central no se puede borrar mientras haya otros nodos.');
      return;
    }
    // Borra el nodo y su rama si es un árbol.
    const kill = new Set([sel]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const e of map.edges) if (kill.has(e.from) && !kill.has(e.to) && map.edges.filter((x) => x.to === e.to).length === 1) { kill.add(e.to); grew = true; }
    }
    update((m) => ({ ...m, nodes: m.nodes.filter((n) => !kill.has(n.id)), edges: m.edges.filter((e) => !kill.has(e.from) && !kill.has(e.to)) }));
    setSel(null);
  };

  const relayout = (type: MapType = map!.mapType) => {
    update((m) => ({ ...m, mapType: type, nodes: layout(m.nodes, m.edges, type) }));
    setTimeout(() => fit(), 30);
  };

  const exportPng = async () => {
    const svg = svgRef.current;
    if (!svg || !map) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const g = clone.querySelector('g.viewport') as SVGGElement;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of map.nodes) {
      const s = nodeSize(n);
      minX = Math.min(minX, n.x - s.w / 2); maxX = Math.max(maxX, n.x + s.w / 2);
      minY = Math.min(minY, n.y - s.h / 2); maxY = Math.max(maxY, n.y + s.h / 2);
    }
    const pad = 48, W = maxX - minX + pad * 2, H = maxY - minY + pad * 2;
    g.setAttribute('transform', `translate(${pad - minX} ${pad - minY})`);
    clone.setAttribute('width', String(W));
    clone.setAttribute('height', String(H));
    clone.setAttribute('viewBox', `0 0 ${W} ${H}`);
    clone.querySelector('.map-bg')?.setAttribute('fill', colors.bg);
    const bg = clone.querySelector('.map-bg');
    if (bg) { bg.setAttribute('width', String(W)); bg.setAttribute('height', String(H)); }
    clone.setAttribute('font-family', getComputedStyle(document.body).fontFamily);
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = W * 2;
    canvas.height = H * 2;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));
    await shareOrDownload(blob, `${map.title.replace(/[\\/:*?"<>|]/g, '-')}.png`);
  };

  const byId = useMemo(() => new Map((map?.nodes ?? []).map((n) => [n.id, n])), [map]);

  if (!map) return <main className="page"><NavBar back="/cuaderno" backLabel="Cuaderno" /><p className="muted">No se encontró el mapa.</p></main>;

  const type = map.mapType;
  const rootId = map.nodes[0]?.id;
  const selNode = sel ? byId.get(sel) : null;
  const edgeObj = selEdge ? map.edges.find((e) => e.id === selEdge) : null;
  const source = map.sourceId ? store.raw(map.sourceId) : null;

  const edgePath = (a: MapNode, b: MapNode) => {
    if (type === 'mind') {
      const mx = (a.x + b.x) / 2;
      return `M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`;
    }
    if (type === 'flow' || type === 'system') {
      // Recorta en el borde del nodo destino para que la flecha se vea.
      const sb = nodeSize(b), sa = nodeSize(a);
      const dx = b.x - a.x, dy = b.y - a.y;
      const cut = (s: { w: number; h: number }) => {
        const tx = Math.abs(dx) > 0 ? s.w / 2 / Math.abs(dx) : Infinity;
        const ty = Math.abs(dy) > 0 ? s.h / 2 / Math.abs(dy) : Infinity;
        return Math.min(tx, ty);
      };
      const ta = cut(sa), tb = cut(sb);
      return `M${a.x + dx * ta},${a.y + dy * ta} L${b.x - dx * (tb + 0.02)},${b.y - dy * (tb + 0.02)}`;
    }
    return `M${a.x},${a.y} L${b.x},${b.y}`;
  };

  const nodeFill = (n: MapNode, isRoot: boolean) => {
    const h = hueOf(n.color);
    if (isRoot && type === 'mind') return h !== null ? `oklch(0.52 0.16 ${h})` : colors.accent;
    if (h !== null) return colors.dark ? `oklch(0.32 0.06 ${h})` : `oklch(0.95 0.04 ${h})`;
    return colors.surface;
  };

  return (
    <main className="map-page">
      <NavBar
        back="/cuaderno"
        backLabel="Cuaderno"
        title={<button type="button" className="map-title-btn" onClick={() => { setSel(rootId); setDraft(map.title); setSheet('text'); }}>{map.title}</button>}
        end={<IconButton icon="more" label="Opciones del mapa" onClick={() => setSheet('menu')} />}
      />
      <svg
        ref={svgRef}
        className={cx('map-canvas', connectFrom && 'is-connecting')}
        onPointerDown={onBgDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={onWheel}
        role="img"
        aria-label={`${MAP_TYPES.find((t) => t.id === type)?.label}: ${map.title}`}
      >
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={colors.text2} />
          </marker>
        </defs>
        <rect className="map-bg" x="0" y="0" width="100%" height="100%" fill="transparent" />
        <g className="viewport" transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {map.edges.map((e) => {
            const a = byId.get(e.from), b = byId.get(e.to);
            if (!a || !b) return null;
            const d = edgePath(a, b);
            const isSel = e.id === selEdge;
            return (
              <g key={e.id}>
                <path d={d} fill="none" stroke={isSel ? colors.accent : colors.line} strokeWidth={isSel ? 2.4 : type === 'mind' ? 2 : 1.4} markerEnd={type === 'flow' || type === 'system' || type === 'concept' ? 'url(#arrow)' : undefined} />
                <path d={d} fill="none" stroke="transparent" strokeWidth={18} onPointerDown={(ev) => { ev.stopPropagation(); setSelEdge(e.id); setSel(null); setDraft(e.label ?? ''); }} onPointerUp={(ev) => { ev.stopPropagation(); setSheet('edge'); }} style={{ cursor: 'pointer' }} />
                {e.label && (
                  <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6} textAnchor="middle" fontSize="12" fill={colors.accent} paintOrder="stroke" stroke={colors.bg} strokeWidth="5" style={{ fontStyle: 'italic' }}>{e.label}</text>
                )}
              </g>
            );
          })}
          {map.nodes.map((n) => {
            const s = nodeSize(n);
            const isRoot = n.id === rootId;
            const isSel = n.id === sel;
            const fill = nodeFill(n, isRoot);
            const textColor = isRoot && type === 'mind' ? colors.accentInk : colors.text;
            const radius = type === 'system' ? 8 : type === 'flow' ? 14 : isRoot ? s.h / 2 : 12;
            return (
              <g key={n.id} transform={`translate(${n.x} ${n.y})`} onPointerDown={(e) => onNodeDown(e, n)} className="map-node">
                <rect x={-s.w / 2} y={-s.h / 2} width={s.w} height={s.h} rx={radius} fill={fill} stroke={isSel || n.id === connectFrom ? colors.accent : isRoot && type === 'mind' ? 'none' : colors.line} strokeWidth={isSel ? 2.4 : 1} />
                {s.lines.map((l, i) => (
                  <text key={i} x={0} y={-((s.lines.length - 1) * s.fs * 1.3) / 2 + i * s.fs * 1.3} dy="0.35em" textAnchor="middle" fontSize={s.fs} fontWeight={isRoot ? 500 : 400} fill={textColor}>{l}</text>
                ))}
              </g>
            );
          })}
        </g>
      </svg>

      {connectFrom && <p className="map-hint">Tocá el nodo con el que querés conectar</p>}

      <div className="map-dock">
        <div className="capsule map-tools">
          {selNode ? (
            <>
              <Tool icon="pencil" label="Editar" onClick={() => openText(selNode.id)} />
              <Tool icon="plus" label="Hijo" onClick={() => addChild(false)} />
              {selNode.id !== rootId && <Tool icon="mindmap" label="Hermano" onClick={() => addChild(true)} />}
              <Tool icon="link2" label="Conectar" onClick={() => setConnectFrom(selNode.id)} active={connectFrom === selNode.id} />
              <Tool icon="palette" label="Color" onClick={() => setSheet('color')} />
              <Tool icon="trash" label="Borrar" onClick={removeNode} />
            </>
          ) : (
            <>
              <Tool icon="plus" label="Nodo" onClick={addLoose} />
              <Tool icon="layout" label="Ordenar" onClick={() => relayout()} />
              <Tool icon="scan" label="Encajar" onClick={() => fit()} />
              <Tool icon={MAP_TYPES.find((t) => t.id === type)!.icon} label="Tipo" onClick={() => setSheet('menu')} />
              <Tool icon="share" label="Exportar" onClick={() => void exportPng()} />
            </>
          )}
        </div>
      </div>

      <BottomSheet open={sheet === 'text'} onClose={() => setSheet(null)} title={sel === rootId ? 'Idea central' : 'Nodo'}>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            const t = draft.trim() || 'Sin título';
            update((m) => ({ ...m, title: sel === rootId ? t : m.title, nodes: m.nodes.map((n) => (n.id === sel ? { ...n, text: t } : n)) }));
            setSheet(null);
            // Si el nodo quedó fuera de la vista, reencuadra.
            setTimeout(() => {
              const svg = svgRef.current;
              const n = map?.nodes.find((x) => x.id === sel);
              if (!svg || !n) return;
              const r = svg.getBoundingClientRect();
              const sx = n.x * view.k + view.x, sy = n.y * view.k + view.y;
              if (sx < 30 || sx > r.width - 30 || sy < 30 || sy > r.height - 120) fit();
            }, 60);
          }}
        >
          <textarea className="textarea" rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} onFocus={(e) => e.currentTarget.select()} data-autofocus onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement).requestSubmit(); } }} />
          <button type="submit" className="btn btn-primary">Listo</button>
        </form>
      </BottomSheet>

      <BottomSheet open={sheet === 'edge'} onClose={() => { setSheet(null); setSelEdge(null); }} title="Relación" description="En mapas conceptuales, nombrá la relación: «causa», «incluye», «depende de».">
        {edgeObj && (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); update((m) => ({ ...m, edges: m.edges.map((x) => (x.id === edgeObj.id ? { ...x, label: draft.trim() || null } : x)) })); setSheet(null); setSelEdge(null); }}>
            <input className="input" placeholder="Nombre de la relación (opcional)" value={draft} onChange={(e) => setDraft(e.target.value)} data-autofocus />
            <button type="submit" className="btn btn-primary">Guardar</button>
            <button type="button" className="btn btn-ghost danger-text" onClick={() => { update((m) => ({ ...m, edges: m.edges.filter((x) => x.id !== edgeObj.id) })); setSheet(null); setSelEdge(null); }}>Quitar conexión</button>
          </form>
        )}
      </BottomSheet>

      <BottomSheet open={sheet === 'color'} onClose={() => setSheet(null)} title="Color del nodo">
        <div className="swatches">
          {NODE_COLORS.map((c) => (
            <button key={String(c.id)} type="button" className="swatch" aria-label={c.label} aria-pressed={(selNode?.color ?? null) === c.id} style={{ background: c.hue === null ? colors.surface : `oklch(0.7 0.13 ${c.hue})`, boxShadow: c.hue === null ? `inset 0 0 0 1px ${colors.line}` : undefined }} onClick={() => { update((m) => ({ ...m, nodes: m.nodes.map((n) => (n.id === sel ? { ...n, color: c.id } : n)) })); setSheet(null); }} />
          ))}
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === 'menu'} onClose={() => setSheet(null)} title="Transformar" description="Mismo contenido, otro formato. Se reordena solo.">
        <div className="group-body">
          {MAP_TYPES.map((t) => (
            <SheetAction key={t.id} icon={<Icon name={t.icon} size={20} />} label={t.label} hint={t.detail.split('→')[0]} checked={type === t.id} onClick={() => { relayout(t.id); setSheet(null); }} />
          ))}
        </div>
        <div className="group-body mt-4">
          {source && <SheetAction icon={<Icon name="file" size={20} />} label="Abrir el texto de origen" onClick={() => navigate(source.kind === 'journal' ? `/journal/${source.id}/leer` : source.kind === 'note' ? `/biblioteca/nota/${source.id}` : `/pdf/${source.id}`)} />}
          <SheetAction icon={<Icon name="share" size={20} />} label="Exportar como imagen" onClick={() => { setSheet(null); void exportPng(); }} />
          <SheetAction icon={<Icon name="trash" size={20} />} label="Eliminar mapa" danger onClick={async () => { setSheet(null); if (await confirm({ title: '¿Eliminar el mapa?', confirmLabel: 'Eliminar', danger: true })) { await deleteMap(map.id); navigate('/mapas', { replace: true }); } }} />
        </div>
      </BottomSheet>
    </main>
  );
}

function Tool({ icon, label, onClick, active }: { icon: IconName; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button type="button" className={cx('map-tool', active && 'is-active')} onClick={onClick}>
      <Icon name={icon} size={19} />
      <span>{label}</span>
    </button>
  );
}

export type { MapEdge };
