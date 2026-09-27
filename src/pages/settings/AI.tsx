import { useState } from 'react';
import { Link } from 'react-router-dom';
import { NavBar, Segmented, SwitchRow, useFeedback } from '@/components/ui';
import { useSettings, useSync } from '@/hooks/useData';
import { transform } from '@/services/ai';
import type { AIProvider } from '@/types';

export default function AISettings({ embedded }: { embedded?: boolean } = {}) {
  const Root = embedded ? 'div' : 'main';
  const [s, set] = useSettings();
  const sync = useSync();
  const { toast } = useFeedback();
  const [testing, setTesting] = useState(false);

  const test = async () => {
    setTesting(true);
    try {
      const r = await transform('correct', 'hola, esto es una prueva de la ia');
      toast(`Funciona: «${r.slice(0, 60)}»`, { duration: 4000 });
    } catch (e) {
      toast((e as Error).message, { tone: 'error', duration: 5000 });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Root className={embedded ? 'settings-part' : 'page'}>
      {!embedded && <NavBar back="/ajustes" backLabel="Ajustes" title="IA y privacidad" />}
      <div className="page-head"><h1>IA</h1></div>

      <section className="group">
        <div className="group-body">
          <SwitchRow
            label="Usar IA"
            sub="Resumir, corregir, traducir, detectar tareas, dictado y búsqueda por significado."
            checked={s.aiEnabled}
            onChange={(v) => void set({ aiEnabled: v, aiConsentAt: v ? new Date().toISOString() : s.aiConsentAt })}
          />
        </div>
        <p className="group-foot">Solo se envía el texto que elegís en cada acción, a través de tu propio Supabase. Las contraseñas nunca se envían.</p>
      </section>

      <section className="group">
        <h2 className="group-title"><span>Proveedor</span></h2>
        <Segmented<AIProvider>
          label="Proveedor"
          value={s.aiProvider}
          onChange={(v) => void set({ aiProvider: v })}
          options={[{ value: 'auto', label: 'Automático' }, { value: 'gemini', label: 'Gemini' }, { value: 'groq', label: 'Groq' }, { value: 'anthropic', label: 'Claude' }]}
        />
        <div className="info-list mt-4">
          <p><b>Gemini</b> — gratis con una clave de Google AI Studio. Límite diario generoso. En el nivel gratuito, Google puede usar lo que enviás para mejorar sus modelos.</p>
          <p><b>Groq</b> — gratis, muy rápido, con límite de pedidos por día. También transcribe audio (Whisper).</p>
          <p><b>Claude</b> — opcional y de pago aparte de tu plan (API de Anthropic).</p>
          <p>En «Automático» se usa Gemini y, si no responde o se agotó el cupo, Groq.</p>
        </div>
      </section>

      <section className="group">
        <div className="group-body">
          <button type="button" className="row is-accent" onClick={() => void test()} disabled={testing || !s.aiEnabled || !sync.userId}>
            <span className="row-main"><span className="row-label">{testing ? 'Probando…' : 'Probar conexión'}</span></span>
          </button>
        </div>
        {!sync.userId && <p className="group-foot">La IA necesita tu Supabase conectado y una sesión iniciada. <Link to="/ajustes#sync">Configurar</Link></p>}
      </section>
    </Root>
  );
}
