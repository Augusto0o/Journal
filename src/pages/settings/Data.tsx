import { useRef, useState } from 'react';
import { BottomSheet, Group, NavBar, Row, useFeedback } from '@/components/ui';
import { useSettings, useStore } from '@/hooks/useData';
import { store } from '@/database/store';
import { exportData, parseBackup, type ImportPreview } from '@/services/exportImport';
import { relativeTime } from '@/utils/date';

const KIND_LABEL: Record<string, string> = { journal: 'entradas', note: 'notas', folder: 'carpetas', task: 'tareas', reminder: 'recordatorios', habit: 'hábitos', focus: 'sesiones de foco' };

export default function DataSettings({ embedded }: { embedded?: boolean } = {}) {
  const Root = embedded ? 'div' : 'main';
  const snap = useStore();
  const [settings] = useSettings();
  const { toast, confirm } = useFeedback();
  const file = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  const doExport = async (f: 'json' | 'markdown' | 'csv') => {
    const r = await exportData(f);
    if (r !== 'cancelled') toast('Copia exportada');
  };

  return (
    <Root className={embedded ? 'settings-part' : 'page'}>
      {!embedded && <NavBar back="/ajustes" backLabel="Ajustes" title="Datos y copias" />}
      <div className="page-head"><div><h1>Datos</h1><p className="page-sub">{settings.lastBackupAt ? `Última copia ${relativeTime(settings.lastBackupAt)}` : 'Todavía no hiciste ninguna copia.'}</p></div></div>
      <Group title="Exportar" foot="JSON sirve para restaurar. Markdown y CSV son para leer o llevar a otra app.">
        <Row icon="download" label="Copia completa (JSON)" onClick={() => void doExport('json')} chevron />
        <Row icon="file" label="Markdown" onClick={() => void doExport('markdown')} chevron />
        <Row icon="table" label="CSV" onClick={() => void doExport('csv')} chevron />
      </Group>
      <Group title="Restaurar">
        <Row icon="upload" label="Importar copia" sub="También acepta copias del Journal anterior" onClick={() => file.current?.click()} chevron />
      </Group>
      <Group title="En este dispositivo" foot="Borrar no afecta lo que ya esté en tu Supabase.">
        <Row label="Registros" value={snap.journal.length + snap.note.length + snap.task.length + snap.reminder.length + snap.habit.length} />
        <Row
          label="Borrar datos locales"
          danger
          onClick={async () => {
            if (await confirm({ title: '¿Borrar todo lo local?', message: 'Exportá una copia antes. Las contraseñas no se tocan.', confirmLabel: 'Borrar', danger: true })) {
              await store.wipe();
              toast('Datos locales borrados');
            }
          }}
        />
      </Group>
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            setPreview(await parseBackup(f));
          } catch (err) {
            toast((err as Error).message, { tone: 'error' });
          }
        }}
      />
      <BottomSheet open={!!preview} onClose={() => setPreview(null)} title="Importar copia" description={preview?.exportedAt ? `Exportada ${relativeTime(preview.exportedAt)}` : undefined}>
        {preview && (
          <div className="stack">
            <p className="muted">{Object.entries(preview.counts).map(([k, n]) => `${n} ${KIND_LABEL[k] ?? k}`).join(' · ')}</p>
            <button type="button" className="btn btn-primary" onClick={async () => { const n = await store.bulkImport(preview.records, 'merge'); setPreview(null); toast(`${n} registros importados`); }}>Combinar con lo actual</button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={async () => {
                if (!(await confirm({ title: '¿Reemplazar todo?', message: 'Lo que no esté en la copia se elimina.', confirmLabel: 'Reemplazar', danger: true }))) return;
                const n = await store.bulkImport(preview.records, 'replace');
                setPreview(null);
                toast(`${n} registros restaurados`);
              }}
            >
              Reemplazar todo
            </button>
          </div>
        )}
      </BottomSheet>
    </Root>
  );
}
