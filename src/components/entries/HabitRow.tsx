import { Link } from 'react-router-dom';
import { Icon, type IconName } from '@/components/ui/Icon';
import { tapHabit } from '@/services/actions';
import { habitCount, habitDone, habitStreak, scheduleLabel } from '@/services/queries';
import type { Habit } from '@/types';
import { cx, haptic } from '@/utils/misc';

export const HABIT_HUES: Record<string, number> = {
  indigo: 275, violet: 300, blue: 245, teal: 195, green: 150, amber: 75, rose: 15, slate: 265,
};

export const HABIT_ICONS: IconName[] = ['circle', 'book', 'run', 'water', 'moon', 'leaf', 'dumbbell', 'brain', 'pen', 'heart', 'sun', 'coffee', 'timer', 'idea'];

export const hueOf = (h: Pick<Habit, 'color'>) => HABIT_HUES[h.color] ?? 275;

export function habitIcon(h: Habit): IconName {
  return (HABIT_ICONS as string[]).includes(h.icon) ? (h.icon as IconName) : 'circle';
}

/** Botón de marcar: se llena por pasos hasta la meta; un toque más vuelve a cero. */
export function HabitTap({ habit, day }: { habit: Habit; day: string }) {
  const count = habitCount(habit, day);
  const done = habitDone(habit, day);
  const frac = Math.min(1, count / Math.max(1, habit.target));
  return (
    <button
      type="button"
      className={cx('habit-tap', done && 'is-done')}
      style={{ '--hue': hueOf(habit), '--frac': frac } as React.CSSProperties}
      aria-label={done ? `${habit.name}: hecho. Tocar para reiniciar` : `Marcar ${habit.name} (${count} de ${habit.target})`}
      onClick={() => {
        haptic(done ? 6 : 12);
        void tapHabit(habit.id, day);
      }}
    >
      <span className="habit-tap-fill" aria-hidden="true" />
      {done ? <Icon name="check" size={18} strokeWidth={2.6} /> : habit.target > 1 ? <span className="num">{count}/{habit.target}</span> : <Icon name={habitIcon(habit)} size={18} />}
    </button>
  );
}

export function HabitRow({ habit, day }: { habit: Habit; day: string }) {
  const streak = habitStreak(habit, day);
  return (
    <div className="row habit-row">
      <Link to={`/habitos/${habit.id}`} className="habit-row-main">
        <span className="row-label">{habit.name}</span>
        <span className="row-sub">
          {scheduleLabel(habit)}
          {streak.value > 1 && ` · ${streak.value} ${streak.unit} seguidos`}
        </span>
      </Link>
      <HabitTap habit={habit} day={day} />
    </div>
  );
}
