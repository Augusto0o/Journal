import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useFeedback } from '@/components/ui';
import { useCapture } from '@/components/capture/CaptureSheet';
import { saveYouTubeLink, youtubeKind } from '@/services/media';

/**
 * Destino de «Compartir» (Web Share Target: Android, Chrome de escritorio).
 * Un enlace de YouTube o YouTube Music se guarda directo en la Biblioteca;
 * cualquier otra cosa abre la captura rápida con el texto.
 */
export default function Share() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const { open } = useCapture();
  const [msg, setMsg] = useState('Guardando…');
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const text = [params.get('url'), params.get('text'), params.get('title')].filter(Boolean).join(' ').trim();
    if (!text) {
      navigate('/', { replace: true });
      return;
    }
    if (youtubeKind(text)) {
      void saveYouTubeLink(text).then((m) => {
        if (!m) return;
        toast(`${m.mediaType === 'music' ? 'Para escuchar' : 'Para ver'}: ${m.title}`);
        navigate('/biblioteca', { replace: true });
      }).catch(() => setMsg('No se pudo guardar el enlace.'));
      return;
    }
    navigate('/', { replace: true });
    setTimeout(() => open('auto', text), 300);
  }, [params, navigate, toast, open]);

  return <main className="page"><p className="quiet" style={{ marginTop: 120 }}>{msg}</p></main>;
}
