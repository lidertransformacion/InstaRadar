# Proceso: match Libertario y competencia cercana

Versión 1 · 13-oct-2026 · Medellín. Pensado para convertirse en una herramienta determinística (API de Anthropic + scripts), igual que Monitor POS.

## Reglas
- Solo fuentes públicas. Nada de iniciar sesión en Instagram con la cuenta personal.
- Nunca inventar cifras. Lo que no se confirma se escribe **"Sin verificar"**.
- Cada dato lleva fuente y fecha.

## Paso 1 · Tiendas Libertario de la ciudad
1. Leer la página pública de tiendas (`libertariocoffee.com/pages/coffee-shops-medellin`) y el inventario Odoo (solo lectura).
2. Medellín hoy: **Ciudad del Río** (Cra 48 #18A-33), **Laureles** (Dg 75 #39CB-20) y **Adidas Provenza** (barra adiClub dentro de adidas, placa exacta sin verificar). El Zarzo y La Esquina existen en Odoo sin dirección de tienda → fuera del análisis.

## Paso 2 · Competencia inmediata por tienda
1. Censo OSM/Overpass en radio de 500 m alrededor de cada tienda (scripts del benchmark: `ov_cafes.py`, `nearby.py`); quedarse con categorías café / tostador / cadena.
2. Priorizar: especialidad > brunch con café > cadenas.
3. Por marca: seguidores IG (vista previa pública `og:description` de instagram.com/<usuario>, sin login), rating y reseñas (Google/Degusta/carta.menu), posicionamiento (web propia + guías), precios (carta pública, Rappi, Degusta, PriceListo), contenido, influencers visibles, fortalezas y debilidades frente a Libertario.
4. Salida: `src/data/competencia-medellin.json` (una ficha por tienda con sus competidores y una lectura).

## Paso 3 · ADN Libertario
Tostador de especialidad desde 2015, fincas La Palma y El Tucán, perfiles con nombre (PAZ, LIBRE, ROCK, PUNK, IMPACTO), presencia multi-país, precio premium moderado (índice 112 vs mediana de Laureles). IG 75K con ER público bajo (0,39%) → necesita voces locales creíbles.

## Paso 4 · Modelo de match (0–100)
Script determinístico: `scripts/build-match.py docs/candidatos-medellin-v2.json` → `src/data/match-libertario.json`.

| Factor | Peso | Regla |
|---|---|---|
| Nicho | 30 | café 30 · brunch/desayunos 27 · foodie 23 · bienestar 19 · fitness 16 · lifestyle 13 · moda/belleza 7 |
| Zona | 20 | menciona Laureles/Provenza/El Poblado/Ciudad del Río 20 · Medellín confirmado 16 · Medellín 13 · Envigado/Sabaneta 11 · Medellín-Manizales 9 · solo "Colombia" 5 |
| Tamaño | 15 | 3K–15K 15 · 15–25K 13 · 1,5–3K 10 · 25–50K 9 · resto 6 · sin dato 4 |
| Engagement | 10 | ER 3–10% 10 · 2–3% 8 · 1,5–2% 6 · <1,5% 4 · >10% 6 (atípico) · sin dato 5 |
| Autenticidad | 10 | seguidores falsos (Modash) <15% 10 · 15–25% 7 · 25–35% 4 · >35% 2 · sin dato 6 |
| Estética/valores | 10 | café 10 · experiencias/saludable/recetas/sostenible 8 · comida 7 · lifestyle/fitness 6 · moda/lujo 5 |
| Competencia | 5 | sin relación visible 5 · sin dato 4 · ya mencionó a Pergamino 3 (afinidad, revisar exclusividad) |
| Penalización | −5 | perfil no verificado (dato de terceros) |

Límites conocidos: la zona del influencer casi nunca es pública a nivel barrio; ER y falsos solo existen para perfiles de Modash.

## Paso 5 · App
- Radar: orden por defecto "Match Libertario", puntaje con explicación y desglose al abrir la tarjeta.
- Competencia: selector por tienda Libertario con fichas de competidores, ADN Libertario y otras marcas.

## Paso 6 · Cómo convertirlo en herramienta (siguiente fase)
1. Recolector (script): censo OSM + vistas públicas IG + agregadores → JSON crudo con fuentes.
2. Analistas (API de Anthropic, salida JSON con esquema fijo, temperatura 0): (a) clasificar nicho/valores desde bio y captions; (b) ficha de competidor; (c) resumen por tienda. Cada campo exige `fuente` o "Sin verificar".
3. Puntaje: siempre con `build-match.py` (sin LLM) para que sea reproducible.
4. Repetir por ciudad (Chile la próxima semana) cambiando solo la lista de tiendas y el radio.
