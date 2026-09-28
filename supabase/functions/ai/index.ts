// =====================================================================
// Personal OS — Edge Function "ai"  (proveedores GRATUITOS por defecto)
//
// Proveedores, en orden de uso con provider="auto":
//   1. Gemini (Google AI Studio, nivel gratuito)   → GEMINI_API_KEY
//   2. Groq (nivel gratuito, OpenAI-compatible)     → GROQ_API_KEY
//   3. Claude (de pago, opcional)                   → ANTHROPIC_API_KEY
// Si uno falla (límite diario, caída), se prueba el siguiente configurado.
//
// Secretos opcionales: GEMINI_MODEL, GROQ_MODEL, GROQ_WHISPER_MODEL, ANTHROPIC_MODEL, AI_PROVIDER.
// Verify JWT: puede ir DESACTIVADO: la función valida la sesión del usuario con Auth.
// =====================================================================

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const GEMINI_API_KEY = env("GEMINI_API_KEY");
const GEMINI_MODEL = env("GEMINI_MODEL", "gemini-flash-latest");
const GROQ_API_KEY = env("GROQ_API_KEY");
const GROQ_MODEL = env("GROQ_MODEL", "openai/gpt-oss-120b");
const GROQ_WHISPER_MODEL = env("GROQ_WHISPER_MODEL", "whisper-large-v3-turbo");
const ANTHROPIC_API_KEY = env("ANTHROPIC_API_KEY");
const ANTHROPIC_MODEL = env("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001");
// Opcional: clave gratuita de themoviedb.org para portadas, sinopsis y «dónde verla».
const TMDB_API_KEY = env("TMDB_API_KEY");
const DEFAULT_PROVIDER = env("AI_PROVIDER", "auto");
const SUPABASE_URL = env("SUPABASE_URL");
const SUPABASE_ANON_KEY = env("SUPABASE_ANON_KEY");
const MAX_INPUT = 30_000;

type Provider = "gemini" | "groq" | "anthropic";
type Action =
  | "summarize" | "simplify" | "reformulate" | "correct" | "structure" | "explain" | "translate_en" | "translate_es"
  | "extract_tasks" | "classify" | "search" | "voice_extract" | "transcribe" | "lookup"
  | "english_correct" | "english_speaking" | "english_day" | "english_lesson"
  | "visualize" | "ask" | "assistant" | "recommend" | "image" | "tmdb" | "about";

const TEXT_ACTIONS = ["summarize", "simplify", "reformulate", "correct", "structure", "explain", "translate_en", "translate_es"];
const JSON_ACTIONS = ["extract_tasks", "classify", "search", "voice_extract", "english_correct", "english_speaking", "english_day", "english_lesson", "visualize", "ask", "assistant", "recommend", "about"];

interface Payload {
  action: Action;
  provider?: string;
  text?: string;
  today?: string;
  timezone?: string;
  documents?: Array<{ id: string; type: string; title: string; date: string; excerpt: string }>;
  audio?: string;
  mimeType?: string;
  language?: string;
  level?: string;
  prompt?: string;
  mapType?: string;
  context?: string;
  messages?: { role: string; content: string }[];
  mediaKind?: string;
  image?: string;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function verifyUser(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth) return false;
  // Usa la clave que manda la app (anon o publishable) para validar la sesión con Auth.
  const apikey = req.headers.get("apikey") || SUPABASE_ANON_KEY;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey } });
  return res.ok;
}

// ---------------- Prompts ----------------

const BASE = `Sos la capa de IA de "Personal OS", el sistema personal (journal, notas, tareas) de una sola persona que escribe en español rioplatense.
Reglas:
- Mantené SIEMPRE el significado original. No inventes hechos, nombres ni fechas.
- Escribí en el mismo idioma del texto salvo que la tarea pida traducir.
- Claro, cálido y conciso. Sin preámbulos ni comentarios sobre lo que hiciste.`;

