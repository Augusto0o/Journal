import type { MapType, MindMap } from '@/types';
import { aiAvailable, visualize } from './ai';
import { fromTree, heuristicTree, saveMap, suggestType } from './maps';

/**
 * Convierte cualquier texto en mapa / diagrama.
 * Con IA: la IA detecta idea central, conceptos, subconceptos y detalles (y sugiere el formato).
 * Sin IA: usa la estructura del texto (títulos, listas y oraciones).
 */
export async function createMapFromText(text: string, type: MapType | 'auto', opts: { title?: string; sourceId?: string | null } = {}): Promise<{ map: MindMap; usedAI: boolean }> {
  const clean = text.trim();
  if (aiAvailable()) {
    try {
      const r = await visualize(clean, type);
      const map = fromTree(r.nodes, r.edges, type === 'auto' ? r.type : type, opts.title ?? r.title, opts.sourceId ?? null);
      await saveMap(map);
      return { map, usedAI: true };
    } catch (e) {
      console.warn('visualize falló, uso heurística', e);
    }
  }
  const t = type === 'auto' ? suggestType(clean) : type;
  const { title, tree } = heuristicTree(opts.title ? `${opts.title}\n${clean}` : clean);
  const map = fromTree(tree, [], t, title, opts.sourceId ?? null);
  await saveMap(map);
  return { map, usedAI: false };
}
