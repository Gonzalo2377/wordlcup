/* ============================================================
   GOLVALUE — resultados de fútbol vía ESPN (gratis, sin clave)
   ------------------------------------------------------------
   Fuente PRINCIPAL de liquidación (0 créditos). The Odds API
   /scores (por ID de evento) queda como respaldo.

   site.api.espn.com/apis/site/v2/sports/soccer/<liga>/scoreboard?dates=YYYYMMDD

   Empareja por competición + fecha/hora + los DOS equipos (no por
   un solo nombre). Si hay dudas (dos partidos posibles) no liquida.

   Reglas 1X2 (se liquida a 90 minutos):
     · terminado con prórroga o penaltis → a los 90' iba empate → 'draw'
     · aplazado / cancelado / suspendido / abandonado → anulado ('void')
   ============================================================ */
'use strict';

// clave de The Odds API → liga de ESPN
const LEAGUES = {
  soccer_uefa_champs_league: 'uefa.champions',
  soccer_uefa_europa_league: 'uefa.europa',
  soccer_uefa_europa_conference_league: 'uefa.europa.conf',
  soccer_epl: 'eng.1',
  soccer_efl_champ: 'eng.2',
  soccer_spain_la_liga: 'esp.1',
  soccer_spain_segunda_division: 'esp.2',
  soccer_italy_serie_a: 'ita.1',
  soccer_italy_serie_b: 'ita.2',
  soccer_germany_bundesliga: 'ger.1',
  soccer_germany_bundesliga2: 'ger.2',
  soccer_france_ligue_one: 'fra.1',
  soccer_france_ligue_two: 'fra.2',
  soccer_fifa_world_cup: 'fifa.world',
  soccer_uefa_nations_league: 'uefa.nations',
  soccer_uefa_european_championship: 'uefa.euro',
  soccer_conmebol_copa_america: 'conmebol.america',
  soccer_fifa_world_cup_qualifiers_europe: 'fifa.worldq.uefa',
  soccer_conmebol_copa_libertadores: 'conmebol.libertadores',
  soccer_conmebol_copa_sudamericana: 'conmebol.sudamericana',
  soccer_brazil_campeonato: 'bra.1',
  soccer_brazil_serie_b: 'bra.2',
  soccer_argentina_primera_division: 'arg.1',
  soccer_netherlands_eredivisie: 'ned.1',
  soccer_portugal_primeira_liga: 'por.1',
  soccer_usa_mls: 'usa.1',
  soccer_mexico_ligamx: 'mex.1',
  soccer_turkey_super_league: 'tur.1',
  soccer_belgium_first_div: 'bel.1',
  soccer_japan_j_league: 'jpn.1',
  soccer_australia_aleague: 'aus.1',
  soccer_sweden_allsvenskan: 'swe.1',
  soccer_norway_eliteserien: 'nor.1',
  soccer_denmark_superliga: 'den.1',
  soccer_switzerland_superleague: 'sui.1',
  soccer_austria_bundesliga: 'aut.1',
  soccer_greece_super_league: 'gre.1',
  soccer_poland_ekstraklasa: 'pol.1',
  soccer_spl: 'sco.1',
  soccer_international_friendly: 'fifa.friendly',
};
// si no sabemos la competición (p. ej. peldaños antiguos del reto), buscamos en estas
const FALLBACK_LEAGUES = ['uefa.champions', 'uefa.europa', 'uefa.europa.conf', 'esp.1', 'eng.1', 'ita.1', 'ger.1', 'fra.1', 'fifa.world', 'fifa.friendly'];

const DAY = 24 * 3600 * 1000;
const VOID_STATUS = /POSTPONED|CANCEL|ABANDON|SUSPEND|FORFEIT|DELAYED/;
const STOP = new Set(['fc','cf','cd','sc','ac','ca','afc','club','clube','de','del','la','le','les','el','the','do','da','di','sk','if','ik','bk','fk','sv','ss','as','us','rc','sl','cp','ud','sd','rcd','vfb','vfl','tsg','bsc','ec','se','cr','1','05','04','fsv']);

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[øœ]/g, 'o').replace(/ß/g, 'ss').replace(/ł/g, 'l').replace(/[đð]/g, 'd').replace(/ı/g, 'i').replace(/æ/g, 'ae').replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = (s) => norm(s).split(' ').filter(t => t && !STOP.has(t));
const initials = (s) => norm(s).split(' ').filter(t => t && !['de','da','do','del','la','le','the','and'].includes(t)).map(t => t[0]).join('');
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');

function tokSim(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.length || !B.length) return 0;
  const used = new Set(); let hit = 0;
  for (const x of A) {
    const j = B.findIndex((y, k) => !used.has(k) && (x === y || (x.length >= 5 && y.length >= 5 && x.slice(0, 5) === y.slice(0, 5))));
    if (j >= 0) { used.add(j); hit++; }
  }
  return hit / (A.length + B.length - hit);   // Jaccard
}
/* parecido entre "nuestros" nombres de un equipo (varios alias) y los de ESPN */
function teamSim(ours, espn) {
  let best = 0;
  for (const o of ours) for (const e of espn.names) {
    if (!o || !e) continue;
    if (norm(o) === norm(e)) return 1;
    best = Math.max(best, tokSim(o, e));
  }
  if (espn.abbr) for (const o of ours) { const i = initials(o); if (i.length >= 3 && i === espn.abbr.toLowerCase()) best = Math.max(best, 0.9); }
  return best;
}

