import { useCallback, useEffect, useRef, useState } from 'react';
import { BottomSheet, Icon, type IconName } from '@/components/ui';
import { cx, uuid } from '@/utils/misc';
import { recognize, scaleShape, shapeCenter, type Shape } from './shapes';

/**
 * Lienzo vectorial: lápiz, marcador, borrador, formas, flechas, texto,
 * selección para mover, deshacer y rehacer. Se puede dibujar sobre una imagen.
 * Como en Notas de iOS: dibujá a mano y mantené el dedo quieto para que el trazo
 * se vuelva una forma perfecta (seguí moviendo para ajustar el tamaño);
 * tocá con dos dedos para deshacer y con tres para rehacer.
 * Devuelve un PNG para insertar en el Journal o en una nota.
 */

type Tool = 'pen' | 'marker' | 'eraser' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'text' | 'select';
type Pt = [number, number];

interface El {
  id: string;
  t: Exclude<Tool, 'eraser' | 'select'>;
  color: string;
  w: number;
  pts?: Pt[];
  a?: Pt;
  b?: Pt;
  text?: string;
  /** Trazo convertido en polígono cerrado. */
  closed?: boolean;
  dx: number;
  dy: number;
}

const INKS = ['#1f1d1b', '#b3202f', '#2f5bd3', '#1f8a5b', '#c98a12', '#ffffff'];
const SIZES = [2, 4, 8, 14];

const TOOLS: { id: Tool; icon: IconName; label: string }[] = [
  { id: 'pen', icon: 'pen', label: 'Lápiz' },
  { id: 'marker', icon: 'draw', label: 'Marcador' },
  { id: 'eraser', icon: 'eraser', label: 'Borrador' },
  { id: 'select', icon: 'cursor', label: 'Seleccionar y mover' },
  { id: 'rect', icon: 'square', label: 'Rectángulo' },
  { id: 'ellipse', icon: 'circle', label: 'Elipse' },
  { id: 'line', icon: 'divider', label: 'Línea' },
  { id: 'arrow', icon: 'arrowRight', label: 'Flecha' },
  { id: 'text', icon: 'type', label: 'Texto' },
];

function bbox(e: El): [number, number, number, number] {
  let x1: number, y1: number, x2: number, y2: number;
  if (e.pts?.length) {
    x1 = Math.min(...e.pts.map((p) => p[0])); x2 = Math.max(...e.pts.map((p) => p[0]));
    y1 = Math.min(...e.pts.map((p) => p[1])); y2 = Math.max(...e.pts.map((p) => p[1]));
  } else if (e.t === 'text' && e.a) {
    const size = 12 + e.w * 2;
    x1 = e.a[0]; y1 = e.a[1] - size; x2 = e.a[0] + (e.text?.length ?? 1) * size * 0.55; y2 = e.a[1] + size * 0.3;
  } else if (e.a && e.b) {
    x1 = Math.min(e.a[0], e.b[0]); x2 = Math.max(e.a[0], e.b[0]);
    y1 = Math.min(e.a[1], e.b[1]); y2 = Math.max(e.a[1], e.b[1]);
  } else return [0, 0, 0, 0];
  const pad = e.w / 2 + 4;
  return [x1 + e.dx - pad, y1 + e.dy - pad, x2 + e.dx + pad, y2 + e.dy + pad];
}

const inBox = (p: Pt, b: [number, number, number, number]) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];

function nearStroke(e: El, p: Pt, tol: number) {
  if (!e.pts) return inBox(p, bbox(e));
  return e.pts.some(([x, y]) => Math.hypot(x + e.dx - p[0], y + e.dy - p[1]) < tol + e.w);
}

