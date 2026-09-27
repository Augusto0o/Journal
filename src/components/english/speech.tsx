import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui';
import { Waveform } from '@/components/ui/Waveform';
import { listenEnglish, recognitionAvailable, say, stopSpeaking } from '@/services/english';
import { aiAvailable, transcribe } from '@/services/ai';
import { VoiceRecorder } from '@/services/recorder';
import { cx } from '@/utils/misc';

/** Botón de parlante: lee el texto en inglés. */
export function SpeakButton({ text, rate, size = 'md', label = 'Escuchar' }: { text: string; rate?: number; size?: 'sm' | 'md'; label?: string }) {
  const [on, setOn] = useState(false);
  return (
    <button
      type="button"
      className={cx('speak-btn', size === 'sm' && 'is-sm', on && 'is-on')}
      aria-label={`${label}: ${text}`}
      onClick={async (e) => {
        e.stopPropagation();
        if (on) {
          stopSpeaking();
          setOn(false);
          return;
        }
        setOn(true);
        await say(text, rate);
        setOn(false);
      }}
    >
      <Icon name={on ? 'pause' : 'headphones'} size={size === 'sm' ? 15 : 17} filled={on} strokeWidth={on ? 0 : 1.9} />
    </button>
  );
}

export type CaptureMode = 'system' | 'ai' | 'none';

export function captureMode(): CaptureMode {
  if (recognitionAvailable()) return 'system';
  if (aiAvailable() && VoiceRecorder.supported()) return 'ai';
  return 'none';
}

/**
 * Captura de voz en inglés: usa el reconocimiento del sistema si existe;
 * si no, graba y transcribe con Whisper/Gemini a través de tu Supabase.
 */
export function useSpeechCapture() {
  const [state, setState] = useState<'idle' | 'listening' | 'processing'>('idle');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [levels, setLevels] = useState<number[]>(() => Array(36).fill(0.1));
  const stopRef = useRef<(() => void) | null>(null);
  const recRef = useRef<VoiceRecorder | null>(null);
  const raf = useRef(0);

  useEffect(() => () => {
    stopRef.current?.();
    recRef.current?.cancel();
    cancelAnimationFrame(raf.current);
  }, []);

  const start = async () => {
    setError(null);
    setText('');
    stopSpeaking();
    const mode = captureMode();
    if (mode === 'none') {
      setError('Este navegador no reconoce voz. Activá la IA para transcribir, o marcá la frase como dicha.');
      return;
    }
    if (mode === 'system') {
      setState('listening');
      let t = 0;
      const tick = () => {
        t++;
        setLevels((p) => [...p.slice(1), 0.2 + Math.abs(Math.sin(t / 3)) * 0.6 * Math.random()]);
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
      const ctl = listenEnglish(
        (txt) => setText(txt),
        (err) => {
          cancelAnimationFrame(raf.current);
          setState('idle');
          if (err && err !== 'no-speech' && err !== 'aborted') setError(err === 'not-allowed' ? 'Sin permiso para el micrófono.' : 'No se pudo reconocer la voz.');
        },
      );
      stopRef.current = ctl.stop;
      return;
    }
    try {
      const r = new VoiceRecorder();
      await r.start();
      recRef.current = r;
      setState('listening');
      const tick = () => {
        setLevels((p) => [...p.slice(1), 0.12 + r.level() * 0.9]);
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
      stopRef.current = async () => {
        cancelAnimationFrame(raf.current);
        setState('processing');
        try {
          setText(await transcribe(await r.stop(), 'en'));
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setState('idle');
          recRef.current = null;
        }
      };
    } catch {
      setError('Sin permiso para el micrófono.');
    }
  };

  const stop = () => {
    const s = stopRef.current;
    stopRef.current = null;
    s?.();
    if (captureMode() === 'system') {
      cancelAnimationFrame(raf.current);
    }
  };

  return { state, text, setText, error, levels, start, stop };
}

/** Botón grande de micrófono con onda en vivo. */
export function MicButton({ cap, label = 'Tocá y hablá' }: { cap: ReturnType<typeof useSpeechCapture>; label?: string }) {
  return (
    <div className="mic-area">
      {cap.state === 'listening' ? <Waveform levels={cap.levels} className="is-live" /> : <p className="mic-hint">{cap.state === 'processing' ? 'Transcribiendo…' : label}</p>}
      <button
        type="button"
        className={cx('mic-btn', cap.state === 'listening' && 'is-live')}
        aria-label={cap.state === 'listening' ? 'Terminar' : 'Hablar'}
        onClick={() => (cap.state === 'listening' ? cap.stop() : void cap.start())}
        disabled={cap.state === 'processing'}
      >
        {cap.state === 'processing' ? <span className="spinner" /> : <Icon name={cap.state === 'listening' ? 'stop' : 'mic'} size={24} filled={cap.state === 'listening'} strokeWidth={cap.state === 'listening' ? 0 : 1.9} />}
      </button>
    </div>
  );
}
