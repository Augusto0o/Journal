// =====================================================================
// Personal OS — Edge Function "youtube"  (agregar canciones a tu lista de YouTube Music)
//
// Verify JWT: DESACTIVADO (valida la sesión por su cuenta; /callback lo llama Google).
// Secretos: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (cliente OAuth «Aplicación web» de Google Cloud,
//           con la API «YouTube Data API v3» habilitada).
// URI de redirección autorizada en Google: https://<proyecto>.supabase.co/functions/v1/youtube/callback
//
// POST {action:"status"}                → {configured, connected, playlist}
// POST {action:"auth-url", returnTo}    → {url}  (abrir para autorizar con Google)
// POST {action:"playlists"}             → tus listas
// POST {action:"set-playlist", id, title, auto}
// POST {action:"add", videoId? | query?} → agrega a la lista elegida
// POST {action:"disconnect"}
// GET  /callback?code&state             → guarda la autorización y vuelve a la app
// =====================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const REDIRECT = `${SUPABASE_URL}/functions/v1/youtube/callback`;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

interface Link { user_id: string; refresh_token: string | null; playlist_id: string | null; playlist_title: string | null; auto: boolean; state: string | null; return_to: string | null }

async function accessToken(refresh: string) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: refresh, grant_type: "refresh_token" }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error === "invalid_grant" ? "La autorización de Google venció: volvé a conectar YouTube Music." : `Google: ${j.error_description ?? j.error}`);
  return j.access_token as string;
}

async function yt(token: string, path: string, init: RequestInit = {}) {
  const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`YouTube: ${j.error?.message ?? r.status}`);
  return j;
}

/** Busca la canción en YouTube (categoría Música) y devuelve el id del video. */
async function findSong(token: string, query: string) {
  const j = await yt(token, `search?part=snippet&type=video&videoCategoryId=10&maxResults=1&q=${encodeURIComponent(query)}`);
  return (j.items?.[0]?.id?.videoId as string | undefined) ?? null;
}

async function userOf(req: Request) {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data } = await admin.auth.getUser(jwt);
  return data.user?.id ?? null;
}