function draw(ctx: CanvasRenderingContext2D, e: El) {
  ctx.save();
  ctx.translate(e.dx, e.dy);
  ctx.strokeStyle = e.color;
  ctx.fillStyle = e.color;
  ctx.lineWidth = e.w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (e.t === 'marker') {
    ctx.globalAlpha = 0.35;
    ctx.lineCap = 'square';
  }
  if (e.pts) {
    ctx.beginPath();
    e.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    if (e.pts.length === 1) ctx.lineTo(e.pts[0][0] + 0.1, e.pts[0][1]);
    if (e.closed) ctx.closePath();
    ctx.stroke();
  } else if (e.t === 'text' && e.a) {
    ctx.font = `400 ${12 + e.w * 2}px 'Geist Variable', system-ui, sans-serif`;
    ctx.fillText(e.text ?? '', e.a[0], e.a[1]);
  } else if (e.a && e.b) {
    const [x1, y1] = e.a, [x2, y2] = e.b;
    ctx.beginPath();
    if (e.t === 'rect') ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    else if (e.t === 'ellipse') ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, Math.PI * 2);
    else {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      if (e.t === 'arrow') {
        const ang = Math.atan2(y2 - y1, x2 - x1);
        const h = 10 + e.w * 2;
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - h * Math.cos(ang - 0.45), y2 - h * Math.sin(ang - 0.45));
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - h * Math.cos(ang + 0.45), y2 - h * Math.sin(ang + 0.45));
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}

