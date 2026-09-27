/**
 * Reconocimiento de formas como en Notas de iOS: dibujás a mano alzada,
 * mantenés el dedo quieto un instante y el trazo se convierte en una forma perfecta.
 */
export type Pt = [number, number];

export type Shape =
  | { kind: 'line'; a: Pt; b: Pt }
  | { kind: 'ellipse'; a: Pt; b: Pt; circle: boolean }
  | { kind: 'poly'; pts: Pt[]; closed: boolean; label: 'triángulo' | 'rectángulo' | 'cuadrado' | 'polígono' | 'líneas' };

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function pathLength(pts: Pt[]) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
  return l;
}

function segDist(p: Pt, a: Pt, b: Pt) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (!len2) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return dist(p, [a[0] + t * dx, a[1] + t * dy]);
}

/** Ramer–Douglas–Peucker: se queda con los vértices que definen la forma. */
export function simplify(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts.slice();
  let max = 0;
  let idx = 0;
  const a = pts[0];
  const b = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = segDist(pts[i], a, b);
    if (d > max) {
      max = d;
      idx = i;
    }
  }
  if (max <= eps) return [a, b];
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
}

/** Para trazos cerrados: busca los vértices partiendo desde el punto más lejano al inicio. */
function simplifyClosed(pts: Pt[], eps: number): Pt[] {
  let far = 0;
  let fi = 0;
  pts.forEach((p, i) => {
    const d = dist(p, pts[0]);
    if (d > far) {
      far = d;
      fi = i;
    }
  });
  const a = simplify(pts.slice(0, fi + 1), eps);
  const b = simplify([...pts.slice(fi), pts[0]], eps);
  const out = [...a.slice(0, -1), ...b.slice(0, -1)];
  // Une vértices casi superpuestos.
  return out.filter((p, i) => dist(p, out[(i + 1) % out.length]) > eps * 1.2);
}

function angleAt(a: Pt, b: Pt, c: Pt) {
  const v1: Pt = [a[0] - b[0], a[1] - b[1]];
  const v2: Pt = [c[0] - b[0], c[1] - b[1]];
  const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

export function recognize(raw: Pt[]): Shape | null {
  if (raw.length < 4) return null;
  const xs = raw.map((p) => p[0]);
  const ys = raw.map((p) => p[1]);
  const x1 = Math.min(...xs), x2 = Math.max(...xs), y1 = Math.min(...ys), y2 = Math.max(...ys);
  const w = x2 - x1, h = y2 - y1;
  const diag = Math.hypot(w, h);
  if (diag < 18) return null;
  const len = pathLength(raw);
  const eps = Math.max(6, diag * 0.06);
  const closed = dist(raw[0], raw[raw.length - 1]) < Math.max(22, diag * 0.22) && len > diag * 1.6;

  if (!closed) {
    // Línea recta
    if (dist(raw[0], raw[raw.length - 1]) / len > 0.9) return { kind: 'line', a: raw[0], b: raw[raw.length - 1] };
    // Pocas rectas encadenadas (un «V», un zigzag, una flecha dibujada)
    const s = simplify(raw, eps);
    if (s.length <= 6) return { kind: 'poly', pts: s, closed: false, label: 'líneas' };
    return null;
  }

  // ¿Elipse? Normalizando por la caja, los puntos de una elipse caen a distancia ~1 del centro.
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
  const rs = raw.map(([x, y]) => Math.hypot((x - cx) / (w / 2 || 1), (y - cy) / (h / 2 || 1)));
  const mean = rs.reduce((s, r) => s + r, 0) / rs.length;
  const sd = Math.sqrt(rs.reduce((s, r) => s + (r - mean) ** 2, 0) / rs.length);
  const verts = simplifyClosed(raw, eps);

  if (sd / mean < 0.085 || verts.length > 6) {
    const ratio = w / (h || 1);
    if (ratio > 0.82 && ratio < 1.22) {
      const r = (w + h) / 4;
      return { kind: 'ellipse', a: [cx - r, cy - r], b: [cx + r, cy + r], circle: true };
    }
    return { kind: 'ellipse', a: [x1, y1], b: [x2, y2], circle: false };
  }

  if (verts.length === 3) return { kind: 'poly', pts: verts, closed: true, label: 'triángulo' };

  if (verts.length === 4) {
    const angles = verts.map((v, i) => angleAt(verts[(i + 3) % 4], v, verts[(i + 1) % 4]));
    const square = angles.every((a) => Math.abs(a - 90) < 22);
    if (square) {
      // Si está casi derecho, se endereza a una caja; si no, se deja rotado pero con ángulos rectos.
      const e0: Pt = [verts[1][0] - verts[0][0], verts[1][1] - verts[0][1]];
      const tilt = Math.abs(((Math.atan2(e0[1], e0[0]) * 180) / Math.PI) % 90);
      const straight = tilt < 10 || tilt > 80;
      const isSquare = w / (h || 1) > 0.85 && w / (h || 1) < 1.18;
      if (straight) {
        const side = (w + h) / 2;
        const box: Pt[] = isSquare
          ? [[cx - side / 2, cy - side / 2], [cx + side / 2, cy - side / 2], [cx + side / 2, cy + side / 2], [cx - side / 2, cy + side / 2]]
          : [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
        return { kind: 'poly', pts: box, closed: true, label: isSquare ? 'cuadrado' : 'rectángulo' };
      }
      return { kind: 'poly', pts: rectify(verts), closed: true, label: 'rectángulo' };
    }
  }
  return { kind: 'poly', pts: verts, closed: true, label: 'polígono' };
}

/** Rectángulo rotado a partir de 4 vértices aproximados. */
function rectify(v: Pt[]): Pt[] {
  const c: Pt = [(v[0][0] + v[1][0] + v[2][0] + v[3][0]) / 4, (v[0][1] + v[1][1] + v[2][1] + v[3][1]) / 4];
  const ang = Math.atan2(v[1][1] - v[0][1], v[1][0] - v[0][0]);
  const wv = (dist(v[0], v[1]) + dist(v[2], v[3])) / 2;
  const hv = (dist(v[1], v[2]) + dist(v[3], v[0])) / 2;
  const ux: Pt = [Math.cos(ang), Math.sin(ang)];
  const uy: Pt = [-Math.sin(ang), Math.cos(ang)];
  const corner = (sx: number, sy: number): Pt => [c[0] + (ux[0] * wv * sx + uy[0] * hv * sy) / 2, c[1] + (ux[1] * wv * sx + uy[1] * hv * sy) / 2];
  return [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
}

/** Escala una forma alrededor de su centro (para ajustar el tamaño después de encajar). */
export function scaleShape(s: Shape, k: number): Shape {
  if (s.kind === 'line') return s;
  const pts: Pt[] = s.kind === 'ellipse' ? [s.a, s.b] : s.pts;
  const c: Pt = [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
  const f = (p: Pt): Pt => [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k];
  if (s.kind === 'ellipse') return { ...s, a: f(s.a), b: f(s.b) };
  return { ...s, pts: s.pts.map(f) };
}

export function shapeCenter(s: Shape): Pt {
  const pts: Pt[] = s.kind === 'poly' ? s.pts : [s.a, s.b];
  return [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
}
