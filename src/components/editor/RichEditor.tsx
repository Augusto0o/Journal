import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { sanitizeHtml } from '@/utils/html';
import { cx } from '@/utils/misc';

export type BlockTag = 'h1' | 'h2' | 'h3' | 'p' | 'pre' | 'blockquote';

export interface ActiveFormats {
  block: BlockTag;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  ul: boolean;
  ol: boolean;
  checklist: boolean;
  h2: boolean;
  quote: boolean;
  link: boolean;
  table: boolean;
}

export interface RichEditorHandle {
  focus: (atEnd?: boolean) => void;
  exec: (command: string, value?: string) => void;
  toggleChecklist: () => void;
  toggleBlock: (tag: 'h2' | 'blockquote') => void;
  setBlock: (tag: BlockTag) => void;
  insertLink: (url: string, text?: string) => void;
  insertImage: (src: string) => void;
  addTableRow: () => boolean;
  deleteTableRow: () => boolean;
  deleteTable: () => boolean;
  replaceSelection: (html: string) => void;
  appendHtml: (html: string) => void;
  getSelectedText: () => string;
  getLinkAtSelection: () => string | null;
  root: () => HTMLDivElement | null;
  undo: () => void;
  redo: () => void;
}

interface RichEditorProps {
  initialHtml: string;
  onChange: (html: string) => void;
  onFormats?: (f: ActiveFormats) => void;
  onFocusChange?: (focused: boolean) => void;
  placeholder?: string;
  scrollContainer?: React.RefObject<HTMLElement>;
  className?: string;
  /** Avisa si hay pasos para deshacer / rehacer. */
  onHistory?: (h: { undo: boolean; redo: boolean }) => void;
}

const EMPTY_FORMATS: ActiveFormats = { bold: false, italic: false, underline: false, ul: false, ol: false, checklist: false, h2: false, quote: false, link: false, table: false, block: 'p' };

/**
 * Editor de texto enriquecido basado en contentEditable.
 * Es no-controlado: el HTML inicial se fija una vez y los cambios se emiten con onChange.
 */
