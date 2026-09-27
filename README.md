# Personal OS — PWA

Journal, notas y biblioteca, tareas, recordatorios, hábitos, Pomodoro, búsqueda, agenda, contraseñas cifradas e IA gratuita. Se instala en el iPhone desde Safari. No hace falta cuenta de Apple Developer ni reinstalar cada 7 días.

- **Local-first:** todo se guarda en IndexedDB y funciona sin conexión.
- **Tu Supabase (opcional):** respaldo, sincronización entre dispositivos, IA y Atajos.
- **Contraseñas:** AES-256-GCM con clave PBKDF2 (310.000 iteraciones). Nunca salen del dispositivo.

## 1. Correr y publicar

```bash
npm install
npm run dev        # desarrollo
npm run build      # genera dist/ (incluye el service worker)
```

Publicación en Vercel: importá la carpeta; `vercel.json` ya resuelve las rutas de la SPA. Opcionalmente definí `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Si no las definís, se cargan desde la app en **Más → Sincronización**.

En el iPhone: abrí la URL en Safari → **Compartir** → **Agregar a inicio**.

## 2. Supabase

1. **SQL Editor** → pegá y ejecutá `supabase/migrations/001_personal_os.sql`. Crea `pos_items` y `pos_tokens` con RLS.
2. **Edge Functions**:
   - Con la CLI:
     ```bash
     supabase functions deploy ai
     supabase functions deploy capture --no-verify-jwt
     ```
   - Desde el panel web: creá `ai` pegando `supabase/functions/ai/index.ts` (con **Verify JWT** activado) y `capture` pegando `supabase/dashboard/capture.ts`. Esa es la versión en un solo archivo, y va con **Verify JWT desactivado**.
3. **Edge Functions → Secrets**:
   | Secreto | Para qué | Dónde se saca |
   |---|---|---|
   | `GEMINI_API_KEY` | IA gratis (principal) | aistudio.google.com → Get API key |
   | `GROQ_API_KEY` | IA gratis de respaldo + dictado (Whisper) | console.groq.com → API Keys |
   | `ANTHROPIC_API_KEY` | Claude (opcional, pago) | console.anthropic.com |
   | `GEMINI_MODEL` / `GROQ_MODEL` | opcional, para cambiar de modelo | por defecto `gemini-flash-latest` / `openai/gpt-oss-120b` |
4. **Authentication → Providers → Email**: activo. Creá tu cuenta desde la app (Más → Sincronización).

### Sobre la IA gratuita
- Gemini (nivel gratuito): tiene límites diarios, y Google puede usar lo enviado para mejorar sus modelos. Groq: gratis con límite de pedidos por día.
- En «Automático» se usa Gemini y, si falla o se agota el cupo, Groq.
- Solo se envía el texto de cada acción que pedís. Las claves de la IA viven en Supabase, nunca en el teléfono.

## 3. Inglés

Está como tarjeta en **Hoy** (tocala para abrir la sección) y también se encuentra desde la lupa.

- **Niveles:** MCER, de A1 a B2. Vienen 13 lecciones incluidas que funcionan sin conexión. Con la IA activa se pueden crear lecciones sobre cualquier tema.
- **Cada sesión:** Learn (vocabulario y gramática) → Practice (ejercicios) → Listen (diálogo con la voz del iPhone y preguntas) → Speak (repetís y la app compara palabra por palabra) → Review.
- **Repaso:** repetición espaciada (SM-2) con las palabras de cada lección y las que agregues a mano.
- **Practice your day in English:** toma una entrada del journal, la adapta a tu nivel, la contás en voz alta y la IA te devuelve gramática, vocabulario y fluidez.
- **Write in English:** la IA corrige gramática, vocabulario, ortografía y naturalidad. Tu texto original se conserva y podés guardar las dos versiones en el journal.
- **Reconocimiento de voz:** usa el del sistema cuando existe. Si no, graba y transcribe con Whisper (Groq) o Gemini.
- **Hábito:** podés vincular la práctica a un hábito, por ejemplo «Study English».

## 4. Dónde está cada cosa

- **Barra inferior:** tres pestañas — **Hoy**, **Cuaderno** y **Biblioteca** —, la **lupa** y el botón **+** de captura rápida.
- **Hoy:** la semana (deslizá para cambiar), las tareas del día, lo hecho y lo sin fecha plegados, hábitos, journal, inglés, foco, frase y obra del día. Los recordatorios ahora son **tareas con alarma** (campana): se agendan en iOS vía Atajos. La agenda es la tira de la semana.
- **Cuaderno:** una sola lista por mes con journal, notas, ideas, enlaces, mapas y PDFs. Sin filtros: se busca escribiendo. Deslizá una nota a la izquierda para **anclar, archivar o eliminar** (un deslizamiento largo elimina, con confirmación). El **+** elige el tipo (incluye «Mapa de un texto» e importar PDF). Carpetas y Archivo, al pie.
- **Biblioteca:** un estante ordenado por estado (Leyendo, Para leer, Para ver, Para escuchar; lo terminado plegado), más Descubrir (música, libros y temas) y la Obra del día.
- **Lupa · Buscar o preguntar:** busca solo en tu contenido y le pregunta a la IA. Las secciones no están ahí: cada una vive en su pestaña (Hábitos, Inglés, Foco y Frase en Hoy; Mapas, PDFs y Grafo en Cuaderno; Descubrir y Obra del día en Biblioteca; Contraseñas en Ajustes).
- **Ajustes:** una sola pantalla con secciones plegables (Apariencia, Hoy, General, IA, Sincronización, Atajos, Datos). Se abre con el ícono de arriba a la derecha en Hoy.
- **Lector:** píldora «Índice · %» con los títulos del texto, y **Aa** abre el panel de lectura: tema, voz, texto (fuentes y tipografía), buscar, y deslizadores de tamaño y brillo.
- **IA contextual:** al seleccionar texto en el editor aparece «Preguntar a la IA» con resumir, explicar, corregir, reformular, traducir, mapa mental, mapa conceptual, diagrama de sistema, flujo y crear tarea. Se puede comparar el original con la versión nueva.
- **Relacionado:** al pie de cada entrada o nota aparece el contenido conectado (grafo de conocimiento), y se puede vincular a mano.

## 5. Secciones

| Sección | Qué hace |
|---|---|
| Mapas y diagramas | Mapa mental, conceptual, de sistema y flujo. Se crean a mano o con IA desde un texto, nota o PDF; los nodos se mueven, conectan y colorean; se exportan como imagen |
| Dibujo | Lápiz, marcador, borrador, grosores, colores, rectángulos, elipses, líneas, flechas, texto, seleccionar y mover, deshacer y rehacer. También sirve para dibujar sobre una imagen |
| Imágenes | Cámara, fotos, escanear documento, dibujar encima y describir con IA |
| Voz | Dictado → transcripción → resumen, ideas, tareas, fechas, personas, lugares y decisiones, convertibles en nota, tarea o recordatorio |
| PDF | Importar, leer, buscar, resumir, explicar, extraer conceptos, crear notas y mapas, hacerle preguntas. El Journal y las notas se exportan a PDF desde Compartir → Imprimir |
| Libros | Estados Quiero leer, Leyendo y Terminado, con progreso, notas y portada automática (Open Library) |
| Videos | Enlaces de YouTube y playlists, con portada, título y canal automáticos. Categorías: Ver más tarde, Aprender, Entretenimiento, Ideas |
| Música | Canciones, discos, artistas y playlists con portada y vista previa de 30 s (iTunes). Se abren en YouTube Music. Solo se guardan enlaces y metadatos |
| Descubrir música / Para vos | Recomendaciones con IA que aprenden de lo que guardás, marcás como favorito, descartás o escuchás repetido |
| Obra del día | Obras de dominio público del Cleveland Museum of Art, con historia y contexto traducidos al español, y favoritas |
| Grafo de conocimiento | Conexiones automáticas por enlaces, etiquetas y temas en común, navegables |
| Asistente IA | Chat que opera sobre tu contenido: resumir, crear tareas o recordatorios, buscar, armar mapas, traducir |

Portadas y metadatos se piden directo desde el teléfono. Si un servicio lo bloquea, se piden a través de tu función `ai` (acción `lookup`, limitada a esos servicios públicos).

## 6. Atajos de iOS

En la app: **Más → Atajos** genera un token personal, muestra la dirección de `capture` y trae las recetas paso a paso:

- **POS Capturar**: POST `{"text": "..."}` con `Authorization: Bearer pos_…`. Sirve desde Siri, el botón de Acción o la hoja de Compartir.
- **POS Hoy**: GET, devuelve el resumen del día en texto.
- **POS Recordatorio iOS**: la app lo abre para crear el recordatorio nativo con alarma. Entrada: `título|AAAA-MM-DD HH:mm`.
- **POS Temporizador**: la app lo abre al empezar un Pomodoro. Entrada: minutos.

Una PWA no puede programar notificaciones locales en iOS ni tener widgets propios; los recordatorios con alarma y el temporizador van por Atajos.

## 7. Estructura

```
src/
  database/     IndexedDB + almacén en memoria con outbox
  services/     acciones, consultas, sync, IA, pomodoro, bóveda, atajos, exportación
  pages/        pantallas (Hoy, Cuaderno, Biblioteca, Buscar, Ajustes, Editor, Lector, …)
  components/   UI, editor (tablas, dibujo, voz, IA), captura, tareas, hábitos
  styles/       tokens, base, componentes, pantallas
supabase/
  migrations/   esquema
  functions/    ai (Gemini/Groq/Claude) · capture (Atajos) · _shared (parser en español)
  dashboard/    capture.ts en un solo archivo para pegar en el panel
```
