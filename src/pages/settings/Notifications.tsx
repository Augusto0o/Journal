import { useState } from 'react';
import { SwitchRow, useFeedback } from '@/components/ui';
import { useSync } from '@/hooks/useData';
import { disablePush, enablePush, isStandalone, pushEnabled, pushSupported, testPush } from '@/services/push';

/** Avisos push: tareas con hora y fin del Pomodoro, aunque la app esté cerrada. */
export default function Notifications() {
  const sync = useSync();
  const { toast } = useFeedback();
  const [on, setOn] = useState(pushEnabled());
  const [busy, setBusy] = useState(false);

  const toggle = async (v: boolean) => {
    setBusy(true);
    try {
      if (v) {
        await enablePush();
        toast('Avisos activados');
      } else await disablePush();
      setOn(v);
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-part">
      <section className="group">
        <div className="group-body">
          <SwitchRow
            label="Avisos con la app cerrada"
            sub="Tareas con hora, recordatorios con alarma y el fin de cada bloque del Pomodoro."
            checked={on}
            onChange={(v) => { if (!busy && sync.userId) void toggle(v); }}
          />
        </div>
        {!sync.userId && <p className="group-foot">Necesita tu Supabase conectado y la sesión iniciada (Sincronización).</p>}
        {sync.userId && !pushSupported() && !isStandalone() && <p className="group-foot">En iPhone: Compartir → <b>Agregar a pantalla de inicio</b>, y activalos abriendo la app desde ese ícono.</p>}
        {on && (
          <p className="group-foot">
            Llegan con hasta un minuto de diferencia.{' '}
            <button type="button" className="link-btn" onClick={async () => {
              try {
                const r = await testPush();
                toast(r.sent ? 'Enviado: debería llegar en unos segundos' : 'No hay dispositivos suscriptos', { tone: r.sent ? undefined : 'error' });
              } catch (e) {
                toast((e as Error).message, { tone: 'error' });
              }
            }}>Mandar un aviso de prueba</button>
          </p>
        )}
      </section>
    </div>
  );
}
