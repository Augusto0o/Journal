// supabase/functions/capture/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";

// supabase/functions/_shared/parser.ts
var pad = (n) => String(n).padStart(2, "0");
function normalize(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
function addDaysISO(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}
function weekdayISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function localNow(timeZone, date = /* @__PURE__ */ new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(date);
    const get = (t) => parts.find((p) => p.type === t)?.value ?? "00";
    const hour = get("hour") === "24" ? "00" : get("hour");
    return { today: `${get("year")}-${get("month")}-${get("day")}`, now: `${hour}:${get("minute")}` };
  } catch {
    return { today: date.toISOString().slice(0, 10), now: date.toISOString().slice(11, 16) };
  }
}
var WEEKDAYS = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
function cut(text, start, end) {
  return text.slice(0, start) + " " + text.slice(end);
}
function parseTask(input, ctx) {
  let text = " " + input.normalize("NFC").trim() + " ";
  let priority = 0;
  let category = null;
  let dueDate = null;
  let dueTime = null;
  const prio = [[/\s!alta\b/i, 3], [/\s!media\b/i, 2], [/\s!baja\b/i, 1], [/\s!!!/, 3], [/\s!!/, 2]];
  for (const [re, p] of prio) {
    if (re.test(text)) {
      priority = p;
      text = text.replace(re, " ");
      break;
    }
  }
  const cat = text.match(/\s#([\p{L}\p{N}_-]+)/u);
  if (cat) {
    category = cat[1];
    text = text.replace(cat[0], " ");
  }
  const timeRes = [
    /\s(?:a\s+las|a\s+la)\s+(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|hs|h)?(?:\s+de\s+la\s+(manana|tarde|noche))?(?=\s)/,
    /\s(\d{1,2})[:.](\d{2})\s*(am|pm|hs|h)?(?=\s)/,
    /\s(\d{1,2})\s*(am|pm)(?=\s)/,
    /\s(\d{1,2})\s*(hs|h)(?=\s)/
  ];
  for (let i = 0; i < timeRes.length; i++) {
    const norm = normalize(text);
    const m = timeRes[i].exec(norm);
    if (!m) continue;
    let h = 0, min = 0;
    let suffix;
    let period;
    if (i === 0) {
      h = +m[1];
      min = m[2] ? +m[2] : 0;
      suffix = m[3];
      period = m[4];
    } else if (i === 1) {
      h = +m[1];
      min = +m[2];
      suffix = m[3];
    } else {
      h = +m[1];
      suffix = m[2];
    }
    if (suffix === "pm" && h < 12) h += 12;
    if (suffix === "am" && h === 12) h = 0;
    if ((period === "tarde" || period === "noche") && h < 12) h += 12;
    if (h <= 23 && min <= 59) {
      dueTime = `${pad(h)}:${pad(min)}`;
      text = cut(text, m.index, m.index + m[0].length);
    }
    break;
  }
  const dayWords = [
    [/\bpasado\s+manana\b/, 2, null],
    [/\bmanana\b/, 1, null],
    [/\bhoy\b/, 0, null],
    [/\besta\s+noche\b/, 0, "21:00"],
    [/\besta\s+tarde\b/, 0, "17:00"]
  ];
  for (const [re, offset, defTime] of dayWords) {
    const norm = normalize(text);
    const m = re.exec(norm);
    if (m) {
      dueDate = addDaysISO(ctx.today, offset);
      if (defTime && !dueTime) dueTime = defTime;
      text = cut(text, m.index, m.index + m[0].length);
      break;
    }
  }
  if (!dueDate) {
    const norm = normalize(text);
    const m = /\b(?:el\s+|este\s+|el\s+proximo\s+|proximo\s+)?(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/.exec(norm);
    if (m) {
      const target = WEEKDAYS[m[1]];
      let diff = (target - weekdayISO(ctx.today) + 7) % 7;
      if (diff === 0) diff = 7;
      dueDate = addDaysISO(ctx.today, diff);
      text = cut(text, m.index, m.index + m[0].length);
    }
  }
  if (!dueDate) {
    const norm = normalize(text);
    const m = /\s(?:el\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=\s)/.exec(norm);
    if (m) {
      const [ty] = ctx.today.split("-").map(Number);
      let year = m[3] ? +m[3] : ty;
      if (year < 100) year += 2e3;
      let iso = `${year}-${pad(+m[2])}-${pad(+m[1])}`;
      if (!m[3] && iso < ctx.today) iso = `${year + 1}-${pad(+m[2])}-${pad(+m[1])}`;
      dueDate = iso;
      text = cut(text, m.index, m.index + m[0].length);
    }
  }
  if (!dueDate) {
    const norm = normalize(text);
    const m = /\ben\s+(\d{1,2})\s+dias?\b/.exec(norm);
    if (m) {
      dueDate = addDaysISO(ctx.today, +m[1]);
      text = cut(text, m.index, m.index + m[0].length);
    }
  }
  if (dueTime && !dueDate) {
    dueDate = dueTime > ctx.now ? ctx.today : addDaysISO(ctx.today, 1);
  }
  let title = text.replace(/\s{2,}/g, " ").trim();
  title = title.replace(/\s+(y|el|la|a|para|de)$/i, "").trim();
  title = title.charAt(0).toUpperCase() + title.slice(1);
  if (!title) title = input.trim();
  return { title, dueDate, dueTime, priority, category };
}
function classifyCapture(text, ctx) {
  const t = text.trim();
  const n = normalize(t);
  if (/^https?:\/\/\S+$/i.test(t) || /^www\.\S+$/i.test(t)) return { type: "link", category: null, title: null };
  if (/(recordame|recuerdame|recordar |no olvidar|no te olvides|avisame)/.test(n)) return { type: "reminder", category: null, title: null };
  if (/(\bidea\b|se me ocurrio|\by si\b|podria hacer|estaria bueno|\bproyecto\b|app para|concepto)/.test(n)) {
    const category = /(app|aplicacion|proyecto|negocio|startup)/.test(n) ? "Proyectos" : null;
    return { type: "idea", category, title: null };
  }
  if (/(hoy me senti|hoy fue|me siento|estoy cansad|estoy content|fue un dia|hoy estuve|hoy fui|hoy aprendi)/.test(n)) {
    return { type: "journal", category: null, title: null };
  }
  const verbs = [
    "comprar",
    "llamar",
    "enviar",
    "mandar",
    "pagar",
    "terminar",
    "revisar",
    "hacer",
    "escribir",
    "preparar",
    "reservar",
    "buscar",
    "responder",
    "contestar",
    "agendar",
    "limpiar",
    "arreglar",
    "entregar",
    "leer",
    "estudiar",
    "sacar",
    "renovar"
  ];
  const first = n.split(/\s+/)[0] ?? "";
  const parsed = parseTask(t, ctx);
  if (verbs.includes(first) || parsed.dueDate || /^(tengo que|hay que|debo)\b/.test(n)) {
    return { type: "task", category: parsed.category, title: parsed.title };
  }
  if (t.length > 280) return { type: "journal", category: null, title: null };
  return { type: "note", category: null, title: null };
}

// supabase/functions/capture/index.ts
var SUPABASE_URL = Deno.env.get("SUPABASE_URL");
var SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
var admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
var cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};
var reply = (body, status = 200) => new Response(typeof body === "string" ? body : JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json" }
});
async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}
var esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
var toHtml = (t) => t.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
async function auth(req) {
  const url = new URL(req.url);
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim() || url.searchParams.get("token") || "";
  if (!token.startsWith("pos_")) return null;
  const { data } = await admin.from("pos_tokens").select("id,user_id,timezone").eq("token_hash", await sha256(token)).maybeSingle();
  if (!data) return null;
  await admin.from("pos_tokens").update({ last_used_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", data.id);
  return data;
}
async function put(userId, record) {
  const { error } = await admin.from("pos_items").upsert({
    id: record.id,
    user_id: userId,
    kind: record.kind,
    payload: record,
    updated_at: record.updatedAt,
    deleted_at: null
  });
  if (error) throw error;
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const who = await auth(req);
  if (!who) return reply({ error: "Token inv\xE1lido. Gener\xE1 uno en Personal OS \u2192 M\xE1s \u2192 Atajos." }, 401);
  const ctx = localNow(who.timezone);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const base = () => ({ id: crypto.randomUUID(), createdAt: now, updatedAt: now, deletedAt: null });
  if (req.method === "GET") {
    const { data } = await admin.from("pos_items").select("kind,payload").eq("user_id", who.user_id).is("deleted_at", null).in("kind", ["task", "reminder"]);
    const rows = data ?? [];
    const tasks = rows.filter((r) => r.kind === "task" && !r.payload.isDone && r.payload.dueDate && String(r.payload.dueDate) <= ctx.today);
    const rems = rows.filter((r) => r.kind === "reminder" && !r.payload.isDone && r.payload.date === ctx.today);
    const lines = [`Hoy: ${tasks.length} tareas, ${rems.length} recordatorios.`];
    tasks.slice(0, 8).forEach((t) => lines.push(`\u2022 ${t.payload.title}${t.payload.dueTime ? ` (${t.payload.dueTime})` : ""}`));
    rems.slice(0, 5).forEach((r) => lines.push(`\u23F0 ${r.payload.time} ${r.payload.title}`));
    return reply(lines.join("\n"));
  }
  if (req.method !== "POST") return reply({ error: "M\xE9todo no permitido" }, 405);
  let body;
  const ct = req.headers.get("content-type") ?? "";
  try {
    body = ct.includes("application/json") ? await req.json() : { text: await req.text() };
  } catch {
    return reply({ error: "Cuerpo inv\xE1lido" }, 400);
  }
  const text = (body.text ?? "").trim().slice(0, 2e4);
  if (!text) return reply({ error: "Texto vac\xEDo" }, 400);
  const guess = classifyCapture(text, ctx);
  const type = body.type && body.type !== "auto" ? body.type : guess.type;
  try {
    if (type === "task") {
      const p = parseTask(text, ctx);
      await put(who.user_id, {
        ...base(),
        kind: "task",
        title: body.title || p.title,
        notes: "",
        isDone: false,
        completedAt: null,
        dueDate: p.dueDate,
        dueTime: p.dueTime,
        priority: p.priority,
        repeat: "never",
        category: p.category,
        subtasks: [],
        sourceId: null
      });
      return reply(`Tarea creada: ${body.title || p.title}${p.dueDate ? ` (${p.dueDate}${p.dueTime ? " " + p.dueTime : ""})` : ""}`);
    }
    if (type === "reminder") {
      const cleaned = text.replace(/^(recordame|recuerdame|recordarme|avisame)\s+(que\s+)?/i, "");
      const p = parseTask(cleaned, ctx);
      const hour = String((Number(ctx.now.slice(0, 2)) + 1) % 24).padStart(2, "0");
      const date = p.dueDate ?? ctx.today;
      const time = p.dueTime ?? (p.dueDate ? "09:00" : `${hour}:00`);
      await put(who.user_id, {
        ...base(),
        kind: "reminder",
        title: body.title || p.title,
        notes: "",
        date,
        time,
        repeat: "never",
        priority: p.priority,
        category: p.category,
        isDone: false,
        completedAt: null
      });
      return reply(`Recordatorio: ${body.title || p.title} \u2014 ${date} ${time}`);
    }
    if (type === "journal") {
      const { data } = await admin.from("pos_items").select("payload").eq("user_id", who.user_id).eq("kind", "journal").is("deleted_at", null).eq("payload->>entryDate", ctx.today).limit(1);
      const existing = data?.[0]?.payload;
      if (existing) {
        await put(who.user_id, { ...existing, content: `${existing.content ?? ""}<hr>${toHtml(text)}`, updatedAt: now });
      } else {
        await put(who.user_id, { ...base(), kind: "journal", title: body.title ?? null, content: toHtml(text), entryDate: ctx.today, tags: [], isFavorite: false, paper: null });
      }
      return reply("Agregado al journal de hoy");
    }
    const noteType = type === "idea" ? "idea" : type === "link" ? "link" : "note";
    const first = text.split("\n")[0];
    let title = body.title || (first.length <= 60 ? first : first.slice(0, 57) + "\u2026");
    if (noteType === "link") {
      try {
        title = body.title || new URL(text.startsWith("http") ? text : `https://${text}`).hostname;
      } catch {
      }
    }
    await put(who.user_id, {
      ...base(),
      kind: "note",
      title,
      content: noteType === "link" ? "" : toHtml(text),
      noteType,
      url: noteType === "link" ? text : null,
      folderId: null,
      category: guess.category,
      tags: [],
      isFavorite: false,
      isPinned: false,
      isArchived: false,
      linkedIds: [],
      paper: null
    });
    return reply(noteType === "idea" ? "Idea guardada" : noteType === "link" ? "Enlace guardado" : "Nota guardada");
  } catch (e) {
    console.error(e);
    return reply({ error: "No se pudo guardar" }, 500);
  }
});
