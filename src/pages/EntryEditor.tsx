import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BottomSheet, Icon, NavBar, SheetAction, useFeedback, useGoBack } from '@/components/ui';
import { RichEditor, type ActiveFormats, type RichEditorHandle } from '@/components/editor/RichEditor';
import { EditorToolbar } from '@/components/editor/EditorToolbar';
import { DrawingSheet } from '@/components/editor/DrawingSheet';
import { AISheet } from '@/components/editor/AISheet';
import { ImageSheet } from '@/components/editor/ImageSheet';
import { VoiceAnalysisSheet } from '@/components/editor/VoiceAnalysisSheet';
import { LinkPicker, RelatedPanel } from '@/components/entries/Related';
import { store } from '@/database/store';
import { useAutosave } from '@/hooks/useAutosave';
import { useStore } from '@/hooks/useData';
import { deleteEntry, deleteNote, newEntry, newNote, saveEntry, saveNote } from '@/services/actions';
import { aiAvailable, aiProblem, transcribe } from '@/services/ai';
import { VoiceRecorder } from '@/services/recorder';
import type { JournalEntry, Note, NoteType, PaperStyle } from '@/types';
import { formatEntryDate, todayISO } from '@/utils/date';
import { escapeHtml, htmlToMarkdown, htmlToText, wordCount } from '@/utils/html';
import { cx, resizeImage, shareOrDownload } from '@/utils/misc';

type Doc = JournalEntry | Note;

const EMPTY_FORMATS: ActiveFormats = { bold: false, italic: false, underline: false, ul: false, ol: false, checklist: false, h2: false, quote: false, link: false, table: false, block: 'p' };

function resolve(kind: 'journal' | 'note', id: string, params: URLSearchParams): Doc {
  if (kind === 'journal') {
    if (id === 'hoy') return store.getSnapshot().journal.find((e) => e.entryDate === todayISO()) ?? newEntry(todayISO());
    if (id === 'nueva') return newEntry(params.get('fecha') ?? todayISO());
    return store.get('journal', id) ?? newEntry();
  }
  if (id === 'nueva') return newNote((params.get('tipo') as NoteType) || 'note', params.get('carpeta'));
  return store.get('note', id) ?? newNote();
}