const TEXT_TASK: Record<string, string> = {
  summarize: "Resumí el texto en pocas líneas: ideas principales y, si existen, decisiones o próximos pasos. Usá viñetas \"- \" si ayuda.",
  simplify: "Explicá el texto de forma sencilla, con frases cortas y sin jerga.",
  reformulate: "Reformulá el texto para que sea más claro y fluido, conservando tono y significado. Devolvé solo el texto.",
  correct: "Corregí ortografía, gramática y puntuación sin cambiar estilo ni contenido. Devolvé solo el texto corregido.",
  structure: "Organizá el texto con títulos \"## \", listas \"- \" e ideas principales. No agregues información nueva.",
  explain: "Explicá el contenido como para un principiante: qué significa, por qué importa y un ejemplo breve.",
  translate_en: "Traducí el texto al inglés de forma natural. Devolvé solo la traducción.",
  translate_es: "Traducí el texto al español de forma natural. Devolvé solo la traducción.",
};

const textSystem = (a: string) =>
  `${BASE}\nFormato de salida: Markdown simple (## títulos, - listas, párrafos separados por línea en blanco). Nada más.\n\nTarea: ${TEXT_TASK[a]}`;

const TASK_SHAPE = `{"title":"...","dueDate":"YYYY-MM-DD o null","dueTime":"HH:mm o null","priority":0}`;

