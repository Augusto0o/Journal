import { useRef, useState } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import type { ActiveFormats, BlockTag, RichEditorHandle } from './RichEditor';
import { cx } from '@/utils/misc';

interface ToolbarProps {
  editor: React.RefObject<RichEditorHandle>;
  formats: ActiveFormats;
  onLink: () => void;
  onImage: (file: File) => void;
  onDone?: () => void;
  showDone?: boolean;
  onDraw: () => void;
  onVoice: () => void;
  onAI: () => void;
  recording?: boolean;
  onImageMenu?: () => void;
}

const TABLE_HTML =
  '<table><thead><tr><th>Columna 1</th><th>Columna 2</th><th>Columna 3</th></tr></thead><tbody><tr><td><br></td><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td><td><br></td></tr></tbody></table><p><br></p>';

const STYLES: { tag: BlockTag; label: string; cls: string }[] = [
  { tag: 'h1', label: 'Título', cls: 'st-h1' },
  { tag: 'h2', label: 'Encabezado', cls: 'st-h2' },
  { tag: 'h3', label: 'Subencabezado', cls: 'st-h3' },
  { tag: 'p', label: 'Cuerpo', cls: 'st-p' },
  { tag: 'pre', label: 'Monoespaciado', cls: 'st-pre' },
  { tag: 'blockquote', label: 'Cita', cls: 'st-quote' },
];
const STYLE_LABEL: Record<BlockTag, string> = { h1: 'Título', h2: 'Encabezado', h3: 'Subenc.', p: 'Cuerpo', pre: 'Mono', blockquote: 'Cita' };

function Tool({ icon, label, active, onPress, accent }: { icon: IconName; label: string; active?: boolean; onPress: () => void; accent?: boolean }) {
  return (
    <button
      type="button"
      className={cx('tool', active && 'is-active', accent && 'is-accent')}
      aria-label={label}
      title={label}
      aria-pressed={active}
      // Evita que el editor pierda el foco (y que se cierre el teclado).
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPress}
    >
      <Icon name={icon} size={20} strokeWidth={active ? 2.2 : 1.8} />
    </button>
  );
}

export function EditorToolbar({ editor, formats, onLink, onImage, onDone, showDone, onDraw, onVoice, onAI, recording, onImageMenu }: ToolbarProps) {
  const [more, setMore] = useState(false);
  const [styles, setStyles] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const ed = () => editor.current;

  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Formato de texto">
      {styles && (
        <div className="style-menu float-card" role="menu" aria-label="Estilos de texto">
          {STYLES.map((st) => (
            <button
              key={st.tag}
              type="button"
              role="menuitemradio"
              aria-checked={formats.block === st.tag}
              className={cx('style-item', st.cls)}
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { ed()?.setBlock(st.tag); setStyles(false); }}
            >
              {st.label}
              {formats.block === st.tag && <Icon name="check" size={16} />}
            </button>
          ))}
          <div className="style-lists">
            <button type="button" aria-label="Lista con viñetas" aria-pressed={formats.ul} onPointerDown={(e) => e.preventDefault()} onClick={() => { ed()?.exec('insertUnorderedList'); setStyles(false); }}><Icon name="list" size={18} /></button>
            <button type="button" aria-label="Lista numerada" aria-pressed={formats.ol} onPointerDown={(e) => e.preventDefault()} onClick={() => { ed()?.exec('insertOrderedList'); setStyles(false); }}><Icon name="listOrdered" size={18} /></button>
            <button type="button" aria-label="Lista de tareas" aria-pressed={formats.checklist} onPointerDown={(e) => e.preventDefault()} onClick={() => { ed()?.toggleChecklist(); setStyles(false); }}><Icon name="checklist" size={18} /></button>
          </div>
        </div>
      )}
      <div className="toolbar-scroll">
        {formats.table ? (
          <>
            <span className="tool-label">Tabla</span>
            <Tool icon="plus" label="Agregar fila" onPress={() => ed()?.addTableRow()} />
            <Tool icon="x" label="Quitar fila" onPress={() => ed()?.deleteTableRow()} />
            <span className="tool-sep" aria-hidden="true" />
            <Tool icon="trash" label="Eliminar tabla" onPress={() => ed()?.deleteTable()} />
            <span className="tool-sep" aria-hidden="true" />
            <Tool icon="bold" label="Negrita" active={formats.bold} onPress={() => ed()?.exec('bold')} />
          </>
        ) : !more ? (
          <>
            <button
              type="button"
              className={cx('tool tool-style', formats.h2 && 'is-active')}
              aria-label="Estilo de texto"
              aria-expanded={styles}
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setStyles((v) => !v)}
            >
              {STYLE_LABEL[formats.block] ?? 'Cuerpo'} <Icon name="chevronDown" size={13} />
            </button>
            <span className="tool-sep" aria-hidden="true" />
            <Tool icon="bold" label="Negrita" active={formats.bold} onPress={() => ed()?.exec('bold')} />
            <Tool icon="italic" label="Cursiva" active={formats.italic} onPress={() => ed()?.exec('italic')} />
            <span className="tool-sep" aria-hidden="true" />
            <Tool icon="image" label="Imagen" onPress={() => (onImageMenu ? onImageMenu() : fileRef.current?.click())} />
            <Tool icon="draw" label="Dibujar" onPress={onDraw} />
            <Tool icon="mic" label={recording ? 'Terminar dictado' : 'Dictar'} active={recording} onPress={onVoice} />
            <Tool icon="more" label="Más herramientas" onPress={() => setMore(true)} />
          </>
        ) : (
          <>
            <Tool icon="checklist" label="Lista de tareas" active={formats.checklist} onPress={() => ed()?.toggleChecklist()} />
            <Tool icon="underline" label="Subrayado" active={formats.underline} onPress={() => ed()?.exec('underline')} />
            <Tool icon="list" label="Lista" active={formats.ul} onPress={() => ed()?.exec('insertUnorderedList')} />
            <Tool icon="listOrdered" label="Lista numerada" active={formats.ol} onPress={() => ed()?.exec('insertOrderedList')} />
            <Tool icon="quote" label="Cita" active={formats.quote} onPress={() => ed()?.toggleBlock('blockquote')} />
            <span className="tool-sep" aria-hidden="true" />
            <Tool icon="link" label="Enlace" active={formats.link} onPress={onLink} />
            <Tool icon="table" label="Tabla" onPress={() => { ed()?.exec('insertHTML', TABLE_HTML); setMore(false); }} />
            <Tool icon="divider" label="Separador" onPress={() => ed()?.exec('insertHorizontalRule')} />
            <Tool icon="eraser" label="Quitar formato" onPress={() => ed()?.exec('removeFormat')} />
          </>
        )}
      </div>
      {more && !formats.table ? (
        <button type="button" className="tool-x" aria-label="Menos herramientas" onPointerDown={(e) => e.preventDefault()} onClick={() => setMore(false)}>
          <Icon name="x" size={14} strokeWidth={2.6} />
        </button>
      ) : showDone && onDone ? (
        <button type="button" className="tool-x" onPointerDown={(e) => e.preventDefault()} onClick={onDone} aria-label="Ocultar teclado">
          <Icon name="chevronDown" size={16} strokeWidth={2.4} />
        </button>
      ) : null}
      <button type="button" className="tool-ai" aria-label="IA" onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()} onClick={onAI}>
        <Icon name="sparkle" size={18} />
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImage(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
