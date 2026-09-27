/**
 * PDFs: el archivo vive en IndexedDB (store "files", no se sincroniza por tamaño);
 * el texto extraído y los metadatos van en un registro "doc" que sí se sincroniza,
 * así se puede buscar y usar con la IA desde cualquier dispositivo.
 */
import type { DocFile } from '@/types';
import { idb } from '@/database/idb';
import { store } from '@/database/store';
import { nowISO, uuid } from '@/utils/misc';
import type { PDFDocumentProxy } from 'pdfjs-dist';

let lib: Promise<typeof import('pdfjs-dist')> | null = null;

export function pdfjs() {
  if (!lib) {
    lib = Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([m, w]) => {
      m.GlobalWorkerOptions.workerSrc = w.default;
      return m;
    });
  }
  return lib;
}

export const PAGE_BREAK = '\n\u000c\n';

export async function importPdf(file: File, onProgress?: (p: number) => void): Promise<DocFile> {
  const buf = await file.arrayBuffer();
  const m = await pdfjs();
  const doc = await m.getDocument({ data: buf.slice(0) }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let line = '';
    let lastY: number | null = null;
    const out: string[] = [];
    for (const it of content.items as { str: string; transform: number[]; hasEOL?: boolean }[]) {
      const y = it.transform?.[5] ?? 0;
      if (lastY !== null && Math.abs(y - lastY) > 4) {
        out.push(line.trim());
        line = '';
      }
      line += it.str + (it.hasEOL ? '\n' : ' ');
      lastY = y;
    }
    out.push(line.trim());
    pages.push(out.join('\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim());
    onProgress?.(i / doc.numPages);
  }
  const meta = await doc.getMetadata().catch(() => null);
  const infoTitle = (meta?.info as { Title?: string } | undefined)?.Title?.trim();
  const id = uuid();
  await idb.put('files', { id, blob: new Blob([buf], { type: 'application/pdf' }), name: file.name });
  const now = nowISO();
  const rec: DocFile = {
    id, kind: 'doc', createdAt: now, updatedAt: now, deletedAt: null,
    title: infoTitle && infoTitle.length > 2 ? infoTitle : file.name.replace(/\.pdf$/i, ''),
    fileName: file.name, size: file.size, pages: doc.numPages, text: pages.join(PAGE_BREAK).slice(0, 400_000), page: 1, tags: [],
  };
  await store.put(rec);
  void doc.destroy();
  return rec;
}

export async function openPdf(id: string): Promise<PDFDocumentProxy | null> {
  const f = await idb.get<{ id: string; blob: Blob }>('files', id);
  if (!f) return null;
  const m = await pdfjs();
  return m.getDocument({ data: new Uint8Array(await f.blob.arrayBuffer()) }).promise;
}

export async function hasPdfFile(id: string) {
  return !!(await idb.get('files', id));
}

export async function deletePdf(id: string) {
  await idb.delete('files', id);
  await store.remove(id, (r) => ({ ...(r as DocFile), text: '' }));
}

export const docPages = (d: Pick<DocFile, 'text'>) => d.text.split(PAGE_BREAK);

export function searchDoc(d: DocFile, q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  return docPages(d)
    .map((t, i) => {
      const idx = t.toLowerCase().indexOf(needle);
      if (idx < 0) return null;
      const s = Math.max(0, idx - 60);
      return { page: i + 1, snippet: (s > 0 ? '…' : '') + t.slice(s, idx + needle.length + 80).replace(/\s+/g, ' ') + '…' };
    })
    .filter((x): x is { page: number; snippet: string } => !!x);
}

export const formatSize = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
