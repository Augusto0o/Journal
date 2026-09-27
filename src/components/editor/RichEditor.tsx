import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { sanitizeHtml } from '@/utils/html';
import { cx } from '@/utils/misc';

export interface ActiveFormats {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  ul: boolean;
  ol: boolean;
  checklist: boolean;
  h2: boolean;
  quote: boolean;
  link: boolean;
}

export interface RichEditorHandle {
  focus: (atEnd?: boolean) => void;
  exec: (command: string, value?: string) => void;
  toggleChecklist: () => void;
  toggleBlock: (tag: 'h2' | 'blockquote') => void;
  insertLink: (url: string, text?: string) => void;
  insertImage: (src: string) => void;
  addTableRow: () => boolean;
  replaceSelection: (html: string) => void;
  appendHtml: (html: string) => void;
  getSelectedText: () => string;
  getLinkAtSelection: () => string | null;
  root: () => HTMLDivElement | null;
}

interface RichEditorProps {
  initialHtml: string;
  onChange: (html: string) => void;
  onFormats?: (f: ActiveFormats) => void;
  onFocusChange?: (focused: boolean) => void;
  placeholder?: string;
  scrollContainer?: React.RefObject<HTMLElement>;
  className?: string;
}

const EMPTY_FORMATS: ActiveFormats = { bold: false, italic: false, underline: false, ul: false, ol: false, checklist: false, h2: false, quote: false, link: false };

/**
 * Editor de texto enriquecido basado en contentEditable.
 * Es no-controlado: el HTML inicial se fija una vez y los cambios se emiten con onChange.
 */
export const RichEditor = forwardRef<RichEditorHandle, RichEditorProps>(function RichEditor(
  { initialHtml, onChange, onFormats, onFocusChange, placeholder, scrollContainer, className },
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

  const emit = useCallback(() => {
    updateEmpty();
    onChangeRef.current(el.current?.innerHTML ?? '');
  }, [updateEmpty]);

  // HTML inicial (una sola vez)
  useEffect(() => {
    if (!el.current) return;
    el.current.innerHTML = sanitizeHtml(initialHtml) || '';
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

  const restoreSelection = () => {
    const root = el.current;
    if (!root) return;
    if (document.activeElement !== root) root.focus({ preventScroll: true });
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
        onFocusChange?.(true);
        setTimeout(ensureCaretVisible, 250);
      }}
      onBlur={() => onFocusChange?.(false)}
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
