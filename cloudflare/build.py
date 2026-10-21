"""Build the Cloudflare bundle for the read-only cloud Radar.

Usage (from the repo root, after `curl -s http://127.0.0.1:3847/api/state > cloudflare/dist/state.json`
and a static export in `cloudflare/dist/site`, see docs/deploy-cloudflare.md):
    python3 cloudflare/build.py
Writes into cloudflare/dist/: seed-code.js (D1 load) and deploy-code.js (Worker upload),
both meant for the Cloudflare MCP `execute` tool. No credentials are read or written.
"""
import base64, json, os

DB_ID = "99b24b6d-cc75-4cb3-ae45-8ff9352e1702"
DIST = "cloudflare/dist"
# Meta keys for the cloud daily-search toggle and the last import.
# Values are JSON: false, null, and 0 until a run or a POST /api/daily-search changes them.
DAILY_SEARCH_DEFAULTS = {
    "daily_search_enabled": False,
    "daily_search_last_run_at": None,
    "daily_search_last_run_new": 0,
}
TYPES = {"html": "text/html; charset=utf-8", "js": "application/javascript", "css": "text/css",
         "txt": "text/plain; charset=utf-8", "svg": "image/svg+xml", "png": "image/png", "ico": "image/x-icon",
         "jpg": "image/jpeg", "woff2": "font/woff2", "webmanifest": "application/manifest+json"}


def q(s):
    return "'" + s.replace("'", "''") + "'"


def ensure_daily_search_keys(state):
    """Create the daily search meta keys when a Mac state dump does not already carry them."""
    for key, value in DAILY_SEARCH_DEFAULTS.items():
        state.setdefault(key, value)
    return state


def seed():
    state = json.load(open(f"{DIST}/state.json"))
    profiles = state.pop("profiles")
    state["drafts"] = []
    state["run"] = {**state["run"], "status": "idle", "message": "Versión en la nube: solo lectura."}
    ensure_daily_search_keys(state)
    sql = ["DROP TABLE IF EXISTS profiles;", "DROP TABLE IF EXISTS meta;",
           "CREATE TABLE profiles (username TEXT PRIMARY KEY, city_id TEXT NOT NULL, data TEXT NOT NULL);",
           "CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);"]
    sql += [f"INSERT INTO meta VALUES ({q(k)},{q(json.dumps(v, ensure_ascii=False))});" for k, v in state.items()]
    sql += [f"INSERT INTO profiles VALUES ({q(p['username'])},{q(p['cityId'])},{q(json.dumps(p, ensure_ascii=False))});"
            for p in profiles]
    path = f"/accounts/${{accountId}}/d1/database/{DB_ID}/query"
    code = ("async () => { const r = await cloudflare.request({method:'POST', path:`%s`, body:{sql: %s}});"
            " const c = await cloudflare.request({method:'POST', path:`%s`, body:{sql:'SELECT count(*) n FROM profiles'}});"
            " return {ok:r.success, profiles:c.result[0].results}; }") % (path, json.dumps("\n".join(sql)), path)
    open(f"{DIST}/seed-code.js", "w").write(code)
    return len(profiles)


def deploy():
    files = {}
    for root, _, names in os.walk(f"{DIST}/site"):
        for name in names:
            full = os.path.join(root, name)
            rel = "/" + os.path.relpath(full, f"{DIST}/site")
            files[rel] = [TYPES.get(name.rsplit(".", 1)[-1], "application/octet-stream"),
                          base64.b64encode(open(full, "rb").read()).decode()]
    worker = open("cloudflare/worker.js").read()
    static = "export default " + json.dumps(files) + ";\n"
    meta = {"main_module": "worker.js", "compatibility_date": "2026-10-01",
            "bindings": [{"type": "d1", "name": "DB", "id": DB_ID}]}
    code = """async () => {
const worker = %s; const stat = %s; const metadata = %s;
const b = `----F${Date.now()}`;
const part = (name, type, body) => [`--${b}`, `Content-Disposition: form-data; name="${name}"; filename="${name}"`, `Content-Type: ${type}`, '', body].join('\\r\\n');
const body = [[`--${b}`, 'Content-Disposition: form-data; name="metadata"', 'Content-Type: application/json', '', JSON.stringify(metadata)].join('\\r\\n'),
  part('worker.js', 'application/javascript+module', worker), part('static.js', 'application/javascript+module', stat), `--${b}--`].join('\\r\\n');
const r = await cloudflare.request({method:'PUT', path:`/accounts/${accountId}/workers/scripts/instaradar`, body, contentType:`multipart/form-data; boundary=${b}`, rawBody:true});
return {ok: r.success};
}""" % (json.dumps(worker), json.dumps(static), json.dumps(meta))
    open(f"{DIST}/deploy-code.js", "w").write(code)
    return len(files)


if __name__ == "__main__":
    print("profiles", seed(), "files", deploy())