function jsonSystem(p: Payload) {
  const today = p.today ?? new Date().toISOString().slice(0, 10);
  const common = `${BASE}
Hoy es ${today} (zona horaria ${p.timezone ?? "UTC"}). Interpretá fechas relativas ("mañana", "el viernes", "la semana pasada") respecto de hoy.
Respondé SOLO con un objeto JSON válido, sin texto adicional ni bloques de código. priority: 0 ninguna, 1 baja, 2 media, 3 alta.`;
  switch (p.action) {
    case "extract_tasks":
      return `${common}
Detectá las acciones concretas que la persona tiene que hacer. Títulos cortos en infinitivo.
Si una frase encadena acciones, creá una tarea por acción y heredá la fecha.
Formato: {"tasks":[${TASK_SHAPE}]}. Si no hay: {"tasks":[]}`;
    case "classify":
      return `${common}
Clasificá una captura rápida. Tipos: "note", "idea", "task", "reminder", "journal", "link".
Formato: {"type":"...","category":"categoría breve o null","title":"título de hasta 6 palabras o null"}`;
    case "search":
      return `${common}
Recibís una consulta y un índice de documentos (id, tipo, título, fecha, extracto). Encontrá los relevantes por SIGNIFICADO y respetá referencias temporales.
Formato: {"ids":["..."],"answer":"respuesta breve (1-3 frases) en segunda persona"}. Máximo 8 ids del índice, por relevancia.`;
    case "voice_extract":
      return `${common}
El texto es la transcripción de una nota de voz. Analizala.
Formato: {"summary":"...","ideas":["..."],"tasks":[${TASK_SHAPE}],"dates":["..."],"people":["..."],"places":["..."],"decisions":["..."]}. Listas vacías si no aplica.`;
    case "english_correct":
      return `${common}
Sos un profesor de inglés paciente. El alumno (nivel ${p.level ?? "A2"}) escribió un texto en inglés.
Corregí gramática, vocabulario, ortografía y naturalidad SIN cambiar lo que quiso decir. No reescribas de más.
Las notas van en español, breves y amables.
Formato: {"corrected":"texto corregido completo","changes":[{"type":"grammar|vocabulary|spelling|naturalness","original":"fragmento original","fix":"fragmento corregido","note":"por qué, en una línea"}],"score":0-100,"comment":"una frase de aliento con el punto más importante a mejorar"}`;
    case "english_speaking":
      return `${common}
Sos un profesor de inglés. El texto es la transcripción automática de lo que el alumno (nivel ${p.level ?? "A2"}) dijo en voz alta${p.prompt ? ` respondiendo a: "${p.prompt}"` : ""}.
Ignorá la falta de puntuación propia de una transcripción. Evaluá gramática, vocabulario y fluidez.
Notas en español, breves.
Formato: {"corrected":"cómo lo diría un nativo, manteniendo la idea","changes":[{"type":"grammar|vocabulary|naturalness","original":"...","fix":"...","note":"..."}],"fluency":"comentario breve sobre fluidez y longitud de las frases","score":0-100,"comment":"una frase de aliento"}`;
    case "english_day":
      return `${common}
El texto es una entrada del diario del alumno (en español). Nivel del alumno: ${p.level ?? "A2"}.
Escribí cómo contaría ese mismo día en primera persona en inglés natural, ADAPTADO a su nivel (frases cortas en A1/A2).
Formato: {"model":"el texto modelo en inglés (3-6 frases)","vocab":[{"en":"palabra o expresión útil","es":"traducción","example":"frase del modelo que la usa"}],"prompts":["pregunta en inglés para que el alumno siga hablando de su día","..."]}
Entre 5 y 8 palabras de vocabulario y 3 preguntas.`;
    case "english_lesson":
      return `${common}
Creá una micro-lección de inglés de nivel ${p.level ?? "A2"} (MCER) sobre el tema indicado, para un hispanohablante rioplatense.
Traducciones y explicaciones en español; todo lo demás en inglés natural y correcto.
Formato: {"title":"título en español","topic":"título en inglés","minutes":8,
"vocab":[{"en":"...","es":"...","example":"..."}] (8 elementos),
"grammar":{"title":"...","explain":"explicación en español en 2-3 frases","examples":[{"en":"...","es":"..."}],"exercises":[{"prompt":"frase con ___","options":["a","b","c"],"answer":"opción correcta exacta"}]} (3 ejercicios),
"dialogue":[{"speaker":"A|B","en":"...","es":"..."}] (5-7 líneas),
"questions":[{"q":"pregunta de comprensión en inglés","options":["...","...","..."],"answer":0}] (2),
"speak":[{"en":"frase para repetir","es":"traducción"}] (3)}`;
    case "visualize":
      return `${common}
Transformá el texto en un diagrama. Tipo pedido: ${p.mapType ?? "auto"}.
Si es "auto", elegí el más apropiado: "mind" (ideas jerárquicas), "concept" (conceptos unidos por relaciones), "system" (componentes y cómo se conectan) o "flow" (proceso paso a paso).
Reglas: textos de nodo breves (máx. 6 palabras), en el idioma del texto, sin inventar información.
- mind: una idea central → 3-7 conceptos principales → subconceptos → detalles (máx. 4 niveles, 30 nodos).
- concept: árbol base con parent + "edges" extra con "label" (verbo de relación: "causa", "incluye", "depende de").
- system: cada componente es un nodo; "edges" con label describen el flujo de datos o dependencia.
- flow: nodos en orden; parent = paso anterior; decisiones como ramas.
Formato: {"type":"mind|concept|system|flow","title":"título breve","nodes":[{"id":"n1","text":"...","parent":null|"id"}],"edges":[{"from":"id","to":"id","label":"..."}]}`;
    case "ask":
      return `${common}
Respondé la pregunta usando SOLO el documento dado como contexto. Si no está en el documento, decilo.
Formato: {"answer":"respuesta clara en el idioma de la pregunta (usa Markdown simple si ayuda)","quotes":["cita textual breve del documento que respalda la respuesta"]}`;
    case "assistant":
      return `${common}
Sos el asistente de la app. Podés operar sobre el contenido del usuario. Contexto disponible (puede estar vacío): una selección o resultados de búsqueda.
Respondé de forma breve y útil. Si el pedido implica una acción, proponela en "actions" (la app pide confirmación):
- {"type":"create_task","title":"...","date":"YYYY-MM-DD|null","time":"HH:mm|null"}
- {"type":"create_reminder","title":"...","date":"YYYY-MM-DD","time":"HH:mm"}
- {"type":"create_note","title":"...","text":"contenido en Markdown"}
- {"type":"create_map","title":"...","text":"texto base","mapType":"mind|concept|system|flow"}
- {"type":"search","query":"..."}
Si piden resumir, explicar, corregir, reformular, traducir, convertir en tabla u organizar ideas, hacelo directamente en "reply" (Markdown; tablas con | columnas |).
Formato: {"reply":"...","actions":[...]}`;
    case "about":
      return `${common}
Contá de qué trata la obra (libro o película) indicada, para alguien que está decidiendo si leerla o verla. Usá lo que sepas de la obra real; la sinopsis dada es solo una ayuda. Si no la conocés, basate en la sinopsis y no inventes datos.
En español con voseo rioplatense, sin spoilers del final. 120-180 palabras en "summary": el planteo, los temas principales y el tono. En "forWho", una frase: a quién le puede gustar.
Formato: {"summary":"...","forWho":"..."}`;
    case "recommend":
      return `${common}
Recomendá contenido del tipo "${p.mediaKind ?? "music"}" según el perfil de gustos del usuario (texto). Mezclá afinidad con algo de descubrimiento. No repitas lo que ya tiene ni lo descartado.
- music: canciones reales y existentes (title = canción, creator = artista, genre, why).
- books: libros reales (title, creator = autor, genre, why).
- videos: temas o canales de YouTube reales (title, creator = canal, category, why).
- topics: temas para explorar (title, why).
- movies: películas reales y existentes (title = título original o más conocido, creator = director, genre, year, why). Si el perfil pide un género, respetalo.
"why" en una frase en español.
Formato: {"items":[{"title":"...","creator":"...","genre":"...","category":"...","year":"...","why":"..."}]} con 8 elementos.`;
    default:
      return common;
  }
}

