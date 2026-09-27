/**
 * Utilidades HTML: saneado del contenido del editor, extracción de texto
 * y conversión a Markdown para exportar.
 */

const ALLOWED_TAGS = new Set([
  'P', 'DIV', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'UL', 'OL', 'LI', 'A',
  'H1', 'H2', 'H3', 'PRE', 'BLOCKQUOTE', 'HR', 'IMG', 'SPAN', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD',
]);
const DROP_WITH_CONTENT = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'NOSCRIPT', 'SVG', 'MATH', 'META', 'LINK', 'HEAD', 'TITLE']);

function safeHref(href: string | null): string | null {
  if (!href) return null;
  const v = href.trim();
  if (/^(https?:|mailto:|tel:)/i.test(v)) return v;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(v)) return 'https://' + v;
  return null;
}

function safeImgSrc(src: string | null): string | null {
  if (!src) return null;
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(src)) return src;
  if (/^https:\/\//i.test(src)) return src;
  return null;
}

function cleanNode(node: Node, doc: Document): Node | DocumentFragment | null {
  if (node.nodeType === Node.TEXT_NODE) return doc.createTextNode(node.textContent || '');
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const el = node as Element;
  const tag = el.tagName.toUpperCase();
  if (DROP_WITH_CONTENT.has(tag)) return null;

  const children = () => {
    const frag = doc.createDocumentFragment();
    el.childNodes.forEach((c) => {
      const cleaned = cleanNode(c, doc);
      if (cleaned) frag.appendChild(cleaned);
    });
    return frag;
  };

  if (!ALLOWED_TAGS.has(tag)) {
    // Etiquetas desconocidas: se conservan sus hijos. Los bloques se convierten en <p>.
    if (/^(H1|H4|H5|H6|SECTION|ARTICLE|HEADER|FOOTER|PRE|FIGURE)$/.test(tag)) {
      const p = doc.createElement(tag === 'H1' ? 'h2' : 'p');
      p.appendChild(children());
      return p;
    }
    return children();
  }

  let out: Element;
  switch (tag) {
    case 'B':
      out = doc.createElement('strong');
      break;
    case 'I':
      out = doc.createElement('em');
      break;
    case 'SPAN': {
      // Los <span> solo aportan estilos inline; se desenvuelven.
      return children();
    }
    default:
      out = doc.createElement(tag.toLowerCase());
  }

  if (tag === 'A') {
    const href = safeHref(el.getAttribute('href'));
    if (!href) return children();
    out.setAttribute('href', href);
    out.setAttribute('target', '_blank');
    out.setAttribute('rel', 'noopener noreferrer');
  }
  if (tag === 'IMG') {
    const src = safeImgSrc(el.getAttribute('src'));
    if (!src) return null;
    out.setAttribute('src', src);
    out.setAttribute('alt', (el.getAttribute('alt') || '').slice(0, 200));
    return out;
  }
  if (tag === 'UL' && el.classList.contains('checklist')) out.setAttribute('class', 'checklist');
  if (tag === 'LI') {
    const checked = el.getAttribute('data-checked');
    if (checked === 'true' || checked === 'false') out.setAttribute('data-checked', checked);
  }
  if (tag === 'BR' || tag === 'HR') return out;
  out.appendChild(children());
  return out;
}

const BLOCK = /^(P|DIV|UL|OL|H2|H3|BLOCKQUOTE|HR|IMG|TABLE)$/;

/** Agrupa texto e inline sueltos en el nivel superior dentro de <p>. */
function wrapLooseInline(container: HTMLElement, doc: Document) {
  let run: Node[] = [];
  const flush = (before: Node | null) => {
    while (run.length && run[run.length - 1].nodeName === 'BR') container.removeChild(run.pop()!);
    const meaningful = run.some((n) => n.nodeType !== Node.TEXT_NODE || (n.textContent || '').trim());
    if (meaningful) {
      const p = doc.createElement('p');
      run.forEach((n) => p.appendChild(n));
      container.insertBefore(p, before);
    } else run.forEach((n) => n.parentNode && container.removeChild(n));
    run = [];
  };
  Array.from(container.childNodes).forEach((n) => {
    if (n.nodeType === Node.ELEMENT_NODE && BLOCK.test(n.nodeName)) flush(n);
    else run.push(n);
  });
  flush(null);
}

export function sanitizeHtml(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const target = document.implementation.createHTMLDocument('');
  const container = target.createElement('div');
  doc.body.childNodes.forEach((n) => {
    const c = cleanNode(n, target);
    if (c) container.appendChild(c);
  });
  // Normaliza <li> de checklists sin estado.
  container.querySelectorAll('ul.checklist > li:not([data-checked])').forEach((li) => li.setAttribute('data-checked', 'false'));
  wrapLooseInline(container, target);
  return container.innerHTML;
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Texto plano (con saltos de línea) desde texto → HTML de párrafos. */
export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

const textCache = new Map<string, string>();

/** Texto plano del HTML. Memoizado por clave (id+updatedAt) cuando se pasa. */
export function htmlToText(html: string, cacheKey?: string): string {
  if (cacheKey) {
    const hit = textCache.get(cacheKey);
    if (hit !== undefined) return hit;
  }
  const withBreaks = html
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h1|h2|h3|pre|blockquote|tr)>/gi, '\n')
    .replace(/<\/(td|th)>/gi, ' · ')
    .replace(/<img[^>]*>/gi, ' ');
  const doc = new DOMParser().parseFromString(withBreaks, 'text/html');
  const text = (doc.body.textContent || '').replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  if (cacheKey) {
    if (textCache.size > 2000) textCache.clear();
    textCache.set(cacheKey, text);
  }
  return text;
}

