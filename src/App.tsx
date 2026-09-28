import { lazy, Suspense, useEffect, useRef } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { FeedbackProvider } from '@/components/ui/Feedback';
import { useFeedback } from '@/components/ui';
import { Dock } from '@/components/navigation/Dock';
import { FocusPill } from '@/components/navigation/FocusPill';
import { CaptureProvider } from '@/components/capture/CaptureSheet';
import { NewMenuProvider, useNewMenu } from '@/components/capture/NewMenu';
import { useAppearance, usePomodoro, useSettings, useStore } from '@/hooks/useData';
import { useVisualViewport } from '@/hooks/useVisualViewport';
import { chime, isRunning, PHASE_LABEL, pomoSettings, reconcile } from '@/services/pomodoro';
import type { Appearance } from '@/types';

import Today from '@/pages/Today';
const Notebook = lazy(() => import('@/pages/Notebook'));
const Share = lazy(() => import('@/pages/Share'));
const Movies = lazy(() => import('@/pages/Movies'));
const EntryEditor = lazy(() => import('@/pages/EntryEditor'));
const Reader = lazy(() => import('@/pages/Reader'));
const Library = lazy(() => import('@/pages/Library'));
const ListPage = lazy(() => import('@/pages/library/ListPage'));
const Habits = lazy(() => import('@/pages/Habits'));
const HabitDetail = lazy(() => import('@/pages/HabitDetail'));
const Pomodoro = lazy(() => import('@/pages/Pomodoro'));
const Search = lazy(() => import('@/pages/Search'));
const Vault = lazy(() => import('@/pages/Vault'));
const Quotes = lazy(() => import('@/pages/Quotes'));
const EnglishHome = lazy(() => import('@/pages/english/EnglishHome'));
const LessonSession = lazy(() => import('@/pages/english/LessonSession'));
const EnglishReview = lazy(() => import('@/pages/english/Review'));
const EnglishWords = lazy(() => import('@/pages/english/Words'));
const JournalPractice = lazy(() => import('@/pages/english/JournalPractice'));
const MapEditor = lazy(() => import('@/pages/maps/MapEditor'));
const PdfViewer = lazy(() => import('@/pages/PdfViewer'));
const Discover = lazy(() => import('@/pages/discover/Discover'));
const ArtworkPage = lazy(() => import('@/pages/discover/Artwork'));
const Graph = lazy(() => import('@/pages/Graph'));
const Assistant = lazy(() => import('@/pages/Assistant'));
const Onboarding = lazy(() => import('@/pages/Onboarding'));
const Settings = lazy(() => import('@/pages/settings/Settings'));