export const RichEditor = forwardRef<RichEditorHandle, RichEditorProps>(function RichEditor(
  { initialHtml, onChange, onFormats, onFocusChange, placeholder, scrollContainer, className, onHistory },
  ref,
) {
  const el = useRef<HTMLDivElement>(null);
  const lastRange = useRef<Range | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onFormatsRef = useRef(onFormats);
  onFormatsRef.current = onFormats;

  const updateEmpty = useCallback(() => {
    const root = el.current;
    if (!root) return;
    const empty = !root.textContent?.trim() && !root.querySelector('img, li, hr');
    root.classList.toggle('is-empty', empty);
  }, []);

  // Historial propio (deshacer / rehacer): funciona también con checklists, imágenes y cambios de la IA,
  // que el deshacer nativo de iOS pierde. Las pulsaciones seguidas se agrupan en un solo paso.
  const hist = useRef({ past: [] as string[], future: [] as string[], cur: '', at: 0 });
  const onHistoryRef = useRef(onHistory);
  onHistoryRef.current = onHistory;
  const reportHistory = () => onHistoryRef.current?.({ undo: hist.current.past.length > 0, redo: hist.current.future.length > 0 });

  const emit = useCallback(() => {
    updateEmpty();
    const html = el.current?.innerHTML ?? '';
    const h = hist.current;
    if (html !== h.cur) {
      const now = Date.now();
      if (now - h.at > 700 || !h.past.length) {
        h.past.push(h.cur);
        if (h.past.length > 150) h.past.shift();
      }
      h.at = now;
      h.cur = html;
      h.future = [];
      reportHistory();
    }
    onChangeRef.current(html);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateEmpty]);

  const applyHistory = (html: string) => {
    const root = el.current;
    if (!root) return;
    root.innerHTML = html;
    hist.current.cur = html;
    hist.current.at = 0;
    updateEmpty();
    onChangeRef.current(html);
    root.focus({ preventScroll: true });
    const r = document.createRange();
    r.selectNodeContents(root);
    r.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
    reportHistory();
  };

  // HTML inicial (una sola vez)
  useEffect(() => {
    if (!el.current) return;
    el.current.innerHTML = sanitizeHtml(initialHtml) || '';
    hist.current.cur = el.current.innerHTML;
    updateEmpty();
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p');
    } catch {
      /* no-op */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Mantiene el cursor visible por encima del teclado/barra de herramientas. */
  const ensureCaretVisible = useCallback(() => {
    const sc = scrollContainer?.current;
    const sel = window.getSelection();
    if (!sc || !sel || !sel.rangeCount || !el.current?.contains(sel.anchorNode)) return;
    const range = sel.getRangeAt(0).cloneRange();
    let rect = range.getBoundingClientRect();
    if (!rect || (rect.top === 0 && rect.bottom === 0)) {
      const node = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
      rect = node?.getBoundingClientRect() ?? rect;
    }
    if (!rect) return;
    const box = sc.getBoundingClientRect();
    const margin = 28;
    if (rect.bottom > box.bottom - margin) sc.scrollTop += rect.bottom - box.bottom + margin;
    else if (rect.top < box.top + margin) sc.scrollTop -= box.top + margin - rect.top;
  }, [scrollContainer]);

  const readFormats = useCallback((): ActiveFormats => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !el.current?.contains(sel.anchorNode)) return EMPTY_FORMATS;
    const node = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
    const q = (cmd: string) => {
      try {
        return document.queryCommandState(cmd);
      } catch {
        return false;
      }
    };
    const inChecklist = !!node?.closest('ul.checklist');
    return {
      bold: q('bold'),
      italic: q('italic'),
      underline: q('underline'),
      ul: !!node?.closest('ul') && !inChecklist,
      ol: !!node?.closest('ol'),
      checklist: inChecklist,
      h2: !!node?.closest('h2'),
      quote: !!node?.closest('blockquote'),
      link: !!node?.closest('a'),
      table: !!node?.closest('table'),
      block: ((node?.closest('h1,h2,h3,pre,blockquote')?.tagName.toLowerCase() as BlockTag | undefined) ?? 'p'),
    };
  }, []);

  useEffect(() => {
    const onSel = () => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount && el.current?.contains(sel.anchorNode)) {
        lastRange.current = sel.getRangeAt(0).cloneRange();
        onFormatsRef.current?.(readFormats());
      }
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, [readFormats]);

  // Reajustar al abrirse el teclado.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const h = () => {
      if (document.activeElement === el.current) setTimeout(ensureCaretVisible, 60);
    };
    vv.addEventListener('resize', h);
    return () => vv.removeEventListener('resize', h);
  }, [ensureCaretVisible]);

  // Si el teclado está cerrado, aplicar un formato no debe abrirlo: se enfoca «en silencio»
  // (inputmode=none) y el teclado vuelve recién cuando tocás el texto.
  const silent = useRef(false);
  const restoreSelection = () => {
    const root = el.current;
    if (!root) return;
    if (document.activeElement !== root) {
      root.setAttribute('inputmode', 'none');
      silent.current = true;
      root.focus({ preventScroll: true });
      // Si igual apareció el teclado (algunas versiones de iOS ignoran inputmode), se cierra.
      const h0 = window.innerHeight;
      setTimeout(() => {
        const vv = window.visualViewport;
        if (silent.current && vv && vv.height < h0 * 0.8) root.blur();
      }, 350);
    }
    const sel = window.getSelection();
    if (lastRange.current && sel && root.contains(lastRange.current.startContainer)) {
      sel.removeAllRanges();
      sel.addRange(lastRange.current);
    } else if (sel && !root.contains(sel.anchorNode)) {
      const r = document.createRange();
      r.selectNodeContents(root);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  };

  const currentNode = () => {
    const sel = window.getSelection();
    const n = sel?.anchorNode;
    return n instanceof Element ? n : n?.parentElement ?? null;
  };

  const after = () => {
    emit();
    onFormatsRef.current?.(readFormats());
    requestAnimationFrame(ensureCaretVisible);
  };

  useImperativeHandle(ref, () => ({
    root: () => el.current,
    undo: () => {
      const h = hist.current;
      const prev = h.past.pop();
      if (prev === undefined) return;
      h.future.push(h.cur);
      applyHistory(prev);
    },
    redo: () => {
      const h = hist.current;
      const next = h.future.pop();
      if (next === undefined) return;
      h.past.push(h.cur);
      applyHistory(next);
    },
    focus: (atEnd = true) => {
      const root = el.current;
      if (!root) return;
      root.focus({ preventScroll: true });
      if (atEnd) {
        const r = document.createRange();
        r.selectNodeContents(root);
        r.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(r);
      }
    },
    exec: (command, value) => {
      restoreSelection();
      document.execCommand(command, false, value);
      after();
    },
    toggleBlock: (tag) => {
      restoreSelection();
      const inside = currentNode()?.closest(tag);
      document.execCommand('formatBlock', false, inside ? '<p>' : `<${tag}>`);
      after();
    },
    setBlock: (tag) => {
      restoreSelection();
      document.execCommand('formatBlock', false, `<${tag}>`);
      after();
    },
    toggleChecklist: () => {
      restoreSelection();
      const node = currentNode();
      const ul = node?.closest('ul');
      if (ul && ul.classList.contains('checklist')) {
        document.execCommand('insertUnorderedList');
      } else if (ul && el.current?.contains(ul)) {
        ul.classList.add('checklist');
        ul.querySelectorAll(':scope > li').forEach((li) => li.setAttribute('data-checked', 'false'));
      } else {
        if (node?.closest('ol')) document.execCommand('insertOrderedList');
        document.execCommand('insertUnorderedList');
        const list = currentNode()?.closest('ul');
        if (list) {
          list.classList.add('checklist');
          list.querySelectorAll(':scope > li').forEach((li) => li.setAttribute('data-checked', 'false'));
        }
      }
      after();
    },
    insertLink: (url, text) => {
      restoreSelection();
      const sel = window.getSelection();
      const existing = currentNode()?.closest('a');
      if (existing) {
        existing.setAttribute('href', url);
      } else if (sel && !sel.isCollapsed) {
        document.execCommand('createLink', false, url);
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.textContent = text?.trim() || url.replace(/^https?:\/\//, '');
        document.execCommand('insertHTML', false, a.outerHTML + '&nbsp;');
      }
      after();
    },
    insertImage: (src) => {
      restoreSelection();
      document.execCommand('insertHTML', false, `<img src="${src}" alt=""><p><br></p>`);
      after();
    },
    addTableRow: () => {
      restoreSelection();
      const tr = currentNode()?.closest('tr');
      if (!tr || !el.current?.contains(tr)) return false;
      const row = document.createElement('tr');
      tr.querySelectorAll('td,th').forEach(() => {
        const td = document.createElement('td');
        td.innerHTML = '<br>';
        row.appendChild(td);
      });
      const body = tr.parentElement?.tagName === 'THEAD' ? tr.closest('table')?.querySelector('tbody') : null;
      if (body) body.insertBefore(row, body.firstChild);
      else tr.after(row);
      after();
      return true;
    },
    deleteTableRow: () => {
      restoreSelection();
      const tr = currentNode()?.closest('tr');
      const table = tr?.closest('table');
      if (!tr || !table || !el.current?.contains(tr)) return false;
      const rows = table.querySelectorAll('tbody tr');
      if (tr.parentElement?.tagName === 'THEAD' || rows.length <= 1) return false;
      const next = (tr.nextElementSibling ?? tr.previousElementSibling) as HTMLElement | null;
      tr.remove();
      const cell = next?.querySelector('td');
      if (cell) {
        const r = document.createRange();
        r.selectNodeContents(cell);
        r.collapse(true);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(r);
      }
      after();
      return true;
    },
    deleteTable: () => {
      restoreSelection();
      const table = currentNode()?.closest('table');
      if (!table || !el.current?.contains(table)) return false;
      const p = document.createElement('p');
      p.innerHTML = '<br>';
      table.replaceWith(p);
      const r = document.createRange();
      r.setStart(p, 0);
      r.collapse(true);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(r);
      after();
      return true;
    },
    replaceSelection: (html) => {
      restoreSelection();
      document.execCommand('insertHTML', false, html);
      after();
    },
    appendHtml: (html) => {
      const root = el.current;
      if (!root) return;
      root.insertAdjacentHTML('beforeend', sanitizeHtml(html));
      emit();
    },
    getSelectedText: () => lastRange.current?.toString() ?? '',
    getLinkAtSelection: () => {
      const n = lastRange.current?.startContainer;
      const node = n instanceof Element ? n : n?.parentElement;
      return node?.closest('a')?.getAttribute('href') ?? null;
    },
  }));

  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    if (html) document.execCommand('insertHTML', false, sanitizeHtml(html));
    else document.execCommand('insertText', false, text);
    after();
  };

  const onClick = (e: React.MouseEvent) => {
    const li = (e.target as Element).closest('ul.checklist > li');
    if (!li) return;
    const rect = li.getBoundingClientRect();
    if (e.clientX - rect.left <= 30) {
      e.preventDefault();
      li.setAttribute('data-checked', li.getAttribute('data-checked') === 'true' ? 'false' : 'true');
      emit();
    }
  };

  const onInput = (e: React.FormEvent) => {
    const ie = e.nativeEvent as InputEvent;
    // La primera línea escrita en un editor vacío queda como texto suelto: se envuelve en <p>.
    const root = el.current;
    if (root && Array.from(root.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())) {
      document.execCommand('formatBlock', false, 'p');
    }
    if (ie.inputType === 'insertParagraph') {
      const li = currentNode()?.closest('ul.checklist > li');
      if (li && !li.textContent?.trim()) li.setAttribute('data-checked', 'false');
    }
    after();
  };

  return (
    <div
      ref={el}
      className={cx('rich-editor', className)}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label="Contenido de la entrada"
      data-placeholder={placeholder}
      spellCheck
      autoCorrect="on"
      autoCapitalize="sentences"
      onInput={onInput}
      onPaste={onPaste}
      onClick={onClick}
      onFocus={() => {
        if (silent.current) return;
        onFocusChange?.(true);
        setTimeout(ensureCaretVisible, 250);
      }}
      onBlur={() => {
        el.current?.removeAttribute('inputmode');
        silent.current = false;
        onFocusChange?.(false);
      }}
      onPointerDown={() => {
        // Tocar el texto después de un formato «silencioso»: ahora sí, teclado.
        if (!silent.current) return;
        silent.current = false;
        el.current?.removeAttribute('inputmode');
        el.current?.blur();
      }}
      onKeyDown={(e) => {
        const mod = e.metaKey || e.ctrlKey;
        if (mod && e.key.toLowerCase() === 'k') {
          // Evita el atajo global de búsqueda mientras se escribe.
          e.stopPropagation();
        }
      }}
    />
  );
});