export function excerpt(html: string, cacheKey?: string, max = 160): string {
  const text = htmlToText(html, cacheKey).replace(/\n+/g, ' ');
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
}

export function hasImages(html: string): boolean {
  return /<img\s/i.test(html);
}

export function isHtmlEmpty(html: string): boolean {
  if (hasImages(html)) return false;
  return htmlToText(html).trim().length === 0;
}

export function wordCount(text: string): number {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

/** Convierte el HTML del editor a Markdown. */
export function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');

  const inline = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent || '').replace(/ /g, ' ');
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as Element;
    const inner = () => Array.from(el.childNodes).map(inline).join('');
    switch (el.tagName) {
      case 'STRONG':
      case 'B':
        return wrap(inner(), '**');
      case 'EM':
      case 'I':
        return wrap(inner(), '_');
      case 'S':
        return wrap(inner(), '~~');
      case 'A':
        return `[${inner()}](${el.getAttribute('href') || ''})`;
      case 'BR':
        return '  \n';
      case 'IMG':
        return `![${el.getAttribute('alt') || 'imagen'}](${el.getAttribute('src') || ''})`;
      default:
        return inner();
    }
  };

  const wrap = (s: string, m: string) => {
    const t = s.trim();
    if (!t) return s;
    const lead = s.match(/^\s*/)![0];
    const trail = s.match(/\s*$/)![0];
    return `${lead}${m}${t}${m}${trail}`;
  };

  const block = (node: Node, depth = 0): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent || '').trim();
      return t ? t + '\n\n' : '';
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as Element;
    const indent = '  '.repeat(depth);
    switch (el.tagName) {
      case 'H2':
        return `## ${inline(el).trim()}\n\n`;
      case 'H3':
        return `### ${inline(el).trim()}\n\n`;
      case 'HR':
        return `---\n\n`;
      case 'BLOCKQUOTE':
        return (
          Array.from(el.childNodes)
            .map((c) => block(c))
            .join('')
            .trim()
            .split('\n')
            .map((l) => `> ${l}`)
            .join('\n') + '\n\n'
        );
      case 'TABLE': {
        const rows = Array.from(el.querySelectorAll('tr')).map((tr) =>
          Array.from(tr.children).map((c) => inline(c).trim().replace(/\|/g, '\\|') || ' '));
        if (!rows.length) return '';
        const cols = Math.max(...rows.map((r) => r.length));
        const line = (r: string[]) => '| ' + Array.from({ length: cols }, (_, i) => r[i] ?? ' ').join(' | ') + ' |';
        return [line(rows[0]), '| ' + Array(cols).fill('---').join(' | ') + ' |', ...rows.slice(1).map(line)].join('\n') + '\n\n';
      }
      case 'UL':
      case 'OL': {
        const checklist = el.classList.contains('checklist');
        let i = 1;
        const lines = Array.from(el.children)
          .filter((c) => c.tagName === 'LI')
          .map((li) => {
            const nested = Array.from(li.children).filter((c) => c.tagName === 'UL' || c.tagName === 'OL');
            const text = Array.from(li.childNodes)
              .filter((c) => !(c instanceof Element && (c.tagName === 'UL' || c.tagName === 'OL')))
              .map(inline)
              .join('')
              .trim();
            const marker = checklist
              ? `- [${li.getAttribute('data-checked') === 'true' ? 'x' : ' '}]`
              : el.tagName === 'OL'
                ? `${i++}.`
                : '-';
            const sub = nested.map((n) => block(n, depth + 1).trimEnd()).join('\n');
            return `${indent}${marker} ${text}${sub ? '\n' + sub : ''}`;
          });
        return lines.join('\n') + (depth ? '\n' : '\n\n');
      }
      case 'P':
      case 'DIV': {
        const hasBlocks = Array.from(el.children).some((c) => /^(P|DIV|UL|OL|H2|H3|BLOCKQUOTE|HR)$/.test(c.tagName));
        if (hasBlocks) return Array.from(el.childNodes).map((c) => block(c, depth)).join('');
        const t = inline(el).trim();
        return t ? t + '\n\n' : '';
      }
      default: {
        const t = inline(el).trim();
        return t ? t + '\n\n' : '';
      }
    }
  };

  return Array.from(doc.body.childNodes)
    .map((n) => block(n))
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Normaliza para búsqueda: minúsculas y sin acentos. */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Markdown simple (respuestas de la IA) → HTML saneado. */
export function markdownToHtml(md: string): string {
  const inline = (s: string) =>
    escapeHtml(s)
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<i>$2</i>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  const close = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const raw of md.replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd();
    let m: RegExpMatchArray | null;
    if (!line.trim()) { close(); continue; }
    if ((m = line.match(/^#{1,2}\s+(.*)/))) { close(); out.push(`<h2>${inline(m[1])}</h2>`); continue; }
    if ((m = line.match(/^#{3,6}\s+(.*)/))) { close(); out.push(`<h3>${inline(m[1])}</h3>`); continue; }
    if ((m = line.match(/^\s*[-*•]\s+(.*)/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    if ((m = line.match(/^>\s?(.*)/))) { close(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); continue; }
    close();
    out.push(`<p>${inline(line)}</p>`);
  }
  close();
  return sanitizeHtml(out.join(''));
}