/** Aplica la apariencia al documento (atributos + variables CSS). */
function applyAppearance(a: Appearance) {
  const root = document.documentElement;
  const dark = a.theme === 'dark' || (a.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.accent = a.accent;
  root.dataset.font = a.font;
  root.dataset.fontUi = String(a.fontInInterface);
  root.dataset.backdrop = a.backdrop;
  root.dataset.card = a.cardStyle;
  root.style.setProperty('--content-size', `${a.fontSize}px`);
  root.style.setProperty('--content-weight', String(a.weight));
  root.style.setProperty('--content-leading', String(a.lineHeight));
  root.style.setProperty('--content-align', a.justify ? 'justify' : 'left');
  root.style.setProperty('--content-liga', a.ligatures ? 'common-ligatures' : 'none');
  root.style.setProperty('--r-card', `${a.radius}px`);
  root.style.setProperty('--content-measure', a.editorWidth === 'narrow' ? '32rem' : a.editorWidth === 'wide' ? '46rem' : '38rem');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#161616' : '#f5f5f5');
  try {
    localStorage.setItem('pos-theme', JSON.stringify({ theme: a.theme, accent: a.accent }));
  } catch {
    /* no-op */
  }
}

function useAppearanceEffect() {
  const [a] = useAppearance();
  const key = JSON.stringify(a);
  useEffect(() => {
    applyAppearance(a);
    if (a.theme !== 'system') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => applyAppearance(a);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** Avanza el Pomodoro aunque la pantalla no esté abierta y avisa al terminar una fase. */
function usePomodoroEngine() {
  const s = usePomodoro();
  const { toast } = useFeedback();
  const running = isRunning(s);
  const endsAt = s.endsAt;
  useEffect(() => {
    if (!running) return;
    const check = async () => {
      const finished = await reconcile();
      if (finished) {
        if (pomoSettings().sound) chime();
        try {
          navigator.vibrate?.([30, 60, 30]);
        } catch {
          /* no-op */
        }
        toast(finished === 'focus' ? 'Bloque de foco terminado. Tomate un descanso.' : `${PHASE_LABEL[finished]} terminado.`, { duration: 5000 });
      }
    };
    void check();
    const t = setInterval(check, 1000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', check);
    };
  }, [running, endsAt, toast]);
}

const NO_DOCK = [/^\/mapas\/[^/]+/, /^\/pdf\//, /^\/asistente/, /^\/grafo/, /^\/ingles\/(leccion|repaso)/, /^\/journal\/[^/]+/, /^\/biblioteca\/nota\//, /^\/bienvenida/, /^\/pomodoro/, /^\/compartir/, /^\/buscar/];

const OLD_SETTINGS: Record<string, string> = { apariencia: 'apariencia', inicio: 'hoy', ia: 'ia', sincronizacion: 'sync', atajos: 'atajos', datos: 'datos', general: 'general' };
function SettingsRedirect() {
  const { pathname } = useLocation();
  const part = pathname.split('/')[2] ?? '';
  return <Navigate to={`/ajustes${OLD_SETTINGS[part] ? `#${OLD_SETTINGS[part]}` : ''}`} replace />;
}

/** Aviso de versión nueva cuando estás escribiendo (si no, la app se recarga sola). */
function useUpdateNotice() {
  const { toast } = useFeedback();
  useEffect(() => {
    const on = () => toast('Hay una versión nueva de la app', { action: { label: 'Actualizar', onClick: () => location.reload() } });
    window.addEventListener('pos-update-ready', on);
    return () => window.removeEventListener('pos-update-ready', on);
  }, [toast]);
}

function Shell() {
  useUpdateNotice();
  const snap = useStore();
  const [settings] = useSettings();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  useAppearanceEffect();
  usePomodoroEngine();
  useVisualViewport();
  const redirected = useRef(false);

  useEffect(() => {
    if (snap.ready && !settings.onboarded && !redirected.current && pathname === '/') {
      redirected.current = true;
      navigate('/bienvenida', { replace: true });
    }
  }, [snap.ready, settings.onboarded, pathname, navigate]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  const hideDock = NO_DOCK.some((r) => r.test(pathname));

  if (!snap.ready) return null;

  return (
    <CaptureProvider>
      {() => (
        <NewMenuProvider>
          <Suspense fallback={<div className="page" aria-busy="true" />}>
            <Routes>
              <Route path="/" element={<Today />} />
              <Route path="/cuaderno" element={<Notebook />} />
              <Route path="/biblioteca" element={<Library />} />
              <Route path="/buscar" element={<Search />} />
              <Route path="/ajustes" element={<Settings />} />
              <Route path="/journal/:id" element={<EntryEditor kind="journal" />} />
              <Route path="/journal/:id/leer" element={<Reader kind="journal" />} />
              <Route path="/biblioteca/lista/:id" element={<ListPage />} />
              <Route path="/biblioteca/nota/:id" element={<EntryEditor kind="note" />} />
              <Route path="/biblioteca/nota/:id/leer" element={<Reader kind="note" />} />
              <Route path="/habitos" element={<Habits />} />
              <Route path="/habitos/:id" element={<HabitDetail />} />
              <Route path="/pomodoro" element={<Pomodoro />} />
              <Route path="/contrasenas" element={<Vault />} />
              <Route path="/frases" element={<Quotes />} />
              <Route path="/mapas/:id" element={<MapEditor />} />
              <Route path="/pdf/:id" element={<PdfViewer />} />
              <Route path="/descubrir" element={<Discover />} />
              <Route path="/arte" element={<ArtworkPage />} />
              <Route path="/grafo" element={<Graph />} />
              <Route path="/asistente" element={<Assistant />} />
              <Route path="/ingles" element={<EnglishHome />} />
              <Route path="/ingles/leccion/:id" element={<LessonSession />} />
              <Route path="/ingles/repaso" element={<EnglishReview />} />
              <Route path="/ingles/palabras" element={<EnglishWords />} />
              <Route path="/ingles/diario" element={<JournalPractice />} />
              <Route path="/bienvenida" element={<Onboarding />} />
              <Route path="/compartir" element={<Share />} />
              <Route path="/peliculas" element={<Movies />} />
              {/* Rutas viejas: se unieron en Hoy, Cuaderno, Biblioteca, Buscar y Ajustes. */}
              <Route path="/journal" element={<Navigate to="/cuaderno" replace />} />
              <Route path="/mapas" element={<Navigate to="/cuaderno" replace />} />
              <Route path="/biblioteca/carpeta/:folderId" element={<Navigate to="/cuaderno" replace />} />
              <Route path="/tareas" element={<Navigate to="/" replace />} />
              <Route path="/recordatorios" element={<Navigate to="/" replace />} />
              <Route path="/agenda" element={<Navigate to="/" replace />} />
              <Route path="/mas" element={<Navigate to="/buscar" replace />} />
              <Route path="/para-vos" element={<Navigate to="/descubrir" replace />} />
              <Route path="/ajustes/:part" element={<SettingsRedirect />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
          {!hideDock && <FocusPill />}
          <DockNew hidden={hideDock} />
        </NewMenuProvider>
      )}
    </CaptureProvider>
  );
}

function DockNew({ hidden }: { hidden: boolean }) {
  const menu = useNewMenu();
  return <Dock onCapture={() => menu.open()} hidden={hidden} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <FeedbackProvider>
        <Shell />
      </FeedbackProvider>
    </BrowserRouter>
  );
}
