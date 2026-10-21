# MUNDIAL VALUE — robot diario (automatización)

Esto hace que la web **se actualice sola cada mañana** sin que toques nada.

## Qué hace
1. Llama **una vez al día** a The Odds API (partidos + cuotas de varias casas, en una sola petición).
2. Mapea cada selección, calcula la probabilidad con **el mismo modelo que la web** (Elo desde ranking FIFA + forma + Poisson/Dixon-Coles).
3. Detecta el **valor** (modelo vs mercado) y genera las **combinadas** del día.
4. Escribe `mundial/daily.json`. La web lo lee al cargar (si no existe, usa los datos de ejemplo).

## Puesta en marcha (una sola vez)

### Opción A — GitHub Actions (gratis, recomendado)
1. Sube este proyecto a un repositorio de GitHub.
2. **Regenera tu API key** en The Odds API (la anterior quedó expuesta) y cópiala.
3. En el repo: **Settings → Secrets and variables → Actions → New repository secret**
   - Nombre: `ODDS_API_KEY`
   - Valor: tu clave
4. Listo. El workflow `.github/workflows/daily-odds.yml` se ejecuta cada día a las 07:00 UTC
   y hace commit de `mundial/daily.json`. Puedes lanzarlo a mano en la pestaña **Actions → Daily odds robot → Run workflow**.
5. Si publicas con **GitHub Pages**, la web queda actualizada automáticamente al hacer commit.

### Opción B — tu propio hosting (donde tienes AdSense)
Ejecuta el script en un cron de tu servidor y deja el `daily.json` junto al `index.html`:
```bash
ODDS_API_KEY=tu_clave node mundial/robot/fetch-daily.js
```
Programa ese comando cada mañana (cron de Linux, tarea de cPanel, Vercel Cron, etc.).

## Probarlo ahora mismo
```bash
cd mundial/robot
ODDS_API_KEY=tu_clave node fetch-daily.js
# genera ../daily.json
```
> El Mundial usa la clave de deporte `soccer_fifa_world_cup`. **Fuera de temporada** esa clave no
> devuelve partidos; para probar antes del torneo, exporta otra, p. ej.:
> `ODDS_SPORT=soccer_uefa_champs_league ODDS_API_KEY=... node fetch-daily.js`
> (lista de claves: `https://api.the-odds-api.com/v4/sports/?apiKey=TU_CLAVE`).

## Variables de entorno
| Variable | Por defecto | Para qué |
|---|---|---|
| `ODDS_API_KEY` | — (obligatoria para cuotas) | Tu clave de The Odds API. **Una clave por web**: si dos webs comparten clave, se comen los créditos la una a la otra |
| `ODDS_SPORT` | Champions, Europa League, 5 grandes ligas, Mundial | Competiciones (separadas por coma) o `auto` |
| `ODDS_REGIONS` | `eu` | Casas por región: `eu`, `uk`, `us`, `au` (separadas por coma). **Cada región gasta 1 crédito** por competición |
| `ODDS_MAX` | `8` | Máximo de competiciones (= créditos) por día |
| `ODDS_MIN_HOURS` | `20` | Horas mínimas entre dos peticiones de cuotas; si se lanza antes, solo liquida (gratis) |
| `ODDS_MODE` | — | `scores` = solo liquidar resultados (no necesita clave) |

**Créditos** (plan gratis: 500/mes, se renuevan el día 1). Pedir cuotas cuesta 1 crédito **por competición** (×regiones).
`/sports` y `/events` son gratis, así que el robot primero mira qué competiciones tienen partidos en la ventana y
solo pide cuotas de esas, una vez al día, sin pasarse del cupo que queda hasta fin de mes. Lo normal: 2-8 créditos/día.
Antes (oct-2026) gastaba ~21 créditos por ejecución × 2 ejecuciones/día → los 500 se acababan el día 12.

## Liquidación (récord)
- Fuente principal: **ESPN** (gratis): competición + fecha/hora + los dos equipos (`robot/espn-football.js`).
  Respaldo: The Odds API `/scores` por ID de evento (solo partidos de los últimos 3 días).
- **Nunca se borra un pick**: acaba como `W`, `L` o `V` (anulado, con `reason`): aplazado/suspendido/cancelado,
  o sin resultado 7 días después del partido. El historial no se recorta (la web enseña lo que quiera).
- El 1X2 se liquida a **90 minutos**: si hubo prórroga o penaltis, cuenta como empate.
- Combinadas: una pierna anulada cuenta como cuota 1 (como en las casas); si fallan una, fallada.
- `node robot/recover-history.js` (se usó una vez, oct-2026) recupera de git lo que las versiones antiguas borraron.

## Editar las selecciones / el modelo
- **Selecciones** (ranking FIFA, colores, forma): edita `TEAMS_DB` arriba en `fetch-daily.js`.
  Cualquier equipo que no esté en la lista entra con valores por defecto (ranking 55, color neutro).
- **Modelo**: las funciones del modelo en `fetch-daily.js` son **idénticas** a `mundial/model.js`.
  Si tocas una, toca la otra para que web y robot coincidan.

## Pendiente (siguiente nivel)
- **Cobro Premium (3,99 € / 14,99 €)**: requiere Stripe. La interfaz de planes ya está; falta enchufar el pago.
