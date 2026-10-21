import STATIC from "./static.js";

// Cloud backend for the Radar. Static UI is bundled with the Worker; profile data lives in D1.
// Writes are limited to city and follower range, plus the daily-search on/off switch.
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

async function readState(env) {
  const meta = await env.DB.prepare("SELECT key, value FROM meta").all();
  const state = Object.fromEntries(meta.results.map((row) => [row.key, JSON.parse(row.value)]));
  const rows = await env.DB.prepare("SELECT data FROM profiles WHERE city_id = ?")
    .bind(state.settings.cityId)
    .all();
  state.profiles = rows.results.map((row) => JSON.parse(row.data));
  return normalizeDailySearch(state);
}

function normalizeDailySearch(state) {
  const count = Number(state.daily_search_last_run_new);
  state.daily_search_enabled = state.daily_search_enabled === true;
  state.daily_search_last_run_at =
    typeof state.daily_search_last_run_at === "string" && state.daily_search_last_run_at
      ? state.daily_search_last_run_at
      : null;
  state.daily_search_last_run_new = Number.isFinite(count) ? count : 0;
  return state;
}

async function readDailySearch(env) {
  const rows = await env.DB.prepare(
    "SELECT key, value FROM meta WHERE key IN ('daily_search_enabled', 'daily_search_last_run_at', 'daily_search_last_run_new')",
  ).all();
  const stored = {};
  for (const row of rows.results) {
    try {
      stored[row.key] = JSON.parse(row.value);
    } catch {
      stored[row.key] = null;
    }
  }
  const view = normalizeDailySearch(stored);
  return {
    enabled: view.daily_search_enabled,
    lastRunAt: view.daily_search_last_run_at,
    lastRunNew: view.daily_search_last_run_new,
  };
}

async function writeMeta(env, key, value) {
  await env.DB.prepare(
    "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  )
    .bind(key, JSON.stringify(value))
    .run();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    if (pathname === "/api/state" && request.method === "GET") {
      return json(await readState(env));
    }
    if (pathname === "/api/settings" && request.method === "PUT") {
      const patch = await request.json().catch(() => ({}));
      const row = await env.DB.prepare("SELECT value FROM meta WHERE key = 'settings'").first();
      const settings = JSON.parse(row.value);
      if (typeof patch.cityId === "string" && !patch.catalog) settings.cityId = patch.cityId;
      for (const key of ["minFollowers", "maxFollowers"]) {
        if (Number.isFinite(patch[key])) settings[key] = patch[key];
      }
      await env.DB.prepare("UPDATE meta SET value = ? WHERE key = 'settings'")
        .bind(JSON.stringify(settings))
        .run();
      return json({ message: "ok" });
    }
    if (pathname === "/api/daily-search" && (request.method === "GET" || request.method === "POST")) {
      const current = await readDailySearch(env);
      if (request.method === "GET") return json(current);
      const enabled = !current.enabled;
      await writeMeta(env, "daily_search_enabled", enabled);
      return json({ ...current, enabled });
    }
    const avatar = pathname.match(/^\/api\/avatars\/([a-z0-9._]{1,30})$/);
    if (avatar) {
      const file = serveStatic(`/avatars/${avatar[1]}.jpg`);
      if (!file) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
      return new Response(file.body, {
        headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=300" },
      });
    }
    if (pathname.startsWith("/api/")) {
      return json(
        { message: "En la nube el Radar es de solo lectura. Búsquedas, importación e invitaciones van en el Mac." },
        403,
      );
    }
    return serveStatic(pathname) ?? serveStatic("/404.html", 404);
  },
};

function serveStatic(pathname, status = 200) {
  const key = pathname === "/" ? "/index.html" : STATIC[pathname] ? pathname : STATIC[`${pathname}.html`] ? `${pathname}.html` : null;
  if (!key) return null;
  const [type, b64] = STATIC[key];
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const immutable = key.startsWith("/_next/static/");
  return new Response(bytes, {
    status,
    headers: {
      "Content-Type": type,
      "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