export default function EntryEditor({ kind }: { kind: 'journal' | 'note' }) {
  const { id = 'nueva' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const goBack = useGoBack('/cuaderno');
  const snap = useStore();
  const { toast, confirm } = useFeedback();
  const [history, setHistory] = useState({ undo: false, redo: false });

  const initial = useMemo(() => resolve(kind, id, params), []); // eslint-disable-line react-hooks/exhaustive-deps
  const doc = useRef<Doc>(initial);
  const [meta, setMeta] = useState<Doc>(initial);
  const [formats, setFormats] = useState<ActiveFormats>(EMPTY_FORMATS);
  const [focused, setFocused] = useState(false);
  const [sheet, setSheet] = useState<null | 'menu' | 'tags' | 'ai' | 'draw' | 'link' | 'image' | 'voice' | 'connect'>(null);
  const [drawBg, setDrawBg] = useState<string | null>(null);
  const [voiceText, setVoiceText] = useState('');
  const [hasSel, setHasSel] = useState(false);
  const [aiSource, setAiSource] = useState({ text: '', selection: false });
  const [rec, setRec] = useState<VoiceRecorder | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const editor = useRef<RichEditorHandle>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [tagInput, setTagInput] = useState('');

  const autosave = useAutosave<Doc>(async (d) => {
    if (d.kind === 'journal') await saveEntry(d);
    else await saveNote(d);
  }, 700);

  // Reemplaza la URL "nueva/hoy" por el id real una vez guardado.
  useEffect(() => {
    if ((id === 'nueva' || id === 'hoy') && store.raw(doc.current.id)) {
      navigate(kind === 'journal' ? `/journal/${doc.current.id}` : `/biblioteca/nota/${doc.current.id}`, { replace: true });
    }
  }, [snap.version, id, kind, navigate]);

  const update = (patch: Partial<Doc>) => {
    doc.current = { ...doc.current, ...patch } as Doc;
    setMeta(doc.current);
    autosave.schedule(doc.current);
  };

  const words = wordCount(htmlToText(meta.content));
  const stateLabel = autosave.state === 'saving' || autosave.state === 'dirty' ? 'Guardando…' : autosave.state === 'error' ? 'Error al guardar' : words ? `${words} ${words === 1 ? 'palabra' : 'palabras'}` : '';

  const done = async () => {
    await autosave.flush();
    goBack();
  };

  const openAI = () => {
    const sel = editor.current?.getSelectedText().trim() ?? '';
    setAiSource(sel.length > 3 ? { text: sel, selection: true } : { text: htmlToText(doc.current.content), selection: false });
    setSheet('ai');
  };

  const voice = async () => {
    if (rec) {
      const r = rec;
      setRec(null);
      setTranscribing(true);
      try {
        const text = await transcribe(await r.stop());
        if (text) {
          editor.current?.replaceSelection(`<p>${escapeHtml(text)}</p>`);
          if (text.split(/\s+/).length > 25) {
            toast('Transcripción agregada', { action: { label: 'Analizar', onClick: () => { setVoiceText(text); setSheet('voice'); } }, duration: 6000 });
          }
        }
      } catch (e) {
        toast((e as Error).message, { tone: 'error' });
      } finally {
        setTranscribing(false);
      }
      return;
    }
    if (!aiAvailable()) {
      toast(aiProblem() ?? 'Usá el micrófono del teclado para dictar.', { duration: 4200 });
      return;
    }
    try {
      const r = new VoiceRecorder();
      await r.start();
      setRec(r);
    } catch {
      toast('Sin permiso para usar el micrófono.', { tone: 'error' });
    }
  };

  useEffect(() => () => rec?.cancel(), [rec]);

  // IA contextual: aparece solo cuando hay texto seleccionado.
  useEffect(() => {
    const onSel = () => {
      const sel = window.getSelection();
      const root = editor.current?.root();
      setHasSel(!!sel && !sel.isCollapsed && !!root && root.contains(sel.anchorNode) && sel.toString().trim().length > 2);
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, []);

  const remove = async () => {
    setSheet(null);
    if (!store.raw(doc.current.id)) return goBack();
    if (!(await confirm({ title: kind === 'journal' ? '¿Eliminar la entrada?' : '¿Eliminar la nota?', message: 'No se puede deshacer.', confirmLabel: 'Eliminar', danger: true }))) return;
    if (kind === 'journal') await deleteEntry(doc.current.id);
    else await deleteNote(doc.current.id);
    navigate('/cuaderno', { replace: true });
  };

  const exportMd = async () => {
    setSheet(null);
    await autosave.flush();
    const d = doc.current;
    const title = d.title || (d.kind === 'journal' ? formatEntryDate(d.entryDate) : 'Nota');
    const md = `# ${title}\n\n${htmlToMarkdown(d.content)}`;
    await shareOrDownload(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${title.replace(/[\\/:*?"<>|]/g, '-')}.md`);
  };

  const paper = (meta.paper ?? 'plain') as PaperStyle;
  const folders = snap.folder.filter((f) => f.scope !== 'media');

  return (
    <main className={cx('editor-page', focused && 'is-focused')}>
      <div className="editor-scroll" ref={scroller}>
        <div className="page editor-inner">
          <NavBar
            backLabel="Cuaderno"
            onBack={() => void done()}
            title={<span className="navbar-state">{stateLabel}</span>}
            end={
              <>
                <button type="button" className="icon-btn" aria-label="Deshacer" disabled={!history.undo} onPointerDown={(e) => e.preventDefault()} onClick={() => editor.current?.undo()}>
                  <Icon name="undo" size={20} />
                </button>
                <button type="button" className="icon-btn" aria-label="Rehacer" disabled={!history.redo} onPointerDown={(e) => e.preventDefault()} onClick={() => editor.current?.redo()}>
                  <Icon name="redo" size={20} />
                </button>
                <button type="button" className="icon-btn" aria-label="Leer" onClick={async () => { await autosave.flush(); if (store.raw(doc.current.id)) navigate(`${kind === 'journal' ? '/journal' : '/biblioteca/nota'}/${doc.current.id}/leer`); }}>
                  <Icon name="book" size={21} />
                </button>
                <button type="button" className="icon-btn" aria-label="Opciones" onClick={() => setSheet('menu')}>
                  <Icon name="more" size={22} />
                </button>
              </>
            }
          />

          <div className="editor-head">
            {meta.kind === 'journal' ? (
              <label className="editor-date">
                <span>{formatEntryDate(meta.entryDate)}</span>
                <input type="date" value={meta.entryDate} onChange={(e) => e.target.value && update({ entryDate: e.target.value })} aria-label="Fecha de la entrada" />
              </label>
            ) : (
              <div className="editor-date">{meta.noteType === 'idea' ? 'Idea' : meta.noteType === 'link' ? 'Enlace' : 'Nota'}{meta.folderId && folders.find((f) => f.id === meta.folderId) ? ` · ${folders.find((f) => f.id === meta.folderId)!.name}` : ''}</div>
            )}
            <textarea
              className="editor-title"
              rows={1}
              value={meta.title ?? ''}
              placeholder={meta.kind === 'journal' ? 'Título (opcional)' : 'Título'}
              onChange={(e) => update({ title: e.target.value.replace(/\n/g, ' ') })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  editor.current?.focus(false);
                }
              }}
              ref={(el) => {
                if (el) {
                  el.style.height = 'auto';
                  el.style.height = `${el.scrollHeight}px`;
                }
              }}
            />
            {meta.kind === 'note' && meta.noteType === 'link' && (
              <input className="editor-url" type="url" placeholder="https://" value={meta.url ?? ''} onChange={(e) => update({ url: e.target.value })} />
            )}
            {meta.tags.length > 0 && (
              <button type="button" className="editor-tags" onClick={() => setSheet('tags')}>
                {meta.tags.map((t) => <span key={t}>#{t}</span>)}
              </button>
            )}
          </div>

          <div className={cx('editor-body', paper !== 'plain' && `paper-${paper}`)}>
            <RichEditor
              ref={editor}
              initialHtml={initial.content}
              onChange={(html) => update({ content: html })}
              onFormats={setFormats}
              onFocusChange={setFocused}
              onHistory={setHistory}
              scrollContainer={scroller}
              className="prose"
              placeholder={meta.kind === 'journal' ? 'Escribí lo que quieras…' : 'Empezá a escribir…'}
            />
          </div>
          {store.raw(meta.id) && <div className="editor-related"><RelatedPanel id={meta.id} onLink={() => setSheet('connect')} /></div>}
        </div>
      </div>

      {hasSel && !rec && (
        <button type="button" className="capsule ask-ai" onPointerDown={(e) => e.preventDefault()} onClick={openAI}>
          <Icon name="sparkle" size={16} /> Preguntar a la IA
        </button>
      )}
      <div className={cx('editor-dock', rec && 'is-recording')}>
        {rec || transcribing ? (
          <div className="capsule rec-capsule" role="group" aria-label="Grabación">
            {transcribing ? (
              <><span className="spinner" /><span className="grow">Transcribiendo…</span></>
            ) : (
              <>
                <RecTimer />
                <span className="rec-dots" aria-hidden="true">{Array.from({ length: 16 }, (_, i) => <i key={i} style={{ animationDelay: `${(i * 97) % 700}ms` }} />)}</span>
                <button type="button" className="rec-icon" aria-label="Descartar" onClick={() => { rec?.cancel(); setRec(null); }}><Icon name="trash" size={18} /></button>
                <button type="button" className="rec-save" aria-label="Terminar y transcribir" onClick={() => void voice()}><Icon name="check" size={18} strokeWidth={2.6} /></button>
              </>
            )}
          </div>
        ) : (
          <div className="capsule editor-capsule">
            <EditorToolbar
              editor={editor}
              formats={formats}
              onLink={() => { setLinkUrl(editor.current?.getLinkAtSelection() ?? ''); setSheet('link'); }}
              onImage={async (f) => editor.current?.insertImage(await resizeImage(f))}
              onDone={() => (document.activeElement as HTMLElement)?.blur()}
              showDone={focused}
              onDraw={() => setSheet('draw')}
              onVoice={() => void voice()}
              onAI={openAI}
              recording={!!rec}
              onImageMenu={() => setSheet('image')}
            />
          </div>
        )}
      </div>

      <BottomSheet open={sheet === 'menu'} onClose={() => setSheet(null)} title="Opciones" hideTitle initialFocus="none">
        <div className="group-body">
          <SheetAction icon={<Icon name="star" size={20} filled={meta.isFavorite} strokeWidth={meta.isFavorite ? 0 : 1.75} />} label={meta.isFavorite ? 'Quitar de favoritos' : 'Marcar como favorita'} onClick={() => { update({ isFavorite: !meta.isFavorite }); setSheet(null); }} />
          {meta.kind === 'note' && (
            <SheetAction icon={<Icon name="pin" size={20} />} label={meta.isPinned ? 'Desfijar' : 'Fijar arriba'} onClick={() => { update({ isPinned: !meta.isPinned } as Partial<Note>); setSheet(null); }} />
          )}
          <SheetAction icon={<Icon name="tag" size={20} />} label="Etiquetas" hint={meta.tags.length ? String(meta.tags.length) : undefined} onClick={() => setSheet('tags')} />
          <SheetAction icon={<Icon name="sparkle" size={20} />} label="IA" onClick={openAI} />
          {meta.kind === 'journal' && (
            <SheetAction icon={<Icon name="globe" size={20} />} label="Practicar este día en inglés" onClick={async () => { await autosave.flush(); navigate(`/ingles/diario?entrada=${doc.current.id}`); }} />
          )}
          <SheetAction icon={<Icon name="sparkle" size={20} />} label="Preguntar al asistente sobre esto" onClick={async () => { await autosave.flush(); navigate(`/asistente?ctx=${doc.current.id}`); }} />
          <SheetAction icon={<Icon name="link" size={20} />} label="Vincular con…" hint="libro, PDF, nota" onClick={() => setSheet('connect')} />
        </div>
        {meta.kind === 'note' && (
          <>
            <p className="field-label mt-6">Tipo</p>
            <div className="chips-wrap mt-2">
              {(['note', 'idea', 'link'] as NoteType[]).map((t) => (
                <button key={t} type="button" className="chip" aria-pressed={meta.noteType === t} onClick={() => update({ noteType: t } as Partial<Note>)}>
                  {t === 'note' ? 'Nota' : t === 'idea' ? 'Idea' : 'Enlace'}
                </button>
              ))}
            </div>
            <p className="field-label mt-4">Carpeta</p>
            <div className="chips-wrap mt-2">
              <button type="button" className="chip" aria-pressed={!meta.folderId} onClick={() => update({ folderId: null } as Partial<Note>)}>Ninguna</button>
              {folders.map((f) => (
                <button key={f.id} type="button" className="chip" aria-pressed={meta.folderId === f.id} onClick={() => update({ folderId: f.id } as Partial<Note>)}>{f.name}</button>
              ))}
            </div>
          </>
        )}
        <p className="field-label mt-4">Papel</p>
        <div className="chips-wrap mt-2">
          {(['plain', 'lined', 'dotted', 'grid'] as PaperStyle[]).map((p) => (
            <button key={p} type="button" className="chip" aria-pressed={paper === p} onClick={() => update({ paper: p })}>
              {{ plain: 'Liso', lined: 'Rayado', dotted: 'Punteado', grid: 'Cuadriculado' }[p]}
            </button>
          ))}
        </div>
        <div className="group-body mt-6">
          <SheetAction icon={<Icon name="share" size={20} />} label="Exportar a Markdown" onClick={() => void exportMd()} />
          <SheetAction icon={<Icon name="pdf" size={20} />} label="Exportar como PDF" onClick={async () => { setSheet(null); await autosave.flush(); if (store.raw(doc.current.id)) navigate(`${kind === 'journal' ? '/journal' : '/biblioteca/nota'}/${doc.current.id}/leer?imprimir=1`); }} />
          <SheetAction icon={<Icon name="trash" size={20} />} label="Eliminar" danger onClick={() => void remove()} />
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === 'tags'} onClose={() => setSheet(null)} title="Etiquetas">
        <form
          className="hstack"
          onSubmit={(e) => {
            e.preventDefault();
            const t = tagInput.trim().replace(/^#/, '').toLowerCase();
            if (t && !meta.tags.includes(t)) update({ tags: [...meta.tags, t] });
            setTagInput('');
          }}
        >
          <input className="input grow" placeholder="Nueva etiqueta" value={tagInput} onChange={(e) => setTagInput(e.target.value)} enterKeyHint="done" autoCapitalize="none" />
          <button type="submit" className="btn btn-tinted" disabled={!tagInput.trim()}>Agregar</button>
        </form>
        <div className="chips-wrap mt-4">
          {meta.tags.map((t) => (
            <button key={t} type="button" className="chip" aria-pressed="true" onClick={() => update({ tags: meta.tags.filter((x) => x !== t) })}>
              #{t} <Icon name="x" size={14} />
            </button>
          ))}
          {(() => {
            const all = new Set<string>();
            [...snap.journal, ...snap.note].forEach((d) => d.tags.forEach((t) => all.add(t)));
            return [...all].filter((t) => !meta.tags.includes(t)).slice(0, 16).map((t) => (
              <button key={t} type="button" className="chip" onClick={() => update({ tags: [...meta.tags, t] })}>#{t}</button>
            ));
          })()}
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === 'link'} onClose={() => setSheet(null)} title="Enlace">
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (linkUrl.trim()) editor.current?.insertLink(linkUrl.trim());
            setSheet(null);
          }}
        >
          <input className="input" type="url" inputMode="url" placeholder="https://" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} autoCapitalize="none" data-autofocus />
          <button type="submit" className="btn btn-primary" disabled={!linkUrl.trim()}>Insertar enlace</button>
        </form>
      </BottomSheet>

      <DrawingSheet open={sheet === 'draw'} onClose={() => { setSheet(null); setDrawBg(null); }} onInsert={(src) => editor.current?.insertImage(src)} background={drawBg} />
      <ImageSheet
        open={sheet === 'image'}
        onClose={() => setSheet((s) => (s === 'image' ? null : s))}
        onInsert={(src, html) => {
          editor.current?.insertImage(src);
          if (html) editor.current?.appendHtml(html);
        }}
        onDrawOn={(src) => { setDrawBg(src); setSheet('draw'); }}
      />
      <VoiceAnalysisSheet open={sheet === 'voice'} onClose={() => setSheet(null)} transcript={voiceText} sourceId={doc.current.id} onInsert={(html) => editor.current?.appendHtml(html)} />
      <LinkPicker open={sheet === 'connect'} onClose={() => setSheet(null)} fromId={doc.current.id} />

      <AISheet
        open={sheet === 'ai'}
        onClose={() => setSheet(null)}
        source={aiSource}
        sourceId={doc.current.id}
        onReplace={(html, selection) => {
          if (selection) editor.current?.replaceSelection(html);
          else {
            const root = editor.current?.root();
            if (root) {
              root.innerHTML = html;
              update({ content: html });
            }
          }
        }}
        onAppend={(html) => editor.current?.appendHtml(html)}
      />
    </main>
  );
}

function RecTimer() {
  const [t0] = useState(() => Date.now());
  const [, tick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(i);
  }, []);
  const s = Math.floor((Date.now() - t0) / 1000);
  return <span className="rec-time num">{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</span>;
}