function extractJSON(s: string): unknown {
  const cleaned = s.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("La IA no devolvió JSON válido");
  }
}

// ---------------- Proveedores ----------------

class ProviderError extends Error {
  constructor(msg: string, public retryable = true) {
    super(msg);
  }
}

// Cada modelo (y cada clave de otro proyecto de Google) tiene su propio cupo gratuito:
// si uno se agota, se prueba el siguiente antes de pasar a otro proveedor.
const GEMINI_KEYS = [GEMINI_API_KEY, env("GEMINI_API_KEY_2"), env("GEMINI_API_KEY_3")].filter(Boolean);
const GEMINI_MODELS = [...new Set([GEMINI_MODEL, "gemini-flash-lite-latest", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"])];
const GROQ_MODELS = [...new Set([GROQ_MODEL, "llama-3.3-70b-versatile", "openai/gpt-oss-20b", "meta-llama/llama-4-scout-17b-16e-instruct", "llama-3.1-8b-instant"])];
const cooling = new Map<string, number>(); // "proveedor:clave:modelo" → hasta cuándo no probarlo
const skip = (id: string) => (cooling.get(id) ?? 0) > Date.now();
const cool = (id: string, status: number) => cooling.set(id, Date.now() + (status === 429 ? 60_000 : 10 * 60_000));
// Errores que justifican probar otro modelo: sin cupo, modelo inexistente o caído.
const nextModel = (status: number) => status === 429 || status === 404 || status === 400 || status >= 500;

async function gemini(system: string, user: string, wantJSON: boolean): Promise<string> {
  let last = "Gemini sin respuesta";
  for (const [ki, key] of GEMINI_KEYS.entries()) {
    for (const model of GEMINI_MODELS) {
      const id = `gemini:${ki}:${model}`;
      if (skip(id)) continue;
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 4096, ...(wantJSON ? { responseMimeType: "application/json" } : {}) },
        }),
      });
      if (!res.ok) {
        last = `Gemini ${res.status} (${model}): ${(await res.text()).slice(0, 200)}`;
        if (nextModel(res.status)) {
          cool(id, res.status);
          continue;
        }
        throw new ProviderError(last);
      }
      const data = await res.json();
      const text = (data.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
      if (text) return text;
      last = `Gemini devolvió una respuesta vacía (${model})`;
    }
  }
  throw new ProviderError(last);
}

