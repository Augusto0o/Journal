/**
 * Índice único de secciones y funciones de la app.
 * Lo usa la barra «Buscar o preguntar»,
 * para que cualquier función se encuentre escribiendo lo que uno quiere hacer.
 */
import type { IconName } from '@/components/ui/Icon';

export interface Section {
  id: string;
  label: string;
  path: string;
  icon: IconName;
  hue: number;
  group: SectionGroup;
  description: string;
  /** Palabras con las que alguien podría buscarla. */
  keywords: string;
}

export type SectionGroup = 'Escribir' | 'Organizar' | 'Aprender' | 'Biblioteca' | 'Herramientas' | 'Ajustes';

export const GROUP_ORDER: SectionGroup[] = ['Escribir', 'Organizar', 'Aprender', 'Biblioteca', 'Herramientas', 'Ajustes'];

export const SECTIONS: Section[] = [
  // Escribir
  { id: 'notebook', label: 'Cuaderno', path: '/cuaderno', icon: 'journal', hue: 22, group: 'Escribir', description: 'Journal, notas, ideas, mapas y PDFs', keywords: 'diario journal notas cuaderno escribir entrada' },
  { id: 'journal-today', label: 'Escribir la entrada de hoy', path: '/journal/hoy', icon: 'pencil', hue: 22, group: 'Escribir', description: 'Abre o crea la entrada del día', keywords: 'nueva entrada diario hoy escribir journal' },
  { id: 'notes', label: 'Nueva nota', path: '/biblioteca/nota/nueva?tipo=note', icon: 'file', hue: 245, group: 'Escribir', description: 'Notas, ideas y enlaces', keywords: 'nota idea enlace link carpeta apunte' },
  { id: 'maps', label: 'Mapas y diagramas', path: '/mapas', icon: 'mindmap', hue: 300, group: 'Escribir', description: 'Mentales, conceptuales, sistemas y flujos', keywords: 'mapa mental conceptual diagrama sistema flujo proceso nodos' },
  { id: 'capture', label: 'Captura rápida', path: '/?capturar=1', icon: 'plus', hue: 22, group: 'Escribir', description: 'Anotar cualquier cosa en dos toques', keywords: 'capturar anotar rapido voz dictar foto' },
  // Organizar
  { id: 'today', label: 'Hoy', path: '/', icon: 'sun', hue: 22, group: 'Organizar', description: 'Tareas, alarmas, semana y hábitos', keywords: 'hoy inicio tarea pendiente todo hacer agenda semana calendario recordatorio recordame alarma aviso' },
  { id: 'habits', label: 'Hábitos', path: '/habitos', icon: 'repeat', hue: 150, group: 'Organizar', description: 'Seguimiento diario y rachas', keywords: 'habito racha rutina gym leer meditar' },
  { id: 'pomodoro', label: 'Pomodoro', path: '/pomodoro', icon: 'timer', hue: 300, group: 'Organizar', description: 'Bloques de foco y descansos', keywords: 'foco concentracion temporizador timer estudiar' },
  // Aprender
  { id: 'english', label: 'Inglés', path: '/ingles', icon: 'globe', hue: 45, group: 'Aprender', description: 'Lecciones, repaso y práctica con tu journal', keywords: 'ingles english idioma vocabulario speaking pronunciacion' },
  { id: 'english-review', label: 'Repasar vocabulario', path: '/ingles/repaso', icon: 'repeat', hue: 45, group: 'Aprender', description: 'Repetición espaciada', keywords: 'repaso tarjetas flashcards palabras' },
  // Biblioteca
  { id: 'library', label: 'Biblioteca', path: '/biblioteca', icon: 'library', hue: 75, group: 'Biblioteca', description: 'Libros, videos y música en un estante', keywords: 'libro lectura leyendo autor novela video youtube ver despues musica cancion album artista escuchar' },
  { id: 'discover', label: 'Descubrir', path: '/descubrir', icon: 'sparkle', hue: 330, group: 'Biblioteca', description: 'Música, libros y temas para vos', keywords: 'recomendaciones descubrir musica nueva artistas sugerencias gustos para vos' },
  { id: 'artwork', label: 'Obra del día', path: '/arte', icon: 'palette', hue: 45, group: 'Biblioteca', description: 'Una obra de arte con su historia', keywords: 'arte obra pintura museo artista cuadro' },
  { id: 'quotes', label: 'Frase del día', path: '/frases', icon: 'quote', hue: 195, group: 'Biblioteca', description: 'Frases con contexto y significado', keywords: 'frase cita quote estoico filosofia' },
  // Herramientas
  { id: 'assistant', label: 'Asistente IA', path: '/asistente', icon: 'sparkle', hue: 22, group: 'Herramientas', description: 'Pedile lo que quieras sobre tu contenido', keywords: 'ia asistente chat preguntar claude gemini resumir' },
  { id: 'graph', label: 'Grafo de conocimiento', path: '/grafo', icon: 'graph', hue: 245, group: 'Herramientas', description: 'Cómo se conecta todo lo que guardaste', keywords: 'grafo conexiones relaciones vinculos knowledge' },
  { id: 'vault', label: 'Contraseñas', path: '/contrasenas', icon: 'key', hue: 75, group: 'Herramientas', description: 'Bóveda cifrada en el dispositivo', keywords: 'contraseña password clave boveda wifi generador' },
  // Ajustes
  { id: 'settings', label: 'Ajustes', path: '/ajustes', icon: 'settings', hue: 265, group: 'Ajustes', description: 'Apariencia, IA, sincronización, Atajos y datos', keywords: 'ajustes configuracion preferencias' },
  { id: 'appearance', label: 'Apariencia', path: '/ajustes#apariencia', icon: 'palette', hue: 265, group: 'Ajustes', description: 'Tema, color y letra', keywords: 'tema oscuro claro color letra fuente tamaño' },
  { id: 'ai', label: 'IA y privacidad', path: '/ajustes#ia', icon: 'shield', hue: 265, group: 'Ajustes', description: 'Proveedor gratuito y consentimiento', keywords: 'ia gemini groq privacidad' },
  { id: 'sync', label: 'Sincronización', path: '/ajustes#sync', icon: 'cloud', hue: 265, group: 'Ajustes', description: 'Tu Supabase y tu cuenta', keywords: 'supabase sincronizar cuenta respaldo nube' },
  { id: 'shortcuts', label: 'Atajos de iOS', path: '/ajustes#atajos', icon: 'bolt', hue: 265, group: 'Ajustes', description: 'Siri, Compartir y alarmas', keywords: 'atajos shortcuts siri widget iphone' },
  { id: 'data', label: 'Datos y copias', path: '/ajustes#datos', icon: 'database', hue: 265, group: 'Ajustes', description: 'Exportar e importar', keywords: 'exportar importar copia backup markdown csv' },
];

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Secciones que coinciden con lo escrito (nombre, descripción o palabras clave). */
export function findSections(query: string, limit = 6): Section[] {
  const q = norm(query.trim());
  if (!q) return [];
  const terms = q.split(/\s+/).filter((t) => t.length > 1);
  return SECTIONS.map((s) => {
    const label = norm(s.label);
    const hay = `${label} ${norm(s.description)} ${norm(s.keywords)}`;
    let score = 0;
    if (label.startsWith(q)) score += 6;
    else if (label.includes(q)) score += 4;
    for (const t of terms) if (hay.includes(t)) score += t.length > 3 ? 2 : 1;
    return { s, score };
  })
    .filter((x) => x.score > 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.s);
}
