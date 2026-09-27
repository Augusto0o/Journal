# Product

<!-- impeccable:product-schema 1 -->

> Nota: este registro se escribió sin una ronda de entrevista (la sesión continuó sin preguntas al usuario). Todo sale del brief original y de sus mensajes; lo inferido está marcado *(inferido)*.

## Platform

web

## Stack

Vite + React 18 + TypeScript, PWA instalable en iPhone (pantalla de inicio). Datos local-first en IndexedDB; sincronización opcional con el Supabase privado del usuario (tabla `pos_items`). IA vía Edge Function propia con proveedores gratuitos (Gemini / Groq) y Claude opcional.

## Users

Una sola persona, dueña de la app, hispanohablante (voseo rioplatense), que la usa en su iPhone a lo largo del día: capturas rápidas en movimiento, tareas y hábitos por la mañana, journal y lectura por la noche. *(inferido: franja horaria y escenas)*

## Product Purpose

Un "sistema operativo personal": journal, notas/biblioteca, tareas, recordatorios, hábitos, Pomodoro, búsqueda, contraseñas y asistencia de IA en un solo lugar privado. Éxito = abrirla es más rápido que abrir cinco apps, y lo escrito se puede releer con gusto.

## Positioning

Todo en el dispositivo del usuario y en su propio Supabase; sin cuenta de terceros, sin cuota de Apple Developer. Integración con iOS mediante la app Atajos (captura desde cualquier lugar, recordatorios nativos, temporizador) en lugar de widgets nativos.

## Operating Context

- iPhone, PWA en pantalla completa, uso con una mano; modo claro y oscuro según el sistema.
- Atajos de iOS: POST a la función `capture` con token personal; la app abre `shortcuts://` para recordatorios nativos y temporizador.
- Sin conexión la app funciona entera salvo IA y sincronización.

## Capabilities and Constraints

- Una PWA no puede programar notificaciones locales en iOS: los avisos van por Atajos → Recordatorios.
- Una PWA instalada no puede abrirse por URL desde Atajos con su propio almacenamiento.
- La IA gratuita tiene límites diarios; el nivel gratuito de Gemini puede usar los datos para entrenar (se avisa en la app).
- La bóveda de contraseñas se cifra en el dispositivo y nunca se sincroniza ni se envía a la IA.

## Brand Commitments

- Nombre: Personal OS.
- Dirección visual pedida por el usuario: minimalista, premium, intelectual y personal; referencias Apple, Linear, Raycast, Vercel, Stripe; azul oscuro / violeta sutil; glassmorphism discreto; sin neón, sin estética gamer, sin gamificación.
- Referencias concretas aportadas: panel de ajustes de lectura estilo Apple Books (tarjeta de vista previa, puntos de tema, fichas "Aa" por fuente, grupo Tipografía con valores en píldora, alineación Default/Justify) y barra inferior de lector con píldoras negras (hora, Leer|Escuchar, brillo, tamaño de texto, ocultar).
- Navegación: Inicio, Journal, Tareas, Biblioteca, Más + botón de captura.

## Evidence on Hand

No hay contenido real del usuario; los estados vacíos enseñan la interfaz. Las 20 frases del día vienen del brief. No inventar métricas ni testimonios.

## Product Principles

1. Capturar primero, ordenar después: cualquier idea entra en dos toques.
2. Privado por defecto: nada sale del dispositivo sin que el usuario lo conecte.
3. Calma sobre estímulo: ningún número compite por atención; las rachas informan, no presionan.
4. Leer lo escrito tiene que dar gusto: la tipografía del contenido es configurable y cuidada.
5. Nativo en la mano: gestos, hojas y respuestas de toque como una app de iOS.

## Accessibility & Inclusion

Respeta Reduce Motion, contraste AA en ambos temas, tamaños de texto configurables en el lector, objetivos táctiles de 44 px.