export function DrawingSheet({ open, onClose, onInsert, background }: { open: boolean; onClose: () => void; onInsert: (dataUrl: string) => void; background?: string | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const bgImg = useRef<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [ink, setInk] = useState(INKS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [els, setEls] = useState<El[]>([]);
  const past = useRef<El[][]>([]);
  const future = useRef<El[][]>([]);
  const [, bump] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [textAt, setTextAt] = useState<Pt | null>(null);
  const [textVal, setTextVal] = useState('');
  const cur = useRef<El | null>(null);
  const drag = useRef<{ id: string; start: Pt; dx: number; dy: number } | null>(null);
  const erasing = useRef(false);
  const textDown = useRef<Pt | null>(null);
  const openedAt = useRef(0);
  // Mantener para encajar la forma
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdFrom = useRef<Pt | null>(null);
  const snap = useRef<{ shape: Shape; center: Pt; start: number } | null>(null);
  const [snapLabel, setSnapLabel] = useState<string | null>(null);
  // Gestos con varios dedos
  const pointers = useRef(new Map<number, Pt>());
  const multi = useRef<{ at: number; max: number; moved: boolean } | null>(null);
  // Zoom y desplazamiento con dos dedos (solo acá: el resto de la app no hace zoom).
  const view = useRef({ s: 1, x: 0, y: 0 });
  const pinch = useRef<{ d: number; mid: Pt; v: { s: number; x: number; y: number } } | null>(null);
  const [zoomed, setZoomed] = useState(false);

  const shapeToEl = (base: El, sh: Shape): El => {
    if (sh.kind === 'line') return { ...base, t: 'line', pts: undefined, a: sh.a, b: sh.b, closed: false };
    if (sh.kind === 'ellipse') return { ...base, t: 'ellipse', pts: undefined, a: sh.a, b: sh.b, closed: false };
    return { ...base, pts: sh.pts, closed: sh.closed };
  };

  const armHold = (p: Pt) => {
    if (hold.current) clearTimeout(hold.current);
    holdFrom.current = p;
    hold.current = setTimeout(() => {
      const c = cur.current;
      if (!c?.pts || snap.current) return;
      const sh = recognize(c.pts);
      if (!sh) return;
      const center = shapeCenter(sh);
      snap.current = { shape: sh, center, start: Math.max(8, Math.hypot(p[0] - center[0], p[1] - center[1])) };
      cur.current = shapeToEl(c, sh);
      try {
        navigator.vibrate?.(8);
      } catch {
        /* no-op */
      }
      setSnapLabel(sh.kind === 'line' ? 'Línea' : sh.kind === 'ellipse' ? (sh.circle ? 'Círculo' : 'Elipse') : sh.label.charAt(0).toUpperCase() + sh.label.slice(1));
      setTimeout(() => setSnapLabel(null), 900);
      render();
    }, 520);
  };

  const clearHold = () => {
    if (hold.current) clearTimeout(hold.current);
    hold.current = null;
    holdFrom.current = null;
  };

  const commit = (next: El[]) => {
    past.current.push(els);
    if (past.current.length > 60) past.current.shift();
    future.current = [];
    setEls(next);
  };

  const render = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const dpr = c.width / c.getBoundingClientRect().width || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const r = c.getBoundingClientRect();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, r.width, r.height);
    const v = view.current;
    ctx.setTransform(dpr * v.s, 0, 0, dpr * v.s, dpr * v.x, dpr * v.y);
    const img = bgImg.current;
    if (img) {
      const s = Math.min(r.width / img.width, r.height / img.height);
      ctx.drawImage(img, (r.width - img.width * s) / 2, (r.height - img.height * s) / 2, img.width * s, img.height * s);
    }
    for (const e of els) draw(ctx, e);
    if (cur.current) draw(ctx, cur.current);
    const s = els.find((e) => e.id === sel);
    if (s) {
      const [x1, y1, x2, y2] = bbox(s);
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = '#b3202f';
      ctx.lineWidth = 1;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      ctx.restore();
    }
  }, [els, sel]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const c = canvas.current;
      if (!c) return;
      const r = c.getBoundingClientRect();
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      setEls([]);
      past.current = [];
      future.current = [];
      setSel(null);
      view.current = { s: 1, x: 0, y: 0 };
      setZoomed(false);
      bgImg.current = null;
      if (background) {
        const img = new Image();
        img.onload = () => {
          bgImg.current = img;
          bump((n) => n + 1);
        };
        img.src = background;
      }
      bump((n) => n + 1);
    }, 60);
    return () => clearTimeout(t);
  }, [open, background]);

  useEffect(() => {
    render();
  });

  const screen = (e: { clientX: number; clientY: number }): Pt => {
    const r = canvas.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const toWorld = ([x, y]: Pt): Pt => {
    const v = view.current;
    return [(x - v.x) / v.s, (y - v.y) / v.s];
  };
  const pos = (e: { clientX: number; clientY: number }): Pt => toWorld(screen(e));

  const pinchInfo = () => {
    const [a, b] = [...pointers.current.values()];
    return { d: Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Pt };
  };

  const resetView = () => {
    view.current = { s: 1, x: 0, y: 0 };
    setZoomed(false);
    render();
  };

  const hit = (p: Pt) => [...els].reverse().find((e) => nearStroke(e, p, 10));

  const down = (e: React.PointerEvent) => {
    if (textAt) return;
    const p = pos(e);
    pointers.current.set(e.pointerId, screen(e));
    if (e.pointerType === 'touch' && pointers.current.size >= 2) {
      if (pointers.current.size === 2) pinch.current = { ...pinchInfo(), v: { ...view.current } };
      // Dos o tres dedos: es un gesto, no un trazo.
      if (!multi.current) multi.current = { at: Date.now(), max: 0, moved: false };
      multi.current.max = Math.max(multi.current.max, pointers.current.size);
      cur.current = null;
      clearHold();
      snap.current = null;
      render();
      return;
    }
    canvas.current!.setPointerCapture(e.pointerId);
    if (tool === 'select') {
      const h = hit(p);
      setSel(h?.id ?? null);
      if (h) drag.current = { id: h.id, start: p, dx: h.dx, dy: h.dy };
      return;
    }
    if (tool === 'eraser') {
      erasing.current = true;
      const h = hit(p);
      if (h) commit(els.filter((x) => x.id !== h.id));
      return;
    }
    if (tool === 'text') {
      textDown.current = p;
      return;
    }
    setSel(null);
    const w = tool === 'marker' ? size * 4 : size;
    cur.current = tool === 'pen' || tool === 'marker'
      ? { id: uuid(), t: tool, color: ink, w, pts: [p], dx: 0, dy: 0 }
      : { id: uuid(), t: tool, color: ink, w, a: p, b: p, dx: 0, dy: 0 };
    render();
  };

  const move = (e: React.PointerEvent) => {
    const p = pos(e);
    if (multi.current) {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, screen(e));
      const pc = pinch.current;
      if (pc && pointers.current.size === 2) {
        const { d, mid } = pinchInfo();
        if (Math.abs(d - pc.d) > 14 || Math.hypot(mid[0] - pc.mid[0], mid[1] - pc.mid[1]) > 14) multi.current.moved = true;
        if (!multi.current.moved) return;
        const r = canvas.current!.getBoundingClientRect();
        const ns = Math.min(5, Math.max(1, pc.v.s * (d / pc.d)));
        const wx = (pc.mid[0] - pc.v.x) / pc.v.s;
        const wy = (pc.mid[1] - pc.v.y) / pc.v.s;
        const clamp = (o: number, size: number) => Math.min(0, Math.max(size - size * ns, o));
        view.current = { s: ns, x: clamp(mid[0] - wx * ns, r.width), y: clamp(mid[1] - wy * ns, r.height) };
        setZoomed(ns > 1.01);
        render();
      }
      return;
    }
    if (drag.current) {
      const d = drag.current;
      setEls((list) => list.map((x) => (x.id === d.id ? { ...x, dx: d.dx + p[0] - d.start[0], dy: d.dy + p[1] - d.start[1] } : x)));
      return;
    }
    if (erasing.current) {
      const h = hit(p);
      if (h) commit(els.filter((x) => x.id !== h.id));
      return;
    }
    const c = cur.current;
    if (!c) return;
    // Ya encajada: seguir moviendo ajusta la forma.
    if (snap.current) {
      const { shape, center, start } = snap.current;
      if (shape.kind === 'line') cur.current = { ...c, b: p };
      else cur.current = shapeToEl(c, scaleShape(shape, Math.hypot(p[0] - center[0], p[1] - center[1]) / start));
      render();
      return;
    }
    if (c.pts) {
      const evs = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [e.nativeEvent];
      for (const ev of evs) c.pts.push(pos(ev));
      // Si el dedo se queda quieto, se intenta reconocer la forma.
      if (!holdFrom.current || Math.hypot(p[0] - holdFrom.current[0], p[1] - holdFrom.current[1]) > 5) armHold(p);
    } else c.b = p;
    render();
  };

  const up = (e?: React.PointerEvent) => {
    if (e) pointers.current.delete(e.pointerId);
    if (multi.current) {
      if (pointers.current.size < 2) pinch.current = null;
      if (pointers.current.size === 0) {
        const m = multi.current;
        multi.current = null;
        if (!m.moved && Date.now() - m.at < 450) {
          if (m.max >= 3) redo();
          else undo();
        }
      }
      return;
    }
    clearHold();
    snap.current = null;
    if (textDown.current) {
      const p = textDown.current;
      textDown.current = null;
      openedAt.current = Date.now();
      setTextAt(p);
      setTextVal('');
      return;
    }
    if (drag.current) {
      const d = drag.current;
      drag.current = null;
      const moved = els.find((x) => x.id === d.id);
      if (moved && (moved.dx !== d.dx || moved.dy !== d.dy)) {
        past.current.push(els.map((x) => (x.id === d.id ? { ...x, dx: d.dx, dy: d.dy } : x)));
        future.current = [];
      }
      return;
    }
    erasing.current = false;
    const c = cur.current;
    cur.current = null;
    if (!c) return;
    if (c.a && c.b && Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]) < 4) return render();
    commit([...els, c]);
  };

  const undo = () => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(els);
    setEls(prev);
    setSel(null);
  };

  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(els);
    setEls(next);
  };

  const commitText = () => {
    if (textAt && textVal.trim()) commit([...els, { id: uuid(), t: 'text', color: ink, w: size, a: textAt, text: textVal.trim(), dx: 0, dy: 0 }]);
    setTextAt(null);
    setTextVal('');
  };

  const insert = () => {
    const c = canvas.current!;
    setSel(null);
    view.current = { s: 1, x: 0, y: 0 };
    setZoomed(false);
    render();
    // Recorta al área usada (o a toda la imagen de fondo) sobre blanco.
    requestAnimationFrame(() => {
      const r = c.getBoundingClientRect();
      const dpr = c.width / r.width;
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      if (bgImg.current) { x1 = 0; y1 = 0; x2 = r.width; y2 = r.height; }
      for (const e of els) {
        const b = bbox(e);
        x1 = Math.min(x1, b[0]); y1 = Math.min(y1, b[1]); x2 = Math.max(x2, b[2]); y2 = Math.max(y2, b[3]);
      }
      if (!isFinite(x1)) return onClose();
      const pad = 16;
      x1 = Math.max(0, x1 - pad); y1 = Math.max(0, y1 - pad); x2 = Math.min(r.width, x2 + pad); y2 = Math.min(r.height, y2 + pad);
      const out = document.createElement('canvas');
      const scale = Math.min(2, 1400 / Math.max(x2 - x1, y2 - y1));
      out.width = Math.round((x2 - x1) * scale);
      out.height = Math.round((y2 - y1) * scale);
      out.getContext('2d')!.drawImage(c, x1 * dpr, y1 * dpr, (x2 - x1) * dpr, (y2 - y1) * dpr, 0, 0, out.width, out.height);
      onInsert(out.toDataURL('image/png'));
      onClose();
    });
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={background ? 'Dibujar sobre la imagen' : 'Dibujo'} initialFocus="none" className="draw-sheet">
      <div className="draw-tools" role="toolbar" aria-label="Herramientas">
        {TOOLS.map((t) => (
          <button key={t.id} type="button" className={cx('draw-tool', tool === t.id && 'is-on')} aria-label={t.label} title={t.label} aria-pressed={tool === t.id} onClick={() => { setTool(t.id); if (t.id !== 'select') setSel(null); }}>
            <Icon name={t.icon} size={18} />
          </button>
        ))}
      </div>
      <div className="draw-tools">
        {INKS.map((c) => (
          <button key={c} type="button" className={cx('ink-dot', ink === c && 'is-on')} style={{ background: c }} aria-label={`Color ${c}`} onClick={() => setInk(c)} />
        ))}
        <span className="draw-sep" />
        {SIZES.map((s) => (
          <button key={s} type="button" className={cx('size-dot', size === s && 'is-on')} aria-label={`Grosor ${s}`} onClick={() => setSize(s)}>
            <i style={{ width: Math.min(18, s + 3), height: Math.min(18, s + 3) }} />
          </button>
        ))}
        <span className="grow" />
        {sel && (
          <button type="button" className="icon-btn" aria-label="Borrar selección" onClick={() => { commit(els.filter((x) => x.id !== sel)); setSel(null); }}>
            <Icon name="trash" size={19} />
          </button>
        )}
        <button type="button" className="icon-btn" aria-label="Deshacer" onClick={undo} disabled={!past.current.length}>
          <Icon name="undo" size={19} />
        </button>
        <button type="button" className="icon-btn" aria-label="Rehacer" onClick={redo} disabled={!future.current.length}>
          <Icon name="redo" size={19} />
        </button>
      </div>
      <div className="draw-stage">
        <canvas ref={canvas} className={cx('draw-canvas', `tool-${tool}`)} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
        {snapLabel && <span className="snap-label">{snapLabel}</span>}
        {zoomed && <button type="button" className="zoom-reset" onClick={resetView}>100%</button>}
        {textAt && (
          <input
            className="draw-text-input"
            style={{ left: textAt[0] * view.current.s + view.current.x, top: (textAt[1] - 22) * view.current.s + view.current.y, color: ink }}
            value={textVal}
            autoFocus
            placeholder="Escribí…"
            onChange={(e) => setTextVal(e.target.value)}
            onBlur={() => { if (Date.now() - openedAt.current > 250) commitText(); }}
            onKeyDown={(e) => e.key === 'Enter' && commitText()}
          />
        )}
      </div>
      <p className="draw-hint">Mantené el dedo al terminar un trazo para una forma perfecta · pellizcá para hacer zoom · tocá con dos dedos: deshacer</p>
      <div className="hstack mt-4">
        <button type="button" className="btn btn-secondary grow" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn btn-primary grow" onClick={insert} disabled={!els.length && !background}>Insertar</button>
      </div>
    </BottomSheet>
  );
}
