import { Link } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { useNow, usePomodoro } from '@/hooks/useData';
import { clock, isPaused, isRunning, PHASE_LABEL, remaining, toggle } from '@/services/pomodoro';

/** Mini temporizador flotante mientras hay un Pomodoro en curso (reemplazo de la Dynamic Island). */
export function FocusPill() {
  const s = usePomodoro();
  const active = isRunning(s) || isPaused(s);
  const now = useNow(1000, isRunning(s));
  if (!active) return null;
  return (
    <div className="capsule focus-pill" role="timer" aria-label={`${PHASE_LABEL[s.phase]} ${clock(remaining(s, now))}`}>
      <Link to="/pomodoro" className="hstack" style={{ color: 'inherit', textDecoration: 'none' }}>
        <span className="capsule-dim">{PHASE_LABEL[s.phase]}</span>
        <span className="num">{clock(remaining(s, now))}</span>
      </Link>
      <button type="button" aria-label={isRunning(s) ? 'Pausar' : 'Seguir'} onClick={() => void toggle()}>
        <Icon name={isRunning(s) ? 'pause' : 'play'} size={14} filled strokeWidth={0} />
      </button>
    </div>
  );
}
