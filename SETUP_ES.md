# MUNDIAL VALUE — Guía de instalación (paso a paso)

Todo lo que necesitas para poner la web en marcha y que **se actualice sola cada día**.
Solo tendrás que pegar **2 cosas**: tu clave de The Odds API (en el robot) y tus enlaces de Stripe (en `config.js`).

---

## 0) Qué es cada cosa
```
mundial/
├── index.html          La web
├── config.js           ← TÚ EDITAS: enlaces de Stripe + ajustes
├── theme.css           Estilos
├── data.js             Datos de EJEMPLO (respaldo si aún no hay daily.json)
├── model.js            Modelo de probabilidad (Elo+forma+Poisson/Dixon-Coles)
├── components.jsx, views1.jsx, views2.jsx, app.jsx   La aplicación
├── daily.json          ← lo genera el robot cada día (datos reales)
└── robot/
    ├── fetch-daily.js  El robot (llama a la API y genera daily.json)
    └── README.md
.github/workflows/daily-odds.yml   El cron que ejecuta el robot cada mañana
```
> **Importante:** la web **nunca** llama a The Odds API. Solo lo hace el robot, **1 vez al día**.
> Los visitantes solo leen `daily.json` (archivo estático) → **0 créditos**, tengas las visitas que tengas.
> Además la web cachea los datos en el navegador (`config.cacheHours`).

---

## 1) Tu clave de The Odds API
1. **Regenera la clave** en tu panel de The Odds API (la que pegaste en el chat quedó expuesta).
2. Guárdala; la usarás en el paso 3 (va como *secret*, **nunca** dentro de la web).

> La clave de deporte para el Mundial es `soccer_fifa_world_cup`. **Solo devuelve partidos cuando las casas
> listan el torneo** (cerca de junio). Para **probar antes**, usa una liga en temporada (ver paso 5).

---

## 2) Sube el proyecto a GitHub
1. Crea un repositorio nuevo en GitHub.
2. Sube **todo** el contenido de este proyecto (incluida la carpeta `.github`).

---

## 3) Configura el robot (la automatización)
En tu repo de GitHub:
1. **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `ODDS_API_KEY`
   - Value: tu clave
2. Ya está. El workflow `.github/workflows/daily-odds.yml` se ejecuta **cada día a las 07:00 UTC**,
   genera `mundial/daily.json` y hace commit. Para lanzarlo ahora mismo:
   **Actions → “Daily odds robot” → Run workflow**.

---

## 4) Publica la web (elige UNA)

### Opción A — GitHub Pages (lo más simple, todo en GitHub)
1. **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
2. Branch: `main`, carpeta `/ (root)`. Guarda.
3. Tu web quedará en `https://TU-USUARIO.github.io/TU-REPO/mundial/`.
   - Si la quieres en la raíz, mueve el contenido de `mundial/` a la raíz del repo
     (y en el workflow cambia las rutas `mundial/...` por las nuevas).

### Opción B — Cloudflare Pages (hosting más rápido + dominio propio fácil)
1. En Cloudflare: **Workers & Pages → Create → Pages → Connect to Git** y elige tu repo.
2. Build command: *(vacío)* · Output directory: `mundial`.
3. Deploy. El cron sigue corriendo en **GitHub Actions** (Cloudflare solo sirve la web).
   Cada vez que el robot hace commit de `daily.json`, Cloudflare republica solo.

> Las dos son **gratis**. Si tienes dominio propio, los dos permiten conectarlo.

---

## 5) Probar el robot ahora (fuera de temporada del Mundial)
En tu ordenador (Node 18 o superior):
```bash
cd mundial/robot

# Mundial (cuando esté listado por las casas):
ODDS_API_KEY=tu_clave node fetch-daily.js

# Para PROBAR ya con fútbol en temporada, cambia el deporte:
ODDS_SPORT=soccer_uefa_champs_league ODDS_API_KEY=tu_clave node fetch-daily.js
# o, para escanear todo y filtrar fútbol automáticamente:
ODDS_SPORT=upcoming ODDS_API_KEY=tu_clave node fetch-daily.js
```
Genera `mundial/daily.json`. Abre `mundial/index.html` y verás los datos reales.

**Ver la lista de claves de deporte disponibles:**
`https://api.the-odds-api.com/v4/sports/?apiKey=TU_CLAVE`

### Variables del robot
| Variable | Por defecto | Para qué |
|---|---|---|
| `ODDS_API_KEY` | — (obligatoria) | Tu clave |
| `ODDS_SPORT` | `soccer_fifa_world_cup` | Competición |
| `ODDS_REGIONS` | `eu` | `eu`,`uk`,`us`,`au` (coma). **Cada región = 1 crédito/llamada** |
| `ODDS_BOOKS` | (todas) | Filtrar casas, p. ej. `bet365,betfair,winamax,pinnacle` |

Con el plan **Starter (500 créditos/mes)** y 1 región, 1 llamada/día ≈ **30 créditos/mes**. Margen de sobra.

---

## 6) Cobro Premium con Stripe (pegar 2 enlaces)
1. En **Stripe → Payment Links** crea **dos**:
   - **3,99 € pago único** → la “Combinada del día”.
   - **14,99 €/mes (suscripción)** → todas las combinadas.
2. En cada Payment Link, **After payment → Redirect to a URL**:
   - 3,99 €: `https://TU-DOMINIO/?unlocked=single`
   - 14,99 €: `https://TU-DOMINIO/?unlocked=all`
3. Pega las dos URLs en **`mundial/config.js`** (`stripe.single` y `stripe.all`).

Hecho: los botones de Premium llevan a Stripe, y al volver del pago la web desbloquea las combinadas.

> **Nota honesta sobre el desbloqueo:** este método (redirección + recordar en el navegador) es un
> **MVP**: funciona y es suficiente para empezar, pero alguien podría compartir la URL de desbloqueo.
> Para un control de acceso “serio” por suscripción (con cuentas de usuario y verificación en cada visita)
> hace falta un pequeño backend. La opción natural es una **Cloudflare Function/Worker** que:
> cree la sesión de Stripe, reciba el *webhook* de pago y verifique la suscripción.
> Cuando quieras, te lo monto (es el siguiente nivel).

---

## 7) Liquidación automática del récord (opcional, siguiente nivel)
Ahora el histórico (`RECORD`) se conserva entre días, pero marcar **GANADA/FALLADA** es manual.
Para automatizarlo se usa el **Scores API** de The Odds API:
`/v4/sports/{sport}/scores/?daysFrom=2&apiKey=...` → devuelve el resultado final de cada partido.
El robot puede comparar cada pick con el resultado y marcarlo solo. Te lo añado cuando lo quieras.

---

## Resumen de lo que tienes que tocar TÚ
- [ ] `ODDS_API_KEY` como *secret* en GitHub (paso 3).
- [ ] Los **2 enlaces de Stripe** en `mundial/config.js` (paso 6).
- [ ] (Cuando empiece el Mundial) confirmar que `ODDS_SPORT=soccer_fifa_world_cup` devuelve partidos.

Nada más. El resto va solo. 🟡
