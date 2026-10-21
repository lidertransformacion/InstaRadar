# Despliegue en Cloudflare (Radar en la nube, solo lectura)

Fecha: 13-oct-2026 · Cuenta: lidertransformacion@libertariocoffee.com (account 160db171abbbb84bc294df2013f77392)

**URL:** https://instaradar.libertario.workers.dev (protegida con Cloudflare Access)

## Arquitectura
- **UI:** export estático de Next.js (`cloudflare/next.config.export.ts`, sin `src/app/api`), incrustado en el Worker (`static.js`). Se usó esto en lugar de Workers Assets porque la subida de assets necesita un JWT de sesión que el conector MCP no permite enviar.
- **API:** `cloudflare/worker.js`
  - `GET /api/state` → lee D1 (tabla `meta` con settings/cities/study/prices y tabla `profiles` con un JSON por perfil). Mismo formato que la API del Mac.
  - `PUT /api/settings` → solo cambia ciudad y rango.
  - `GET /api/daily-search` → `{ enabled, lastRunAt, lastRunNew }` desde las claves meta `daily_search_enabled`, `daily_search_last_run_at`, `daily_search_last_run_new`.
  - `POST /api/daily-search` → alterna `daily_search_enabled`.
  - `GET /api/avatars/<usuario>` → foto incrustada (12 fotos) o 404 → la UI muestra iniciales.
  - Cualquier otro `/api/*` (búsqueda en la app, importar al Mac, invitaciones, Instagram/Playwright) → 403 "solo lectura". Los botones ya están ocultos por `src/lib/ui-flags.ts`. La carga diaria de perfiles nuevos va por SQL: ver `docs/daily-search.md`.
- **Datos:** D1 `instaradar` (id 99b24b6d-cc75-4cb3-ae45-8ff9352e1702): 42 perfiles + 10 claves meta. El match, el engagement medido y la competencia van dentro del bundle (JSON en `src/data`).

## Recursos creados
| Recurso | Nombre / id |
|---|---|
| Subdominio workers.dev | `libertario.workers.dev` |
| Worker | `instaradar` (binding D1 `DB`) |
| D1 | `instaradar` · 99b24b6d-cc75-4cb3-ae45-8ff9352e1702 |
| Zero Trust / Access | team `libertario-coffee.cloudflareaccess.com` |
| Login | One-time PIN por email |
| Access app | "Radar de Influencers" · 95d9d59d-caea-4cbf-b0ad-8560e7e82c43 · permite solo lidertransformacion@libertariocoffee.com · sesión 30 días |

## Cómo actualizar (después de cambios en el Mac)
1. En el Mac: `curl -s http://127.0.0.1:3847/api/state > state.json` y llevarlo al box (`cloudflare/dist/state.json`).
2. Export estático: copiar el repo, borrar `src/app/api`, usar `cloudflare/next.config.export.ts` como `next.config.ts`, `npx next build` → copiar `out/` a `cloudflare/dist/site` y `data/avatars/*.jpg` a `cloudflare/dist/site/avatars/`.
3. `python3 cloudflare/build.py` → `cloudflare/dist/seed-code.js` y `deploy-code.js`.
4. Ejecutar cada archivo con el conector MCP Cloudflare `execute` (argumento `code` = `$file:/ruta/al/archivo.js`). Primero seed (datos), luego deploy (código).
5. Verificar: `/` 200 tras login, `/api/state` 42 perfiles, `/api/avatars/tomandocafe` image/jpeg.

Sin tokens ni secretos en el repo: todo va por el conector autenticado.

## Límites conocidos
- La nube es una foto de los datos del Mac al momento del despliegue; no se sincroniza sola.
- Búsqueda en Instagram dentro de la app, importación al Mac e invitaciones solo funcionan en el Mac. Los perfiles nuevos del día se cargan en D1 con `docs/daily-search.md`.
- og:image apunta a localhost (falta `metadataBase`); no afecta el uso.
