// Tipos de registro compartidos por la PWA y las Edge Functions.
// Regla de evolución: los campos NUEVOS deben ser opcionales.

export type Kind = 'journal' | 'note' | 'folder' | 'task' | 'reminder' | 'habit' | 'focus' | 'card' | 'lesson' | 'map' | 'doc' | 'media';

export interface BaseRecord {
  id: string;
  kind: Kind;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export type PaperStyle = 'plain' | 'lined' | 'dotted' | 'grid';

export interface JournalEntry extends BaseRecord {
  kind: 'journal';
  title: string | null;
  /** HTML saneado del editor. */
  content: string;
  /** Día local YYYY-MM-DD. */
  entryDate: string;
  tags: string[];
  isFavorite: boolean;
  paper?: PaperStyle | null;
  /** Enlaces manuales a otros contenidos (grafo de conocimiento). */
  links?: string[];
}

export type NoteType = 'note' | 'idea' | 'link';

export interface Note extends BaseRecord {
  kind: 'note';
  title: string | null;
  content: string;
  noteType: NoteType;
  url?: string | null;
  folderId?: string | null;
  category?: string | null;
  tags: string[];
  isFavorite: boolean;
  isPinned: boolean;
  isArchived: boolean;
  /** Enlaces salientes a notas o entradas. */
  linkedIds: string[];
  paper?: PaperStyle | null;
}

export interface Folder extends BaseRecord {
  kind: 'folder';
  name: string;
  /** 'media' = lista de videos/enlaces guardados (Biblioteca); si falta, es una carpeta de notas. */
  scope?: 'notes' | 'media';
  /** Lista vinculada a una playlist de YouTube: los videos de YouTube que entran acá también van allá. */
  ytPlaylistId?: string | null;
  ytPlaylistTitle?: string | null;
}

/** 0 = ninguna, 1 = baja, 2 = media, 3 = alta */
export type Priority = 0 | 1 | 2 | 3;
export type Repeat = 'never' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';

export interface Subtask {
  id: string;
  title: string;
  isDone: boolean;
}

export interface Task extends BaseRecord {
  kind: 'task';
  title: string;
  notes: string;
  isDone: boolean;
  completedAt?: string | null;
  /** Día local YYYY-MM-DD (null = Inbox). */
  dueDate: string | null;
  /** HH:mm o null. */
  dueTime: string | null;
  priority: Priority;
  repeat: Repeat;
  category?: string | null;
  subtasks: Subtask[];
  sourceId?: string | null;
  /** Con hora y alarma: se agenda también en Recordatorios de iOS (antes «Recordatorio»). */
  alarm?: boolean;
}

export interface Reminder extends BaseRecord {
  kind: 'reminder';
  title: string;
  notes: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  repeat: Repeat;
  priority: Priority;
  category?: string | null;
  isDone: boolean;
  completedAt?: string | null;
}

export type HabitSchedule =
  | { type: 'daily' }
  | { type: 'weekdays'; days: number[] } // 0 = domingo … 6 = sábado
  | { type: 'times'; perWeek: number };

export interface Habit extends BaseRecord {
  kind: 'habit';
  name: string;
  icon: string;
  color: string;
  schedule: HabitSchedule;
  target: number;
  reminderTime?: string | null;
  log: Record<string, number>;
  isArchived: boolean;
  order: number;
}

export interface FocusSession extends BaseRecord {
  kind: 'focus';
  start: string;
  end: string;
  minutes: number;
  label: string;
  taskId?: string | null;
}

// ---------------- Inglés ----------------

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2';

/** Tarjeta de vocabulario con repetición espaciada (SM-2 simplificado). */
export interface EnglishCard extends BaseRecord {
  kind: 'card';
  en: string;
  es: string;
  example: string;
  level: CefrLevel;
  lessonId?: string | null;
  /** Próximo repaso, YYYY-MM-DD. */
  due: string;
  /** Días hasta el próximo repaso. */
  interval: number;
  ease: number;
  reps: number;
  lapses: number;
}

/** Sesión de inglés completada. */
export interface EnglishLog extends BaseRecord {
  kind: 'lesson';
  lessonId: string;
  title: string;
  level: CefrLevel;
  date: string;
  minutes: number;
  /** 0–100 */
  score: number;
  mode: 'lesson' | 'review' | 'journal';
}

// ---------------- Mapas y diagramas ----------------

export type MapType = 'mind' | 'concept' | 'system' | 'flow';

export interface MapNode {
  id: string;
  text: string;
  x: number;
  y: number;
  /** 0 = centro, 1 = concepto principal, 2 = subconcepto, 3 = detalle */
  depth?: number;
  color?: string | null;
}

export interface MapEdge {
  id: string;
  from: string;
  to: string;
  label?: string | null;
}

export interface MindMap extends BaseRecord {
  kind: 'map';
  title: string;
  mapType: MapType;
  nodes: MapNode[];
  edges: MapEdge[];
  /** Contenido del que salió (nota, entrada, PDF). */
  sourceId?: string | null;
  links?: string[];
}

// ---------------- PDF ----------------

export interface DocFile extends BaseRecord {
  kind: 'doc';
  title: string;
  fileName: string;
  size: number;
  pages: number;
  /** Texto extraído (para buscar y para la IA). */
  text: string;
  /** Página donde quedó la lectura. */
  page: number;
  tags: string[];
  links?: string[];
}

// ---------------- Biblioteca multimedia ----------------

export type MediaType = 'book' | 'video' | 'music' | 'art' | 'movie';
export type MediaStatus = 'want' | 'reading' | 'finished' | 'later' | 'watched' | 'listened' | 'liked' | 'dismissed' | 'saved';

export interface MediaItem extends BaseRecord {
  kind: 'media';
  mediaType: MediaType;
  title: string;
  /** Autor, canal o artista. */
  creator: string;
  url?: string | null;
  cover?: string | null;
  genre?: string | null;
  /** Videos: Watch Later / Learning / Entertainment / Ideas. Música: song / artist / album / playlist. */
  category?: string | null;
  status: MediaStatus;
  /** 0–100 (libros). */
  progress?: number;
  /** Películas: puntaje de 0.5 a 5 (medias estrellas) y fecha en que se vio. */
  rating?: number | null;
  watchedOn?: string | null;
  notes?: string;
  year?: string | null;
  duration?: string | null;
  previewUrl?: string | null;
  /** Veces que se escuchó la vista previa (señal para recomendaciones). */
  plays?: number;
  meta?: Record<string, string>;
  links?: string[];
  /** Lista de la Biblioteca a la que pertenece (Folder con scope 'media'). */
  listId?: string | null;
}

export type AnyRecord = JournalEntry | Note | Folder | Task | Reminder | Habit | FocusSession | EnglishCard | EnglishLog | MindMap | DocFile | MediaItem;

export interface RecordByKind {
  journal: JournalEntry;
  note: Note;
  folder: Folder;
  task: Task;
  reminder: Reminder;
  habit: Habit;
  focus: FocusSession;
  card: EnglishCard;
  lesson: EnglishLog;
  map: MindMap;
  doc: DocFile;
  media: MediaItem;
}

export const KINDS: Kind[] = ['journal', 'note', 'folder', 'task', 'reminder', 'habit', 'focus', 'card', 'lesson', 'map', 'doc', 'media'];
