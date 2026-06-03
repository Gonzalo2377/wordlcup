/* ============================================================
   GOLVALUE — amistosos de selecciones vía API-Football
   ------------------------------------------------------------
   The Odds API no trae amistosos internacionales; esta fuente sí.
   Devuelve eventos en el MISMO formato que The Odds API para que
   el robot principal los procese igual (resolveTeam, odds, modelo).

   Requiere la variable de entorno APIFOOTBALL_KEY (api-sports.io).
   Liga 10 = "Friendlies" (selecciones). Plan free: 100 req/día.
   ============================================================ */
const HOST = 'https://v3.football.api-sports.io';

async function af(path, key){
  const r = await fetch(HOST + path, { headers: { 'x-apisports-key': key } });
  const j = await r.json().catch(()=>({}));
  // API-Football devuelve errores en "errors" aunque el HTTP sea 200
  const errs = j && j.errors;
  if (errs && (Array.isArray(errs) ? errs.length : Object.keys(errs).length)){
    console.log('  · API-Football aviso:', JSON.stringify(errs));
  }
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return j;
}
function slugBook(n){ return (n||'book').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'').slice(0,14) || 'book'; }

/* fetch upcoming international friendlies with 1X2 odds → Odds-API-shaped events */
module.exports = async function fetchFriendlies(key, windowHours){
  if (!key) { console.log('· amistosos: sin APIFOOTBALL_KEY, omitido'); return []; }
  const year = new Date().getFullYear();
  const from = new Date().toISOString().slice(0,10);
  const to   = new Date(Date.now() + Math.max(windowHours, 72)*3600*1000).toISOString().slice(0,10);

  // 1) fixtures: primero por rango de fechas; si 0, probamos "next" (próximos N)
  let fixturesResp = [];
  for (const q of [
        `/fixtures?league=10&season=${year}&from=${from}&to=${to}&timezone=UTC`,
        `/fixtures?league=10&next=25&timezone=UTC`,
        `/fixtures?league=10&season=${year-1}&from=${from}&to=${to}&timezone=UTC`,
      ]) {
    try {
      const r = await af(q, key);
      if (r.response && r.response.length) { fixturesResp = r.response; console.log(`· amistosos: ${r.response.length} fixtures (${q.split('?')[1]})`); break; }
    } catch(e){ console.log('· amistosos: fixtures error', e.message); }
  }
  if (!fixturesResp.length) { console.log('· amistosos: 0 fixtures próximos'); return []; }

  const fixtures = {};
  fixturesResp.forEach(f => {
    const st = f.fixture.status && f.fixture.status.short;
    if (st && st !== 'NS' && st !== 'TBD') return;               // sólo no empezados
    fixtures[f.fixture.id] = {
      home: f.teams.home.name, away: f.teams.away.name,
      homeLogo: f.teams.home.logo, awayLogo: f.teams.away.logo,
      season: (f.league && f.league.season) || year,
      date: f.fixture.date,
    };
  });
  const ids = Object.keys(fixtures);
  if (!ids.length) { console.log('· amistosos: fixtures encontrados pero ya empezados'); return []; }

  // 2) odds por partido (más fiable que el bulk). Limitamos a ~12 para no gastar peticiones.
  const events = [];
  let withOdds = 0;
  for (const id of ids.slice(0, 12)){
    const fx = fixtures[id];
    let od;
    try { od = await af(`/odds?fixture=${id}&bet=1`, key); }
    catch(e){ continue; }
    const resp = (od.response && od.response[0]) || null;
    const bms = resp && resp.bookmakers || [];
    if (!bms.length) continue;
    const bookmakers = bms.map(bm => {
      const bet = (bm.bets || []).find(b => String(b.id) === '1' || /match winner|1x2|winner/i.test(b.name || ''));
      if (!bet || !bet.values) return null;
      const outcomes = [];
      bet.values.forEach(v => {
        const val = String(v.value || '').toLowerCase(); const price = parseFloat(v.odd);
        if (!price) return;
        if (val === 'home' || val === '1') outcomes.push({ name: fx.home, price });
        else if (val === 'away' || val === '2') outcomes.push({ name: fx.away, price });
        else if (val === 'draw' || val === 'x') outcomes.push({ name: 'Draw', price });
      });
      if (outcomes.length < 3) return null;
      return { key: slugBook(bm.title || bm.name), title: bm.title || bm.name, markets: [{ key: 'h2h', outcomes }] };
    }).filter(Boolean);
    if (!bookmakers.length) continue;
    withOdds++;
    events.push({
      id: 'af' + id, sport_key: 'soccer_intl_friendly',
      home_team: fx.home, away_team: fx.away, commence_time: fx.date, bookmakers,
      _logos: { home: fx.homeLogo, away: fx.awayLogo },
    });
  }
  console.log(`· amistosos: ${events.length} con cuotas (${ids.length} fixtures próximos, ${withOdds} con odds)`);
  if (events.length === 0 && ids.length > 0) console.log('  ⚠ hay amistosos pero la API no devolvió cuotas (puede que tu plan no incluya /odds, o aún no están publicadas).');
  return events;
};
