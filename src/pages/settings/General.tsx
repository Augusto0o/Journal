import { NavBar, Segmented } from '@/components/ui';
import { useSettings } from '@/hooks/useData';
import type { DateFormat } from '@/types';

export default function GeneralSettings({ embedded }: { embedded?: boolean } = {}) {
  const Root = embedded ? 'div' : 'main';
  const [s, set] = useSettings();
  return (
    <Root className={embedded ? 'settings-part' : 'page'}>
      {!embedded && <NavBar back="/ajustes" backLabel="Ajustes" title="General" />}
      <div className="page-head"><h1>General</h1></div>
      <label className="field">
        <span className="field-label">Tu nombre</span>
        <input className="input" value={s.userName} onChange={(e) => void set({ userName: e.target.value })} placeholder="Para el saludo de Inicio" />
      </label>
      <section className="group">
        <h2 className="group-title"><span>La semana empieza el</span></h2>
        <Segmented<0 | 1> label="Inicio de semana" value={s.weekStartsOn} onChange={(v) => void set({ weekStartsOn: v })} options={[{ value: 1, label: 'Lunes' }, { value: 0, label: 'Domingo' }]} />
      </section>
      <section className="group">
        <h2 className="group-title"><span>Formato de fecha</span></h2>
        <Segmented<DateFormat> label="Formato" value={s.dateFormat} onChange={(v) => void set({ dateFormat: v })} options={[{ value: 'long', label: '26 de septiembre' }, { value: 'short', label: '26 sep' }, { value: 'numeric', label: '26/09' }]} />
      </section>
    </Root>
  );
}