const cache = new Map();
async function fetchDay(league, d) {
  const key = league + '|' + d;
  if (cache.has(key)) return cache.get(key);
  const p = (async () => {
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?dates=${d}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(url);   // ojo: con un User-Agent propio ESPN responde 403
        if (r.status === 400 || r.status === 404) return [];       // liga que ESPN no tiene
        if (!r.ok) continue;
        const j = await r.json();
        return (j.events || []).map(ev => {
          const c = (ev.competitions || [])[0] || {};
          const cs = c.competitors || [];
          const h = cs.find(x => x.homeAway === 'home') || cs[0], a = cs.find(x => x.homeAway === 'away') || cs[1];
          if (!h || !a) return null;
          const st = (c.status || ev.status || {});
          const type = st.type || {};
          const tn = t => ({ names: [t.team && t.team.displayName, t.team && t.team.shortDisplayName, t.team && t.team.name, t.team && t.team.location].filter(Boolean), abbr: t.team && t.team.abbreviation });
          return { espnId: ev.id, league, ts: new Date(ev.date).getTime(), home: tn(h), away: tn(a), hs: +h.score, as: +a.score,
            status: type.name || '', state: type.state || '', completed: !!type.completed, period: +st.period || 0,
            label: `${h.team && h.team.displayName} ${h.score}-${a.score} ${a.team && a.team.displayName}` };
        }).filter(Boolean);
      } catch (e) { /* reintento */ }
    }
    return null;   // error de red: no sabemos (≠ "no hay partidos")
  })();
  cache.set(key, p);
  return p;
}

/**
 * Busca el resultado de un partido.
 *   q = { sport, ts?, from?, to?, home:[nombres], away:[nombres] }
 *   - ts: hora de inicio conocida (ms) → ventana ±6 h
 *   - from/to: ventana amplia (picks antiguos sin hora)
 * Devuelve:
 *   { state:'final', side:'home'|'draw'|'away', score:'2-1', note, source:'espn', espnId }
 *   { state:'void', reason, source:'espn' }
 *   { state:'pending' }    encontrado pero sin terminar
 *   { state:'notfound', why }
 */
async function findResult(q) {
  const leagues = q.sport ? (LEAGUES[q.sport] ? [LEAGUES[q.sport]] : []) : FALLBACK_LEAGUES;
  if (!leagues.length) return { state: 'notfound', why: 'competición sin cobertura en ESPN' };
  const from = q.ts ? q.ts - 6 * 3600 * 1000 : q.from;
  const to = q.ts ? q.ts + 6 * 3600 * 1000 : q.to;
  const days = [];
  for (let t = from - DAY; t <= to + DAY; t += DAY) days.push(ymd(t));
  let cands = [], netErr = false;
  for (const lg of leagues) for (const d of [...new Set(days)]) {
    const evs = await fetchDay(lg, d);
    if (evs === null) { netErr = true; continue; }
    cands.push(...evs.filter(e => e.ts >= from && e.ts <= to));
  }
  const seen = new Set(); cands = cands.filter(e => !seen.has(e.espnId) && seen.add(e.espnId));
  // puntuación de un emparejamiento: lo que se parece el PEOR de los dos equipos.
  // Con hora conocida (±6 h) un equipo no juega dos veces: basta uno idéntico y el otro parecido
  // (p. ej. "Slavia Praha" / "Slavia Prague").
  const pair = (a, b) => {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    return (q.ts && hi >= 0.99 && lo >= 0.3) ? Math.max(lo, 0.6) : lo;
  };
  const scored = cands.map(e => {
    const s = pair(teamSim(q.home, e.home), teamSim(q.away, e.away));
    const sw = pair(teamSim(q.home, e.away), teamSim(q.away, e.home)) - 0.1;   // local/visitante al revés (campo neutral): algo penalizado
    return { e, score: Math.max(s, sw), swapped: sw > s };
  }).filter(x => x.score >= 0.5).sort((a, b) => b.score - a.score);
  // si ESPN falló en algún día de la búsqueda no podemos afirmar que "no está": se reintenta (nunca se anula por esto)
  if (!scored.length) return netErr ? { state: 'notfound', why: 'ESPN no responde', retry: true } : { state: 'notfound', why: 'partido no encontrado en ESPN' };
  // dos candidatos igual de buenos (y que no sean el mismo partido aplazado+reprogramado) → no arriesgamos
  if (scored.length > 1 && scored[1].score >= scored[0].score - 0.05 && !VOID_STATUS.test(scored[0].e.status) && !VOID_STATUS.test(scored[1].e.status))
    return { state: 'notfound', why: 'emparejamiento ambiguo en ESPN' };
  const { e, swapped } = scored[0];
  if (VOID_STATUS.test(e.status)) return { state: 'void', reason: `partido ${e.status.replace('STATUS_', '').toLowerCase()} (ESPN)`, source: 'espn', espnId: e.espnId };
  if (!(e.completed && e.state === 'post')) return { state: 'pending' };
  if (Number.isNaN(e.hs) || Number.isNaN(e.as)) return { state: 'notfound', why: 'ESPN sin marcador' };
  const extra = /AET|PEN|EXTRA/.test(e.status) || e.period > 2;
  let side = extra ? 'draw' : (e.hs > e.as ? 'home' : e.hs < e.as ? 'away' : 'draw');
  if (swapped && side !== 'draw') side = side === 'home' ? 'away' : 'home';
  return { state: 'final', side, score: `${e.hs}-${e.as}`, note: extra ? 'prórroga/penaltis → empate a los 90\'' : '', source: 'espn', espnId: e.espnId, label: e.label };
}

module.exports = { findResult, LEAGUES };
