// =====================================================================
// Personal OS — Edge Function "push"  (avisos aunque la app esté cerrada)
//
// Verify JWT: DESACTIVADO (valida la sesión del usuario por su cuenta).
// Secretos: VAPID_JWK (clave privada EC P-256 en JSON), CRON_SECRET, VAPID_SUBJECT (opcional).
//
// POST {action:"key"}                               → clave pública VAPID
// POST {action:"subscribe", subscription, timezone} → guarda la suscripción   (sesión del usuario)
// POST {action:"unsubscribe", endpoint}                                        (sesión del usuario)
// POST {action:"test"}                              → manda un aviso de prueba  (sesión del usuario)
// POST {action:"schedule", at, title, body, url, tag} → programa un aviso      (sesión del usuario)
// POST {action:"cancel", tag}                       → cancela avisos programados (sesión del usuario)
// POST {action:"tick"} + header x-cron-secret       → lo llama pg_cron cada minuto:
//      tareas con hora que vencen ahora + avisos programados.
// =====================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { sendPush, vapidPublic, type Sub, type Vapid } from "./webpush.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const vapid = (): Vapid | null => {
  try {
    return { jwk: JSON.parse(Deno.env.get("VAPID_JWK") ?? ""), subject: Deno.env.get("VAPID_SUBJECT") ?? SUPABASE_URL };
  } catch {
    return null;
  }
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

function localNow(timeZone: string, date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
    return { today: `${get("year")}-${get("month")}-${get("day")}`, now: `${get("hour") === "24" ? "00" : get("hour")}:${get("minute")}` };
  } catch {
    return { today: date.toISOString().slice(0, 10), now: date.toISOString().slice(11, 16) };
  }
}
const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

async function userOf(req: Request) {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data } = await admin.auth.getUser(jwt);
  return data.user?.id ?? null;
}

type Row = Sub & { user_id: string; timezone: string };

async function deliver(subs: Row[], payload: Record<string, unknown>, v: Vapid) {
  let ok = 0;
  for (const s of subs) {
    try {
      const status = await sendPush(s, payload, v);
      if (status === 404 || status === 410) await admin.from("pos_push").delete().eq("endpoint", s.endpoint);
      else if (status < 300) ok++;
      else console.warn("push", status, new URL(s.endpoint).host);
    } catch (e) {
      console.error("push error", e);
    }
  }
  return ok;
}

async function tick(v: Vapid) {
  const { data: subs } = await admin.from("pos_push").select("endpoint,p256dh,auth,user_id,timezone");
  const byUser = new Map<string, Row[]>();
  for (const s of (subs ?? []) as Row[]) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
  let sent = 0;

  for (const [userId, list] of byUser) {
    const { today, now } = localNow(list[0].timezone || "UTC");
    const nowM = minutes(now);
    // Tareas con hora (y los recordatorios con alarma) que vencen en los últimos minutos.
    const { data: tasks } = await admin.from("pos_items").select("id,payload").eq("user_id", userId).eq("kind", "task").is("deleted_at", null).eq("payload->>dueDate", today);
    for (const t of (tasks ?? []) as { id: string; payload: Record<string, unknown> }[]) {
      const p = t.payload;
      const time = typeof p.dueTime === "string" ? p.dueTime : null;
      if (p.isDone || !time || !/^\d{2}:\d{2}/.test(time)) continue;
      const diff = nowM - minutes(time);
      if (diff < 0 || diff > 10) continue;
      const { data: fresh } = await admin.from("pos_push_sent").upsert({ item_id: t.id, key: `${today} ${time}` }, { onConflict: "item_id,key", ignoreDuplicates: true }).select();
      if (!fresh?.length) continue;
      sent += await deliver(list, { title: String(p.title ?? "Tarea"), body: p.alarm ? `⏰ ${time}` : `Para las ${time}`, url: "/", tag: `task-${t.id}` }, v);
    }
    // Avisos programados desde la app (fin de un Pomodoro, etc.).
    const { data: due } = await admin.from("pos_push_queue").select("*").eq("user_id", userId).is("sent_at", null).lte("send_at", new Date().toISOString());
    for (const q of (due ?? []) as { id: string; title: string; body: string; url: string; tag: string | null; send_at: string }[]) {
      await admin.from("pos_push_queue").update({ sent_at: new Date().toISOString() }).eq("id", q.id);
      if (Date.now() - new Date(q.send_at).getTime() > 30 * 60_000) continue; // demasiado viejo
      sent += await deliver(list, { title: q.title, body: q.body, url: q.url || "/", tag: q.tag ?? undefined }, v);
    }
  }
  // Limpieza
  await admin.from("pos_push_queue").delete().lt("send_at", new Date(Date.now() - 2 * 86400_000).toISOString());
  await admin.from("pos_push_sent").delete().lt("created_at", new Date(Date.now() - 3 * 86400_000).toISOString());
  return sent;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  const v = vapid();
  if (!v) return json({ error: "Falta el secreto VAPID_JWK en Supabase." }, 503);
  let p: Record<string, unknown> = {};
  try {
    p = await req.json();
  } catch {
    /* cuerpo vacío */
  }

  if (p.action === "key") return json({ key: vapidPublic(v.jwk) });

  if (p.action === "tick") {
    if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ error: "No autorizado" }, 401);
    return json({ sent: await tick(v) });
  }

  const userId = await userOf(req);
  if (!userId) return json({ error: "Iniciá sesión en Personal OS para activar los avisos." }, 401);

  if (p.action === "subscribe") {
    const s = p.subscription as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | undefined;
    if (!s?.endpoint || !s.keys?.p256dh || !s.keys?.auth) return json({ error: "Suscripción inválida" }, 400);
    const { error } = await admin.from("pos_push").upsert({ endpoint: s.endpoint, user_id: userId, p256dh: s.keys.p256dh, auth: s.keys.auth, timezone: String(p.timezone ?? "UTC") }, { onConflict: "endpoint" });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  if (p.action === "unsubscribe") {
    await admin.from("pos_push").delete().eq("user_id", userId).eq("endpoint", String(p.endpoint ?? ""));
    return json({ ok: true });
  }

  if (p.action === "test") {
    const { data } = await admin.from("pos_push").select("endpoint,p256dh,auth,user_id,timezone").eq("user_id", userId);
    const n = await deliver((data ?? []) as Row[], { title: "Personal OS", body: "Los avisos funcionan, aunque la app esté cerrada.", url: "/ajustes" }, v);
    return json({ sent: n });
  }

  if (p.action === "schedule") {
    const at = new Date(String(p.at ?? ""));
    if (isNaN(at.getTime())) return json({ error: "Fecha inválida" }, 400);
    if (p.tag) await admin.from("pos_push_queue").delete().eq("user_id", userId).eq("tag", String(p.tag)).is("sent_at", null);
    const { error } = await admin.from("pos_push_queue").insert({ user_id: userId, send_at: at.toISOString(), title: String(p.title ?? "Personal OS").slice(0, 120), body: String(p.body ?? "").slice(0, 300), url: String(p.url ?? "/"), tag: p.tag ? String(p.tag) : null });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  if (p.action === "cancel") {
    await admin.from("pos_push_queue").delete().eq("user_id", userId).eq("tag", String(p.tag ?? "")).is("sent_at", null);
    return json({ ok: true });
  }

  return json({ error: "Acción desconocida" }, 400);
});
