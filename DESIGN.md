# Design — Personal OS

Mundo: **oscuro y mínimo**. Grafito en capas, cromo en píldoras y un solo acento azul suave. Referencias del usuario: panel de lectura de Libros, píldora «Índice · 15%» con anillo, barras de herramientas en cápsula, tarjetas flotantes oscuras (cita/video) y app de dibujo oscura. Pensado para usarse sobre todo de noche.

## Principios
- **Menos menús:** 3 pestañas (Hoy · Cuaderno · Biblioteca) + lupa + captura. Nada de chips de filtro: se busca escribiendo; lo secundario se pliega («Hechas», «Sin fecha», «Terminado»).
- **Una acción principal por pantalla:** el + del encabezado o el + del dock.
- **Superficies rellenas, sin filetes:** la jerarquía la dan las capas de gris, no los bordes ni las sombras.

## Color (OKLCH, `src/styles/tokens.css`)
- Oscuro (por defecto): `--bg 0.14`, `--surface 0.19`, `--surface-2 0.235`, `--surface-3 0.285`; texto 0.955 / 0.72 / 0.56; filetes `oklch(1 0 0 / 0.07)`.
- Acento azul suave `oklch(0.6 0.165 265)`, sólo para acción principal, día de hoy, selección y progreso.
- Claro disponible en Ajustes → Apariencia (neutro, sin tinte).
- Flotantes (`--float`): gris casi negro translúcido con desenfoque, texto claro, botones internos `--float-btn`.

## Tipografía
- **Geist** variable empaquetada. Títulos de pestaña 34/600 con tracking −0.03em; texto 17/400; etiquetas de bloque 13/500 en `--text-3`.
- El contenido puede pasar a serif desde el panel de lectura (New York, Iowan, Georgia…).

## Componentes (`src/styles/v3.css`)
- **Dock:** cápsula con la pestaña activa expandida (ícono + nombre) e indicador que se desliza; lupa redonda aparte; disco azul «+».
- **Encabezado de pestaña:** fecha chica + título grande + botón redondo gris.
- **Semana:** 7 celdas; hoy seleccionado en azul, punto si hay algo ese día.
- **Listas:** una tarjeta rellena (radio 18) con filas separadas por filete inset.
- **Lector:** píldora negra «Índice ⌄ | ◔ 15%» + botón «Aa». El panel flotante tiene fila de temas, Voz, Texto, Buscar y dos deslizadores verticales (tamaño y brillo).
- **Editor:** barra en cápsula «Texto | B I | imagen dibujo micrófono ⋯» con separadores, círculo gris para cerrar y disco claro de IA. Al grabar: «0:12 · · · · · 🗑 ✓».
- **Hojas inferiores:** fondo `--surface`, tirador arrastrable, `--ease-drawer` 380 ms.

## Movimiento (Emil Kowalski)
- `--ease-out cubic-bezier(0.23,1,0.32,1)`, `--ease-drawer (0.32,0.72,0,1)`.
- Presión `scale(0.97)` (tarjetas) / `0.92` (íconos); aparición de flotantes 240 ms desde 8 px abajo y 0.97.
- Sólo transform/opacity. `prefers-reduced-motion` desactiva animaciones.