// Supabase sirve el HTML de las funciones como texto plano: se vuelve a la app con una redirección.
const page = (msg: string, to: string | null) =>
  to ? new Response(null, { status: 302, headers: { Location: to } }) : new Response(msg, { headers: { "Content-Type": "text/plain; charset=utf-8" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);

  if (req.method === "GET" && url.pathname.endsWith("/callback")) {
    const state = url.searchParams.get("state") ?? "";
    const { data } = await admin.from("pos_google").select("*").eq("state", state).maybeSingle();
    const link = data as Link | null;
    if (!link || !state) return page("El enlace venció. Volvé a intentarlo desde la app.", null);
    const back = link.return_to;
    if (url.searchParams.get("error")) return page("No se autorizó el acceso.", back);
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code: url.searchParams.get("code") ?? "", client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT, grant_type: "authorization_code" }),
    });
    const j = await r.json();
    if (!r.ok) return page(`Google rechazó el código (${j.error ?? r.status}).`, back);
    await admin.from("pos_google").update({ refresh_token: j.refresh_token ?? link.refresh_token, state: null, updated_at: new Date().toISOString() }).eq("user_id", link.user_id);
    return page("¡Listo! YouTube Music quedó conectado.", back);
  }

  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  const userId = await userOf(req);
  if (!userId) return json({ error: "Iniciá sesión en Personal OS." }, 401);
  let p: Record<string, unknown> = {};
  try {
    p = await req.json();
  } catch {
    /* vacío */
  }
  const { data } = await admin.from("pos_google").select("*").eq("user_id", userId).maybeSingle();
  const link = data as Link | null;
  const configured = Boolean(CLIENT_ID && CLIENT_SECRET);

  try {
    switch (p.action) {
      case "status":
        return json({ configured, connected: Boolean(link?.refresh_token), playlist: link?.playlist_id ? { id: link.playlist_id, title: link.playlist_title } : null, auto: link?.auto ?? true });

      case "auth-url": {
        if (!configured) return json({ error: "Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en los secretos de Supabase." }, 503);
        const state = crypto.randomUUID();
        const returnTo = String(p.returnTo ?? "");
        await admin.from("pos_google").upsert({ user_id: userId, state, return_to: /^https?:\/\//.test(returnTo) ? returnTo : null, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
        const q = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: REDIRECT, response_type: "code", scope: "https://www.googleapis.com/auth/youtube", access_type: "offline", prompt: "consent", include_granted_scopes: "true", state });
        return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` });
      }

      case "playlists": {
        if (!link?.refresh_token) return json({ error: "Conectá YouTube Music primero." }, 400);
        const token = await accessToken(link.refresh_token);
        const j = await yt(token, "playlists?part=snippet,contentDetails&mine=true&maxResults=50");
        return json({ items: (j.items ?? []).map((it: { id: string; snippet: { title: string; thumbnails?: { default?: { url: string } } }; contentDetails?: { itemCount?: number } }) => ({ id: it.id, title: it.snippet.title, count: it.contentDetails?.itemCount ?? 0, thumb: it.snippet.thumbnails?.default?.url ?? null })) });
      }

      case "set-playlist":
        await admin.from("pos_google").update({ playlist_id: p.id ? String(p.id) : null, playlist_title: p.title ? String(p.title) : null, ...(typeof p.auto === "boolean" ? { auto: p.auto } : {}) }).eq("user_id", userId);
        return json({ ok: true });

      case "add": {
        const target = p.playlistId ? String(p.playlistId) : link?.playlist_id;
        if (!link?.refresh_token || !target) return json({ error: "Elegí una lista de YouTube Music." }, 400);
        const token = await accessToken(link.refresh_token);
        const videoId = p.videoId ? String(p.videoId) : p.query ? await findSong(token, String(p.query)) : null;
        if (!videoId) return json({ error: "No encontré esa canción en YouTube." }, 404);
        await yt(token, "playlistItems?part=snippet", { method: "POST", body: JSON.stringify({ snippet: { playlistId: target, resourceId: { kind: "youtube#video", videoId } } }) });
        return json({ ok: true, videoId, playlist: p.playlistId ? String(p.playlistTitle ?? "tu lista") : link.playlist_title });
      }

      case "taste": {
        // Lo que escuchás en YouTube Music: canciones con «me gusta» y las de tus listas (1 unidad de cupo por pedido).
        if (!link?.refresh_token) return json({ items: [] });
        const token = await accessToken(link.refresh_token);
        const lists = await yt(token, "playlists?part=id&mine=true&maxResults=6").catch(() => ({ items: [] }));
        const ids = ["LL", ...(lists.items ?? []).map((l: { id: string }) => l.id)].slice(0, 5);
        const seen = new Set<string>();
        const items: { title: string; artist: string }[] = [];
        for (const id of ids) {
          const j = await yt(token, `playlistItems?part=snippet&maxResults=25&playlistId=${id}`).catch(() => ({ items: [] }));
          for (const it of j.items ?? []) {
            const title = String(it.snippet?.title ?? "");
            const artist = String(it.snippet?.videoOwnerChannelTitle ?? "").replace(/\s*-\s*Topic$/i, "");
            if (!title || /^(Private|Deleted) video$/i.test(title) || seen.has(title)) continue;
            seen.add(title);
            items.push({ title, artist });
          }
        }
        return json({ items: items.slice(0, 80) });
      }

      case "find": {
        // Un video por búsqueda (trailers, canciones sueltas). 100 unidades de cupo.
        if (!link?.refresh_token) return json({ error: "Conectá YouTube Music para buscar videos." }, 400);
        const token = await accessToken(link.refresh_token);
        const j = await yt(token, `search?part=snippet&type=video&maxResults=1&q=${encodeURIComponent(String(p.query ?? ""))}`);
        const it = j.items?.[0];
        return json({ videoId: it?.id?.videoId ?? null, title: it?.snippet?.title ?? null });
      }

      case "disconnect":
        if (link?.refresh_token) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(link.refresh_token)}`, { method: "POST" }).catch(() => undefined);
        await admin.from("pos_google").delete().eq("user_id", userId);
        return json({ ok: true });
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
  return json({ error: "Acción desconocida" }, 400);
});
