import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomSheet, Check, Icon, Segmented, Switch, useFeedback } from '@/components/ui';
import { sendReminderToIOS } from '@/services/shortcuts';
import { store } from '@/database/store';
import { deleteTask, postponeTask, saveTask, toggleTask } from '@/services/actions';
import { isOverdue } from '@/services/queries';
import { startFocus } from '@/services/pomodoro';
import type { Priority, Repeat, Task } from '@/types';
import { formatRelativeDay, todayISO } from '@/utils/date';
import { cx, haptic, uuid } from '@/utils/misc';
import { addDaysISO } from '@shared/parser.ts';

export const REPEAT_LABEL: Record<Repeat, string> = {
  never: 'Nunca',
  daily: 'Cada día',
  weekdays: 'Días hábiles',
  weekly: 'Cada semana',
  monthly: 'Cada mes',
  yearly: 'Cada año',
};

export function dueLabel(t: Pick<Task, 'dueDate' | 'dueTime'>) {
  if (!t.dueDate) return t.dueTime ?? '';
  const d = formatRelativeDay(t.dueDate, 'short');
  return t.dueTime ? `${d}, ${t.dueTime}` : d;
}

export function TaskRow({ task, onOpen, showDate = true }: { task: Task; onOpen: (id: string) => void; showDate?: boolean }) {
  const overdue = isOverdue(task);
  // Al completar: primero se ve el tilde y el tachado, después la fila se va.
  const [leaving, setLeaving] = useState(false);
  const doneSubs = task.subtasks.filter((s) => s.isDone).length;
  const meta: React.ReactNode[] = [];
  if (showDate && (task.dueDate || task.dueTime)) meta.push(<span key="d" className={cx(overdue && 'is-overdue')}>{dueLabel(task)}</span>);
  else if (!showDate && task.dueTime) meta.push(<span key="t" className={cx(overdue && 'is-overdue')}>{task.dueTime}</span>);
  if (task.alarm) meta.unshift(<Icon key="a" name="bell" size={13} />);
  if (task.repeat !== 'never') meta.push(<Icon key="r" name="repeat" size={13} />);
  if (task.subtasks.length) meta.push(<span key="s">{doneSubs}/{task.subtasks.length}</span>);
  if (task.category) meta.push(<span key="c">#{task.category}</span>);
  return (
    <div className={cx('row task-row has-icon', (task.isDone || leaving) && 'is-done', leaving && 'is-leaving')}>
      <Check
        checked={task.isDone || leaving}
        priority={task.priority}
        label={task.isDone ? `Marcar pendiente: ${task.title}` : `Completar: ${task.title}`}
        onChange={() => {
          haptic();
          if (task.isDone || leaving) {
            void toggleTask(task.id);
            return;
          }
          setLeaving(true);
          setTimeout(() => void toggleTask(task.id), 420);
        }}
      />
      <button type="button" className="task-main" onClick={() => onOpen(task.id)}>
        <span className="row-label">{task.title || 'Sin título'}</span>
        {meta.length > 0 && <span className="task-meta">{meta}</span>}
      </button>
    </div>
  );
}

/** Hoja de detalle de una tarea. Guarda en cada cambio. */
export function useTaskSheet() {
  const [id, setId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const el = (
    <BottomSheet open={open} onClose={() => setOpen(false)} title="Tarea" hideTitle initialFocus="none">
      {id && <TaskDetail id={id} onClose={() => setOpen(false)} />}
    </BottomSheet>
  );
  return [el, (taskId: string) => { setId(taskId); setOpen(true); }] as const;
}

function TaskDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const t = store.get('task', id);
  const [, force] = useState(0);
  const [newSub, setNewSub] = useState('');
  const { confirm, toast } = useFeedback();
  const navigate = useNavigate();
  if (!t) return null;

  const set = (patch: Partial<Task>) => {
    void saveTask({ ...t, ...patch });
    force((n) => n + 1);
  };

  const addSub = () => {
    const title = newSub.trim();
    if (!title) return;
    set({ subtasks: [...t.subtasks, { id: uuid(), title, isDone: false }] });
    setNewSub('');
  };

  const today = todayISO();

  return (
    <div className="task-detail">
      <div className="task-detail-head">
        <Check checked={t.isDone} priority={t.priority} label="Completada" onChange={() => { void toggleTask(t.id); force((n) => n + 1); }} />
        <textarea
          className="task-title-input"
          value={t.title}
          rows={1}
          placeholder="Título"
          onChange={(e) => set({ title: e.target.value.replace(/\n/g, ' ') })}
        />
      </div>
      <textarea className="textarea task-notes" value={t.notes} placeholder="Notas" rows={2} onChange={(e) => set({ notes: e.target.value })} />

      <div className="quick-dates">
        {[
          { label: 'Hoy', v: today },
          { label: 'Mañana', v: addDaysISO(today, 1) },
          { label: 'Próx. semana', v: addDaysISO(today, 7) },
          { label: 'Sin fecha', v: null },
        ].map((o) => (
          <button key={o.label} type="button" className="chip" aria-pressed={t.dueDate === o.v} onClick={() => set({ dueDate: o.v })}>
            {o.label}
          </button>
        ))}
      </div>

      <div className="group-body mt-4">
        <label className="row has-icon">
          <span className="row-icon"><Icon name="calendar" size={18} /></span>
          <span className="row-main"><span className="row-label">Fecha</span></span>
          <input type="date" className="input-plain" value={t.dueDate ?? ''} onChange={(e) => set({ dueDate: e.target.value || null })} />
        </label>
        <label className="row has-icon">
          <span className="row-icon"><Icon name="clock" size={18} /></span>
          <span className="row-main"><span className="row-label">Hora</span></span>
          <input type="time" className="input-plain" value={t.dueTime ?? ''} onChange={(e) => set({ dueTime: e.target.value || null })} />
        </label>
        <div className="row has-icon">
          <span className="row-icon"><Icon name="bell" size={18} /></span>
          <span className="row-main"><span className="row-label">Alarma</span><span className="row-sub">Te avisa el iPhone vía Atajos</span></span>
          <Switch label="Alarma" checked={!!t.alarm} onChange={(v) => set({ alarm: v, dueTime: v && !t.dueTime ? '09:00' : t.dueTime, dueDate: v && !t.dueDate ? todayISO() : t.dueDate })} />
        </div>
        <label className="row has-icon">
          <span className="row-icon"><Icon name="repeat" size={18} /></span>
          <span className="row-main"><span className="row-label">Repetir</span></span>
          <select className="input-plain select-plain" value={t.repeat} onChange={(e) => set({ repeat: e.target.value as Repeat })}>
            {Object.entries(REPEAT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="row has-icon">
          <span className="row-icon"><Icon name="tag" size={18} /></span>
          <span className="row-main"><span className="row-label">Categoría</span></span>
          <input className="input-plain" placeholder="trabajo" value={t.category ?? ''} onChange={(e) => set({ category: e.target.value.replace(/^#/, '').trim() || null })} />
        </label>
      </div>

      <div className="mt-4">
        <p className="field-label">Prioridad</p>
        <div className="mt-2">
          <Segmented<Priority>
            label="Prioridad"
            value={t.priority}
            onChange={(v) => set({ priority: v })}
            options={[{ value: 0, label: 'Ninguna' }, { value: 1, label: 'Baja' }, { value: 2, label: 'Media' }, { value: 3, label: 'Alta' }]}
          />
        </div>
      </div>

      <div className="mt-6">
        <p className="field-label">Subtareas</p>
        <div className="group-body mt-2">
          {t.subtasks.map((s) => (
            <div key={s.id} className="row has-icon">
              <Check
                checked={s.isDone}
                label={s.title}
                onChange={() => set({ subtasks: t.subtasks.map((x) => (x.id === s.id ? { ...x, isDone: !x.isDone } : x)) })}
              />
              <input className="input-plain grow" value={s.title} onChange={(e) => set({ subtasks: t.subtasks.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)) })} style={{ textAlign: 'left', color: 'var(--text)' }} />
              <button type="button" className="icon-btn" aria-label="Quitar subtarea" onClick={() => set({ subtasks: t.subtasks.filter((x) => x.id !== s.id) })}>
                <Icon name="x" size={16} />
              </button>
            </div>
          ))}
          <div className="row has-icon">
            <span className="row-icon"><Icon name="plus" size={18} /></span>
            <input
              className="input-plain grow"
              placeholder="Agregar subtarea"
              value={newSub}
              enterKeyHint="done"
              style={{ textAlign: 'left', color: 'var(--text)' }}
              onChange={(e) => setNewSub(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSub()}
              onBlur={addSub}
            />
          </div>
        </div>
      </div>

      <div className="task-actions mt-6">
        <button type="button" className="btn btn-tinted btn-sm" onClick={() => { void startFocus({ taskId: t.id, label: t.title }); onClose(); navigate('/pomodoro'); }}>
          <Icon name="timer" size={18} /> Enfocar
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { void postponeTask(t.id, 1); toast('Pospuesta a mañana'); onClose(); }}>
          Posponer
        </button>
        {t.alarm && t.dueDate && t.dueTime && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => sendReminderToIOS(t.title, t.dueDate!, t.dueTime!)}>
            <Icon name="bolt" size={16} /> Agendar en iOS
          </button>
        )}
        <span className="grow" />
        <button
          type="button"
          className="btn btn-ghost btn-sm danger-text"
          onClick={async () => {
            if (await confirm({ title: '¿Eliminar la tarea?', confirmLabel: 'Eliminar', danger: true })) {
              await deleteTask(t.id);
              onClose();
            }
          }}
        >
          Eliminar
        </button>
      </div>
    </div>
  );
}