async function geminiTranscribe(audio: string, mime: string, language?: string): Promise<string> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [
          { text: language === "en" ? "Transcribe this English audio word for word, exactly as spoken (keep mistakes). Return only the transcript." : "Transcribí este audio palabra por palabra, en su idioma original, con puntuación. Devolvé solo la transcripción." },
          { inlineData: { mimeType: mime.split(";")[0], data: audio } },
        ],
      }],
      generationConfig: { temperature: 0 },
    }),
  });
  if (!res.ok) throw new ProviderError(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return (data.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("").trim();
}

async function groq(system: string, user: string, wantJSON: boolean): Promise<string> {
  let last = "Groq sin respuesta";
  for (const model of GROQ_MODELS) {
    const id = `groq:${model}`;
    if (skip(id)) continue;
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_completion_tokens: 4096,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        ...(wantJSON ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!res.ok) {
      last = `Groq ${res.status} (${model}): ${(await res.text()).slice(0, 200)}`;
      if (nextModel(res.status)) {
        cool(id, res.status);
        continue;
      }
      throw new ProviderError(last);
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    if (text) return text;
    last = `Groq devolvió una respuesta vacía (${model})`;
  }
  throw new ProviderError(last);
}

async function groqTranscribe(audio: string, mime: string, language?: string): Promise<string> {
  const bytes = Uint8Array.from(atob(audio), (c) => c.charCodeAt(0));
  const ext = mime.includes("webm") ? "webm" : mime.includes("ogg") ? "ogg" : mime.includes("wav") ? "wav" : "m4a";
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mime }), `audio.${ext}`);
  form.append("model", GROQ_WHISPER_MODEL);
  form.append("response_format", "json");
  if (language) form.append("language", language);
  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
    body: form,
  });
  if (!res.ok) throw new ProviderError(`Groq Whisper ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return ((await res.json()).text ?? "").trim();
}

async function anthropic(system: string, user: string, wantJSON: boolean): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      system: wantJSON ? `${system}\nDevolvé únicamente JSON.` : system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new ProviderError(`Claude ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return (data.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
}

const CONFIGURED: Record<Provider, boolean> = { gemini: !!GEMINI_API_KEY, groq: !!GROQ_API_KEY, anthropic: !!ANTHROPIC_API_KEY };
const CALL: Record<Provider, (s: string, u: string, j: boolean) => Promise<string>> = { gemini, groq, anthropic };

function order(requested?: string): Provider[] {
  const pref = (requested && requested !== "auto" ? requested : DEFAULT_PROVIDER) as Provider | "auto";
  const base: Provider[] = ["gemini", "groq", "anthropic"];
  const list = pref !== "auto" && base.includes(pref) ? [pref, ...base.filter((p) => p !== pref)] : base;
  return list.filter((p) => CONFIGURED[p]);
}

async function complete(p: Payload, system: string, user: string, wantJSON: boolean) {
  const providers = order(p.provider);
  if (!providers.length) throw new ProviderError("No hay ninguna clave de IA configurada en Supabase (GEMINI_API_KEY o GROQ_API_KEY).", false);
  const errors: string[] = [];
  for (const prov of providers) {
    try {
      return { text: await CALL[prov](system, user, wantJSON), provider: prov };
    } catch (e) {
      console.error(prov, (e as Error).message);
      errors.push((e as Error).message);
    }
  }
  throw new ProviderError(
    errors.some((e) => / 429/.test(e)) ? (CONFIGURED.groq ? "Se agotó el cupo gratuito de todos los modelos por ahora. Probá en un rato." : "Se agotó el cupo gratuito de Gemini. Agregá GROQ_API_KEY (gratis) en Supabase para tener respaldo.") : "Los proveedores de IA no respondieron.",
  );
}

// ---------------- Handler ----------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  if (!(await verifyUser(req))) return json({ error: "Sesión inválida" }, 401);

  let p: Payload;
  try {
    p = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  try {
    if (p.action === "lookup") {
      // Proxy de metadatos públicos (portadas, títulos) para servicios que no permiten CORS.
      const LOOKUP_HOSTS = ["itunes.apple.com", "openlibrary.org", "noembed.com", "api.artic.edu", "openaccess-api.clevelandart.org"];
      let u: URL;
      try {
        u = new URL((p as unknown as { url: string }).url);
      } catch {
        return json({ error: "URL inválida" }, 400);
      }
      if (u.protocol !== "https:" || !LOOKUP_HOSTS.includes(u.hostname)) return json({ error: "Servicio no permitido" }, 400);
      const r = await fetch(u.toString(), { headers: { "user-agent": "PersonalOS/1.0" } });
      if (!r.ok) return json({ error: `Servicio ${r.status}` }, 502);
      return json(await r.json());
    }

    if (p.action === "tmdb") {
      // Proxy de solo lectura a TMDB (la clave queda en Supabase).
      if (!TMDB_API_KEY) return json({ error: "no_tmdb" }, 503);
      const q = p as unknown as { path?: string; params?: Record<string, string> };
      const path = String(q.path ?? "");
      if (!/^(search\/movie|discover\/movie|genre\/movie\/list|movie\/\d+(\/watch\/providers|\/recommendations|\/videos)?)$/.test(path)) return json({ error: "Ruta no permitida" }, 400);
      const u = new URL(`https://api.themoviedb.org/3/${path}`);
      for (const [k, v] of Object.entries(q.params ?? {})) u.searchParams.set(k, String(v));
      const bearer = TMDB_API_KEY.startsWith("ey");
      if (!bearer) u.searchParams.set("api_key", TMDB_API_KEY);
      const r = await fetch(u.toString(), { headers: bearer ? { Authorization: `Bearer ${TMDB_API_KEY}` } : {} });
      if (!r.ok) return json({ error: `TMDB ${r.status}` }, 502);
      return json(await r.json());
    }

    if (p.action === "transcribe") {
      if (!p.audio) return json({ error: "Falta el audio" }, 400);
      if (p.audio.length > 14_000_000) return json({ error: "El audio es demasiado largo (máx. ~10 min)." }, 413);
      const mime = p.mimeType || "audio/mp4";
      const tries: Array<() => Promise<string>> = [];
      if (GROQ_API_KEY) tries.push(() => groqTranscribe(p.audio!, mime, p.language));
      if (GEMINI_API_KEY) tries.push(() => geminiTranscribe(p.audio!, mime, p.language));
      if (!tries.length) return json({ error: "Configurá GROQ_API_KEY o GEMINI_API_KEY para transcribir." }, 503);
      let last = "";
      for (const t of tries) {
        try {
          return json({ text: await t() });
        } catch (e) {
          last = (e as Error).message;
          console.error(last);
        }
      }
      return json({ error: "No se pudo transcribir el audio." , detail: last }, 502);
    }

    if (p.action === "image") {
      if (!p.image) return json({ error: "Falta la imagen" }, 400);
      if (!GEMINI_API_KEY) return json({ error: "El análisis de imágenes usa Gemini: configurá GEMINI_API_KEY." }, 503);
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: `${BASE}\nAnalizá la imagen para una nota personal: qué se ve, texto legible (transcribilo) y datos útiles. Markdown simple.` }] },
          contents: [{ role: "user", parts: [{ text: p.text || "Describí y analizá la imagen" }, { inlineData: { mimeType: p.mimeType || "image/jpeg", data: p.image } }] }],
        }),
      });
      if (!res.ok) return json({ error: `Gemini ${res.status}` }, 502);
      const data = await res.json();
      return json({ text: (data.candidates?.[0]?.content?.parts ?? []).map((x: { text?: string }) => x.text ?? "").join("") });
    }

    const text = (p.text ?? "").slice(0, MAX_INPUT);
    if (!text.trim()) return json({ error: "Texto vacío" }, 400);

    if (TEXT_ACTIONS.includes(p.action)) {
      const r = await complete(p, textSystem(p.action), text, false);
      return json({ text: r.text.trim(), provider: r.provider });
    }

    if (JSON_ACTIONS.includes(p.action)) {
      let user = text;
      if (p.action === "ask") {
        user = `Documento:\n${(p.context ?? "").slice(0, 60000)}\n\nPregunta: ${text}`;
      }
      if (p.action === "assistant") {
        const history = (p.messages ?? []).map((m) => `${m.role === "user" ? "Usuario" : "Asistente"}: ${m.content}`).join("\n");
        user = `Contexto:\n${(p.context ?? "").slice(0, 40000) || "(sin contexto)"}\n\nConversación:\n${history}`;
      }
      if (p.action === "search") {
        const docs = (p.documents ?? []).slice(0, 160).map((d) => `[${d.id}] (${d.type}, ${d.date}) ${d.title} — ${d.excerpt}`.slice(0, 400));
        user = `Consulta: ${text}\n\nÍndice:\n${docs.join("\n")}`;
      }
      const r = await complete(p, jsonSystem(p), user, true);
      return json({ ...(extractJSON(r.text) as Record<string, unknown>), provider: r.provider });
    }

    return json({ error: "Acción desconocida" }, 400);
  } catch (e) {
    const err = e as ProviderError;
    return json({ error: err.message }, err.retryable === false ? 503 : 502);
  }
});
