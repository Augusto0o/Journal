/** Migraciones de datos locales entre versiones de la app. */
import { store } from '@/database/store';
import { newTask } from './actions';
import { DEFAULT_APPEARANCE, PREF } from './prefs';
import type { Appearance, Task } from '@/types';

const KEY = 'dataVersion';

export async function runMigrations() {
  const v = store.pref<number>(KEY, 0);
  {
    // Los recordatorios pasan a ser tareas con hora y alarma (también los que lleguen de la nube o de Atajos).
    const reminders = store.getSnapshot().reminder;
    if (reminders.length) {
      const tasks: Task[] = reminders.map((r) =>
        newTask({
          title: r.title, notes: r.notes, dueDate: r.date, dueTime: r.time, repeat: r.repeat, priority: r.priority,
          category: r.category ?? null, isDone: r.isDone, completedAt: r.completedAt ?? null, alarm: true,
        }),
      );
      await store.put(tasks);
      for (const r of reminders) await store.remove(r.id);
    }
  }
  if (v < 3) {
    // Nuevo diseño: oscuro por defecto con acento azul.
    const a = store.pref<Partial<Appearance>>(PREF.appearance, {});
    await store.setPref(PREF.appearance, { ...DEFAULT_APPEARANCE, ...a, theme: 'dark', accent: 'blue', cardStyle: 'flat', radius: 18 });
    await store.setPref(KEY, 3);
  }
}
