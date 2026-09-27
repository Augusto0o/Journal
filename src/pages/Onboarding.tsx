import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/ui';
import { useSettings } from '@/hooks/useData';
import { isIOS, isStandalone } from '@/services/shortcuts';
import { store } from '@/database/store';
import { newHabit } from '@/services/actions';

const STARTERS = [
  { name: 'Leer 20 minutos', icon: 'book', color: 'indigo' },
  { name: 'Moverme', icon: 'run', color: 'green' },
  { name: 'Tomar agua', icon: 'water', color: 'teal', target: 8 },
  { name: 'Escribir en el journal', icon: 'pen', color: 'violet' },
];

export default function Onboarding() {
  const [settings, setSettings] = useSettings();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(settings.userName);
  const [picked, setPicked] = useState<string[]>([]);
  const navigate = useNavigate();
  const needsInstall = isIOS() && !isStandalone();

  const finish = async () => {
    const habits = STARTERS.filter((s) => picked.includes(s.name)).map((s, i) => newHabit({ name: s.name, icon: s.icon, color: s.color, target: s.target ?? 1, order: i }));
    if (habits.length) await store.put(habits);
    await setSettings({ userName: name.trim(), onboarded: true });
    navigate('/', { replace: true });
  };

  return (
    <main className="onboard">
      <div className="onboard-steps" aria-hidden="true">{[0, 1, 2].map((i) => <i key={i} className={i <= step ? 'is-on' : ''} />)}</div>

      {step === 0 && (
        <section className="onboard-card">
          <span className="onboard-mark" aria-hidden="true"><i /></span>
          <h1>Todo tu día, en un lugar tranquilo.</h1>
          <p>Journal, notas, tareas, hábitos y foco. Lo que escribís se queda en este iPhone; si querés, lo sincronizás con tu propio Supabase.</p>
          <label className="field">
            <span className="field-label">¿Cómo te llamo?</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" autoComplete="given-name" />
          </label>
          <button type="button" className="btn btn-primary btn-block" onClick={() => setStep(1)}>Seguir</button>
        </section>
      )}

      {step === 1 && (
        <section className="onboard-card">
          <h1>Un par de hábitos para empezar</h1>
          <p>Opcional. Podés cambiarlos cuando quieras.</p>
          <div className="group-body">
            {STARTERS.map((s) => (
              <button key={s.name} type="button" className="row has-icon" onClick={() => setPicked((p) => (p.includes(s.name) ? p.filter((x) => x !== s.name) : [...p, s.name]))}>
                <span className="row-main"><span className="row-label">{s.name}</span></span>
                <span role="checkbox" aria-checked={picked.includes(s.name)} className="check" style={{ margin: '-10px -10px -10px 0' }}><Icon name="check" size={14} strokeWidth={3} /></span>
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-primary btn-block" onClick={() => setStep(2)}>Seguir</button>
        </section>
      )}

      {step === 2 && (
        <section className="onboard-card">
          <h1>{needsInstall ? 'Instalala en tu iPhone' : 'Listo'}</h1>
          {needsInstall ? (
            <ol className="onboard-list">
              <li>Tocá <b>Compartir</b> en la barra de Safari.</li>
              <li>Elegí <b>Agregar a inicio</b>.</li>
              <li>Abrila desde el ícono: se ve a pantalla completa y funciona sin conexión.</li>
            </ol>
          ) : (
            <p>La captura rápida está siempre en el botón <b>+</b>. Escribí en lenguaje natural: «pagar la luz el viernes a las 10 !alta».</p>
          )}
          <p className="muted small">IA gratuita, sincronización y Atajos de iOS se configuran en Ajustes (el ícono arriba a la derecha en Hoy).</p>
          <button type="button" className="btn btn-primary btn-block" onClick={() => void finish()}>Empezar</button>
        </section>
      )}
    </main>
  );
}
