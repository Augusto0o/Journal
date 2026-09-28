// =====================================================================
// Personal OS — Edge Function "capture"  (entrada desde la app Atajos)
//
// Autenticación: token personal "pos_…" (se crea en la app: Ajustes → Atajos de iOS).
//   Header:  Authorization: Bearer pos_xxx     (o ?token=pos_xxx)
// Verify JWT: DESACTIVADO para esta función (usa su propio token).
//
// POST  JSON {"text":"llamar al contador mañana a las 15", "type":"auto|task|note|idea|reminder|journal|link|video|music"}
//       → crea el registro; aparece en la app al sincronizar.
//       Un enlace de YouTube va a Biblioteca → Para ver; uno de YouTube Music, a Para escuchar
//       (con título, canal y miniatura). Sirve para la hoja de Compartir de iOS.
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

// ---------------- YouTube / YouTube Music ----------------

/** Agrega el video a la lista de YouTube Music elegida en la app (si está conectada y con «agregar solo»). */
async function addToMyPlaylist(userId: string, videoId: string, explicit?: { id: string; title: string }): Promise<string | null> {
  const id = Deno.env.get("GOOGLE_CLIENT_ID");
  const secret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!id || !secret) return null;
  try {
    const { data } = await admin.from("pos_google").select("refresh_token,playlist_id,playlist_title,auto").eq("user_id", userId).maybeSingle();
    if (!data?.refresh_token) return null;
    if (!explicit && (!data.playlist_id || !data.auto)) return null;
    const playlistId = explicit?.id ?? data.playlist_id;
    const t = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: data.refresh_token, grant_type: "refresh_token" }),
    }).then((r) => r.json());
    if (!t.access_token) return null;
    const r = await fetch("https://www.googleapis.com/youtube/v3/playlistItems?part=snippet", {
      method: "POST",
      headers: { Authorization: `Bearer ${t.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ snippet: { playlistId, resourceId: { kind: "youtube#video", videoId } } }),
    });
    await r.body?.cancel();
    return r.ok ? (explicit?.title ?? data.playlist_title ?? "tu lista") : null;
  } catch (e) {
    console.error("youtube", e);
    return null;
  }
}

// ---------------- Listas de la Biblioteca ----------------

interface MediaListRow { id: string; name: string; ytPlaylistId?: string | null; ytPlaylistTitle?: string | null }

async function mediaLists(userId: string): Promise<MediaListRow[]> {
  const { data } = await admin.from("pos_items").select("payload").eq("user_id", userId).eq("kind", "folder").is("deleted_at", null).eq("payload->>scope", "media");
  return ((data ?? []) as { payload: MediaListRow }[]).map((r) => r.payload).sort((a, b) => a.name.localeCompare(b.name, "es"));
}

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Busca la lista por nombre; si no existe, la crea. */
async function listFor(userId: string, name: string): Promise<MediaListRow> {
  const lists = await mediaLists(userId);
  const found = lists.find((l) => norm(l.name) === norm(name));
  if (found) return found;
  const now = new Date().toISOString();
  const rec = { id: crypto.randomUUID(), createdAt: now, updatedAt: now, deletedAt: null, kind: "folder", scope: "media", name: name.trim().slice(0, 60) };
  await put(userId, rec);
  return rec;
}

/** Título, autor y miniatura de un enlace que no es de YouTube (Instagram, TikTok, cualquier web). */
async function linkMeta(url: string): Promise<{ title: string; author: string; thumb: string | null; site: string }> {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    /* sin host */
  }
  const site = /instagram\.com/.test(host) ? "Instagram" : /tiktok\.com/.test(host) ? "TikTok" : /x\.com|twitter\.com/.test(host) ? "X" : host;
  if (site === "TikTok") {
    try {
      const j = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`).then((r) => r.json());
      if (j.title !== undefined) return { title: j.title || "Video de TikTok", author: j.author_name ?? "", thumb: j.thumbnail_url ?? null, site };
    } catch {
      /* sigue */
    }
  }
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 7000);
    const html = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", "Accept-Language": "es-AR,es;q=0.9" } }).then((r) => r.text());
    clearTimeout(t);
    const og = (p: string) => html.match(new RegExp(`<meta[^>]+property=["']og:${p}["'][^>]+content=["']([^"']*)`, "i"))?.[1] ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:${p}["']`, "i"))?.[1] ?? "";
    const dec = (x: string) => x.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;|&#39;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
    let title = dec(og("title") || html.match(/<title[^>]*>([^<]*)/i)?.[1] || "").trim();
    let author = "";
    // Instagram: «Usuario on Instagram: "texto"» → autor y texto por separado.
    const ig = title.match(/^(.+?) (?:on|en) Instagram: ["“]?([\s\S]*?)["”]?$/);
    if (ig) {
      author = ig[1];
      title = ig[2] || `Reel de ${ig[1]}`;
    }
    if (title.length > 140) title = title.slice(0, 137) + "…";
    return { title: title || (site === "Instagram" ? "Reel de Instagram" : site), author, thumb: dec(og("image")) || null, site };
  } catch {
    return { title: site === "Instagram" ? "Reel de Instagram" : site || "Enlace", author: "", thumb: null, site };
  }
}

function findUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>"]+/i);
  return m ? m[0].replace(/[).,;]+$/, "") : null;
}

function youtubeInfo(raw: string): { videoId: string | null; listId: string | null; music: boolean } | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  if (!["youtube.com", "youtu.be", "music.youtube.com"].includes(host)) return null;
  let videoId = u.searchParams.get("v");
  if (!videoId && host === "youtu.be") videoId = u.pathname.slice(1).split("/")[0] || null;
  if (!videoId) videoId = u.pathname.match(/\/(shorts|embed|live)\/([\w-]{6,})/)?.[2] ?? null;
  return { videoId, listId: u.searchParams.get("list"), music: host === "music.youtube.com" };
}

async function oembed(url: string): Promise<{ title: string; author: string; thumb: string | null }> {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`);
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    return { title: j.title ?? "", author: (j.author_name ?? "").replace(/\s*-\s*Topic$/i, ""), thumb: j.thumbnail_url ?? null };
  } catch {
    return { title: "", author: "", thumb: null };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const who = await auth(req);
  if (!who) return reply({ error: "Token inválido. Generá uno en Personal OS → Ajustes → Atajos de iOS." }, 401);
  const ctx = localNow(who.timezone);
  const now = new Date().toISOString();
  const base = () => ({ id: crypto.randomUUID(), createdAt: now, updatedAt: now, deletedAt: null });

  if (req.method === "GET" && new URL(req.url).searchParams.has("listas")) {
    // Para el atajo «Guardar en lista»: un nombre por línea (Atajos lo convierte en menú).
    const lists = await mediaLists(who.user_id);
    return reply(lists.length ? lists.map((l) => l.name).join("\n") : "Ver más tarde");
  }

  if (req.method === "GET") {
    const { data } = await admin.from("pos_items").select("kind,payload").eq("user_id", who.user_id).is("deleted_at", null).in("kind", ["task", "reminder"]);
    const rows = (data ?? []) as { kind: string; payload: Record<string, unknown> }[];
    const tasks = rows.filter((r) => r.kind === "task" && !r.payload.isDone && r.payload.dueDate && String(r.payload.dueDate) <= ctx.today);
    const lines = [`Hoy: ${tasks.length} ${tasks.length === 1 ? "tarea" : "tareas"}.`];
    tasks.slice(0, 10).forEach((t) => lines.push(`${t.payload.alarm ? "⏰" : "•"} ${t.payload.title}${t.payload.dueTime ? ` (${t.payload.dueTime})` : ""}`));
    return reply(lines.join("\n"));
  }

  if (req.method !== "POST") return reply({ error: "Método no permitido" }, 405);

  let body: { text?: string; type?: string; title?: string; url?: string; list?: string };
  const ct = req.headers.get("content-type") ?? "";
  try {
    body = ct.includes("application/json") ? await req.json() : { text: await req.text() };
  } catch {
    return reply({ error: "Cuerpo inválido" }, 400);
  }
  const text = (body.text ?? body.url ?? "").trim().slice(0, 20_000);
  if (!text) return reply({ error: "Texto vacío" }, 400);

  // Enlaces de YouTube y YouTube Music → Biblioteca.
  const link = body.url?.trim() || findUrl(text);
  const yt = link ? youtubeInfo(link) : null;
  const listName = (body.list ?? "").trim();

  // Guardar en una lista (atajo «Guardar en lista»): cualquier enlace — YouTube, reels, TikTok, webs.
  if (listName && link) {
    try {
      const list = await listFor(who.user_id, listName);
      const notes = text === link ? "" : text.replace(link, "").trim();
      let rec: Record<string, unknown>;
      let label: string;
      if (yt) {
        const canonical = yt.videoId ? `https://www.youtube.com/watch?v=${yt.videoId}` : yt.listId ? `https://www.youtube.com/playlist?list=${yt.listId}` : link;
        const meta = await oembed(canonical);
        label = body.title || meta.title || "Video de YouTube";
        rec = {
          ...base(), kind: "media", mediaType: yt.music ? "music" : "video", title: label, creator: meta.author, url: link,
          cover: meta.thumb ?? (yt.videoId ? `https://i.ytimg.com/vi/${yt.videoId}/hqdefault.jpg` : null), genre: null,
          category: yt.music ? "Canción" : "Ver más tarde", status: "later", progress: 0, notes, plays: 0, listId: list.id,
          meta: { ...(yt.videoId ? { videoId: yt.videoId } : {}), ...(yt.listId ? { listId: yt.listId } : {}), source: "share" },
        };
      } else {
        const meta = await linkMeta(link);
        label = body.title || meta.title;
        rec = {
          ...base(), kind: "media", mediaType: "video", title: label, creator: meta.author, url: link, cover: meta.thumb, genre: null,
          category: "Ver más tarde", status: "later", progress: 0, notes, plays: 0, listId: list.id, meta: { source: "share", site: meta.site },
        };
      }
      await put(who.user_id, rec);
      const added = yt?.videoId && list.ytPlaylistId ? await addToMyPlaylist(who.user_id, yt.videoId, { id: list.ytPlaylistId, title: list.ytPlaylistTitle ?? list.name }) : null;
      return reply(`En «${list.name}»: ${label}${added ? ` · también en la playlist «${added}»` : ""}`);
    } catch (e) {
      console.error(e);
      return reply({ error: "No se pudo guardar" }, 500);
    }
  }

  if (yt && (!body.type || ["auto", "link", "video", "music"].includes(body.type))) {
    const music = body.type === "music" || (body.type !== "video" && yt.music);
    // oEmbed no reconoce music.youtube.com: se consulta la versión de youtube.com.
    const canonical = yt.videoId
      ? `https://www.youtube.com/watch?v=${yt.videoId}`
      : yt.listId ? `https://www.youtube.com/playlist?list=${yt.listId}` : link!;
    const meta = await oembed(canonical);
    const title = body.title || meta.title || (music ? "Canción de YouTube Music" : "Video de YouTube");
    try {
      await put(who.user_id, {
        ...base(), kind: "media", mediaType: music ? "music" : "video", title, creator: meta.author,
        url: link, cover: meta.thumb ?? (yt.videoId ? `https://i.ytimg.com/vi/${yt.videoId}/hqdefault.jpg` : null),
        genre: null, category: music ? (yt.videoId ? "Canción" : "Playlist") : "Ver más tarde", status: "later",
        progress: 0, notes: text === link ? "" : text.replace(link!, "").trim(), plays: 0,
        meta: { ...(yt.videoId ? { videoId: yt.videoId } : {}), ...(yt.listId ? { listId: yt.listId } : {}), source: "share" },
      });
      // Si conectaste YouTube Music, la canción también va a tu lista elegida.
      const added = music && yt.videoId ? await addToMyPlaylist(who.user_id, yt.videoId) : null;
      return reply(`${music ? "Para escuchar" : "Para ver"}: ${title}${meta.author ? ` — ${meta.author}` : ""}${added ? ` · agregada a «${added}»` : ""}`);
    } catch (e) {
      console.error(e);
      return reply({ error: "No se pudo guardar" }, 500);
    }
  }

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
      // Los recordatorios son tareas con alarma (la app las agenda en iOS).
      const cleaned = text.replace(/^(recordame|recuerdame|recordarme|avisame)\s+(que\s+)?/i, "");
      const p = parseTask(cleaned, ctx);
      const hour = String((Number(ctx.now.slice(0, 2)) + 1) % 24).padStart(2, "0");
      const date = p.dueDate ?? ctx.today;
      const time = p.dueTime ?? (p.dueDate ? "09:00" : `${hour}:00`);
      await put(who.user_id, {
        ...base(), kind: "task", title: body.title || p.title, notes: "", isDone: false, completedAt: null, dueDate: date,
        dueTime: time, priority: p.priority, repeat: "never", category: p.category, subtasks: [], sourceId: null, alarm: true,
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
