// =====================================================================
// Personal OS — Edge Function "capture"  (entrada desde la app Atajos)
//
// Autenticación: token personal "pos_…" (se crea en la app: Más → Atajos).
//   Header:  Authorization: Bearer pos_xxx     (o ?token=pos_xxx)
// Verify JWT: DESACTIVADO para esta función (usa su propio token).
//
// POST  JSON {"text":"llamar al contador mañana a las 15", "type":"auto|task|note|idea|reminder|journal|link"}
//       → crea el registro; aparece en la app al sincronizar.
// GET   → resumen de hoy en texto (para que Atajos lo lea o lo muestre).
// =====================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { classifyCapture, localNow, parseTask, type CaptureType } from "../_shared/parser.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const reply = (body: unknown, status = 200) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json" },
  });

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const toHtml = (t: string) => t.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");

async function auth(req: Request) {
  const url = new URL(req.url);
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim() || url.searchParams.get("token") || "";
  if (!token.startsWith("pos_")) return null;
  const { data } = await admin.from("pos_tokens").select("id,user_id,timezone").eq("token_hash", await sha256(token)).maybeSingle();
  if (!data) return null;
  await admin.from("pos_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return data as { id: string; user_id: string; timezone: string };
}

async function put(userId: string, record: Record<string, unknown>) {
  const { error } = await admin.from("pos_items").upsert({
    id: record.id,
    user_id: userId,
    kind: record.kind,
    payload: record,
    updated_at: record.updatedAt,
    deleted_at: null,
  });
  if (error) throw error;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const who = await auth(req);
  if (!who) return reply({ error: "Token inválido. Generá uno en Personal OS → Más → Atajos." }, 401);
  const ctx = localNow(who.timezone);
  const now = new Date().toISOString();
  const base = () => ({ id: crypto.randomUUID(), createdAt: now, updatedAt: now, deletedAt: null });

  if (req.method === "GET") {
    const { data } = await admin.from("pos_items").select("kind,payload").eq("user_id", who.user_id).is("deleted_at", null).in("kind", ["task", "reminder"]);
    const rows = (data ?? []) as { kind: string; payload: Record<string, unknown> }[];
    const tasks = rows.filter((r) => r.kind === "task" && !r.payload.isDone && r.payload.dueDate && String(r.payload.dueDate) <= ctx.today);
    const rems = rows.filter((r) => r.kind === "reminder" && !r.payload.isDone && r.payload.date === ctx.today);
    const lines = [`Hoy: ${tasks.length} tareas, ${rems.length} recordatorios.`];
    tasks.slice(0, 8).forEach((t) => lines.push(`• ${t.payload.title}${t.payload.dueTime ? ` (${t.payload.dueTime})` : ""}`));
    rems.slice(0, 5).forEach((r) => lines.push(`⏰ ${r.payload.time} ${r.payload.title}`));
    return reply(lines.join("\n"));
  }

  if (req.method !== "POST") return reply({ error: "Método no permitido" }, 405);

  let body: { text?: string; type?: string; title?: string };
  const ct = req.headers.get("content-type") ?? "";
  try {
    body = ct.includes("application/json") ? await req.json() : { text: await req.text() };
  } catch {
    return reply({ error: "Cuerpo inválido" }, 400);
  }
  const text = (body.text ?? "").trim().slice(0, 20_000);
  if (!text) return reply({ error: "Texto vacío" }, 400);

  const guess = classifyCapture(text, ctx);
  const type = (body.type && body.type !== "auto" ? body.type : guess.type) as CaptureType;

  try {
    if (type === "task") {
      const p = parseTask(text, ctx);
      await put(who.user_id, {
        ...base(), kind: "task", title: body.title || p.title, notes: "", isDone: false, completedAt: null, dueDate: p.dueDate,
        dueTime: p.dueTime, priority: p.priority, repeat: "never", category: p.category, subtasks: [], sourceId: null,
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
        ...base(), kind: "reminder", title: body.title || p.title, notes: "", date, time, repeat: "never",
        priority: p.priority, category: p.category, isDone: false, completedAt: null,
      });
      return reply(`Recordatorio: ${body.title || p.title} — ${date} ${time}`);
    }
    if (type === "journal") {
      const { data } = await admin.from("pos_items").select("payload").eq("user_id", who.user_id).eq("kind", "journal").is("deleted_at", null)
        .eq("payload->>entryDate", ctx.today).limit(1);
      const existing = data?.[0]?.payload as Record<string, unknown> | undefined;
      if (existing) {
        await put(who.user_id, { ...existing, content: `${existing.content ?? ""}<hr>${toHtml(text)}`, updatedAt: now });
      } else {
        await put(who.user_id, { ...base(), kind: "journal", title: body.title ?? null, content: toHtml(text), entryDate: ctx.today, tags: [], isFavorite: false, paper: null });
      }
      return reply("Agregado al journal de hoy");
    }
    const noteType = type === "idea" ? "idea" : type === "link" ? "link" : "note";
    const first = text.split("\n")[0];
    let title = body.title || (first.length <= 60 ? first : first.slice(0, 57) + "…");
    if (noteType === "link") {
      try {
        title = body.title || new URL(text.startsWith("http") ? text : `https://${text}`).hostname;
      } catch { /* título = texto */ }
    }
    await put(who.user_id, {
      ...base(), kind: "note", title, content: noteType === "link" ? "" : toHtml(text), noteType, url: noteType === "link" ? text : null,
      folderId: null, category: guess.category, tags: [], isFavorite: false, isPinned: false, isArchived: false, linkedIds: [], paper: null,
    });
    return reply(noteType === "idea" ? "Idea guardada" : noteType === "link" ? "Enlace guardado" : "Nota guardada");
  } catch (e) {
    console.error(e);
    return reply({ error: "No se pudo guardar" }, 500);
  }
});
