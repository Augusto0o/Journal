import type { Quote } from '@/types';

export const QUOTES: Quote[] = [
  { text: "No es que tengamos poco tiempo, sino que perdemos mucho.", author: "Séneca", context: "De la brevedad de la vida, carta a Paulino (c. 49 d. C.).", meaning: "La vida alcanza si no la regalamos a lo que no importa. El problema rara vez es la falta de tiempo, sino dónde lo ponemos." },
  { text: "No son las cosas las que nos perturban, sino las opiniones que tenemos de ellas.", author: "Epicteto", context: "Enquiridión, capítulo 5. Epicteto fue un esclavo liberto que enseñó filosofía estoica.", meaning: "Entre lo que pasa y cómo nos sentimos hay un juicio. Ese juicio sí depende de nosotros." },
  { text: "Primero di qué quieres ser; luego haz lo que tengas que hacer.", author: "Epicteto", context: "Discursos, libro III.", meaning: "Definir la dirección simplifica las decisiones: cada acción se evalúa según si te acerca o no." },
  { text: "Si quieres ser escritor, escribe.", author: "Epicteto", context: "Discursos, libro II, sobre cómo se forman los hábitos.", meaning: "Las identidades se construyen con la práctica diaria, no con la intención." },
  { text: "La vida no examinada no merece ser vivida.", author: "Sócrates", context: "Según Platón en la Apología, durante el juicio a Sócrates (399 a. C.).", meaning: "Reflexionar sobre lo que hacemos y por qué es parte de vivir bien. Escribir un diario es una forma de examen." },
  { text: "Conócete a ti mismo.", author: "Templo de Apolo en Delfos", context: "Inscripción en el pronaos del templo, citada por muchos filósofos griegos.", meaning: "Entender tus límites, deseos y hábitos es el punto de partida de cualquier mejora." },
  { text: "Nada en exceso.", author: "Templo de Apolo en Delfos", context: "Otra de las máximas inscritas en Delfos.", meaning: "La moderación sostiene en el tiempo lo que la intensidad solo logra por un rato." },
  { text: "Mientras enseñamos, aprendemos.", author: "Séneca", context: "Cartas a Lucilio, carta 7.", meaning: "Explicar algo obliga a ordenarlo; por eso enseñar es una de las mejores formas de comprender." },
  { text: "El que tiene un porqué para vivir puede soportar casi cualquier cómo.", author: "Friedrich Nietzsche", context: "Crepúsculo de los ídolos (1889). Viktor Frankl la retomó en El hombre en busca de sentido.", meaning: "Un propósito claro da resistencia frente a las dificultades." },
  { text: "Caminante, no hay camino, se hace camino al andar.", author: "Antonio Machado", context: "Campos de Castilla (1912), \"Proverbios y cantares\".", meaning: "El rumbo se descubre avanzando; esperar a tener todo claro puede ser una forma de no empezar." },
  { text: "Hoy es siempre todavía.", author: "Antonio Machado", context: "Juan de Mairena (1936).", meaning: "Mientras sea hoy, todavía hay margen para actuar." },
  { text: "Somos lo que hacemos repetidamente. La excelencia, entonces, no es un acto sino un hábito.", author: "Will Durant", context: "The Story of Philosophy (1926). Suele atribuirse a Aristóteles, pero es una síntesis de Durant sobre su ética.", meaning: "Los resultados reflejan la suma de pequeñas acciones cotidianas." },
  { text: "Hay que cultivar nuestro jardín.", author: "Voltaire", context: "Última línea de Cándido (1759).", meaning: "Frente a lo que no controlamos, ocuparnos con cuidado de lo cercano y concreto." },
  { text: "Pienso, luego existo.", author: "René Descartes", context: "Discurso del método (1637).", meaning: "Incluso dudando de todo, el acto de pensar demuestra que hay alguien que piensa." },
  { text: "Todo fluye.", author: "Heráclito", context: "Fórmula con la que la tradición resume su pensamiento (c. 500 a. C.).", meaning: "El cambio es la regla, no la excepción; conviene diseñar la vida pensando en eso." },
  { text: "Pierde una hora por la mañana y la estarás buscando todo el día.", author: "Richard Whately", context: "Arzobispo y lógico inglés del siglo XIX.", meaning: "Cómo empieza el día marca el ritmo del resto." },
  { text: "Vivir es lo más raro del mundo. La mayoría de la gente existe, eso es todo.", author: "Oscar Wilde", context: "El alma del hombre bajo el socialismo (1891).", meaning: "Vivir de verdad implica elegir y prestar atención, no solo dejar pasar los días." },
  { text: "Haz cada acto de tu vida como si fuera el último.", author: "Marco Aurelio", context: "Meditaciones, libro II. Notas personales del emperador romano.", meaning: "Hacer cada cosa con presencia y sin prisa ansiosa." },
  { text: "Lo esencial es invisible a los ojos.", author: "Antoine de Saint-Exupéry", context: "El principito (1943), dicho por el zorro.", meaning: "Lo que más importa suele no verse a simple vista: vínculos, tiempo dedicado, cuidado." },
  { text: "Quien tiene paciencia obtendrá lo que desea.", author: "Benjamin Franklin", context: "Almanaque del pobre Richard (siglo XVIII).", meaning: "Muchos logros dependen más de la constancia que del talento." },
];

/** Frase determinista por día (la misma durante todo el día). */
export function quoteOfDay(day: string): Quote {
  let h = 5381;
  for (const ch of day) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
  return QUOTES[h % QUOTES.length];
}

export const quoteId = (q: Quote) => `${q.author}:${q.text.slice(0, 24)}`;
