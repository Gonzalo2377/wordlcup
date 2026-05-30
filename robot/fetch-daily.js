#!/usr/bin/env node
/* ============================================================
   MUNDIAL VALUE — daily robot
   ------------------------------------------------------------
   Calls The Odds API once, keeps only FOOTBALL (1X2), maps it to
   the shape the web reads, runs the SAME model as the site, builds
   the day's accumulators, and writes ../daily.json.

   Run:   ODDS_API_KEY=xxxx node fetch-daily.js
   CI:    see ../../.github/workflows/daily-odds.yml

   Node 18+ (built-in fetch). No external dependencies.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

/* ---------------- config (env) ---------------- */
const API_KEY = process.env.ODDS_API_KEY;
// World Cup matches live under 'soccer_fifa_world_cup' (only once books list them).
// Out of season, test with any in-season football key, e.g.:
//   soccer_uefa_champs_league · soccer_spain_la_liga · soccer_conmebol_copa_america
//   soccer_china_superleague  · or 'upcoming' to scan everything (we filter football).
// Football competitions to pull. Comma-separated list of The Odds API sport keys.
// You can override from the workflow with the ODDS_SPORT env var.
// Default = the big competitions so finals/derbies always show up.
const SPORT   = process.env.ODDS_SPORT   || [
    'soccer_uefa_champs_league',     // Champions League (incl. la final)
    'soccer_uefa_europa_league',     // Europa League
    'soccer_spain_la_liga',          // LaLiga
    'soccer_epl',                    // Premier League
    'soccer_italy_serie_a',          // Serie A
    'soccer_germany_bundesliga',     // Bundesliga
    'soccer_france_ligue_one',       // Ligue 1
    'soccer_fifa_world_cup',         // Mundial (cuando esté en temporada)
].join(',');
const REGIONS = process.env.ODDS_REGIONS || 'eu';   // eu|uk|us|au (comma-sep). Each region = 1 credit.
const MARKET  = 'h2h';                               // match winner (1X2)
// Optional whitelist of bookmakers (base ids, comma-sep), e.g. "bet365,betfair,winamax,williamhill,pinnacle".
const BOOK_WHITELIST = (process.env.ODDS_BOOKS || '').split(',').map(s => s.trim()).filter(Boolean);
// Only include matches kicking off within this many hours (today + tomorrow).
// Keeps the board focused on imminent fixtures and excludes far-future events
// like the World Cup until it's actually here. Override with ODDS_WINDOW_HOURS.
const WINDOW_HOURS = parseInt(process.env.ODDS_WINDOW_HOURS || '48', 10);
const OUT = path.join(__dirname, '..', 'daily.json');

if (!API_KEY) { console.error('✗ Missing ODDS_API_KEY env var'); process.exit(1); }

/* ---------------- national-team database ----------------
   The Odds API gives team NAMES only → map to id / FIFA rank /
   colour / recent form (form feeds the model). Edit freely;
   unknown teams get a safe fallback (rank 55, neutral colour). */
const TEAMS_DB = [
    { id:'arg', name:'Argentina',      code:'ARG', color:'#6cabdd', conf:'CONMEBOL', fifa:1,  form:'WWWWD', aliases:['argentina'] },
    { id:'esp', name:'España',         code:'ESP', color:'#c8102e', conf:'UEFA',     fifa:2,  form:'WWWDW', aliases:['spain','españa','espana'] },
    { id:'fra', name:'Francia',        code:'FRA', color:'#1f3a93', conf:'UEFA',     fifa:3,  form:'WWDWW', aliases:['france','francia'] },
    { id:'eng', name:'Inglaterra',     code:'ENG', color:'#ffffff', conf:'UEFA',     fifa:4,  form:'WDWWD', aliases:['england','inglaterra'] },
    { id:'bra', name:'Brasil',         code:'BRA', color:'#ffd23f', conf:'CONMEBOL', fifa:5,  form:'WDWLW', aliases:['brazil','brasil'] },
    { id:'por', name:'Portugal',       code:'POR', color:'#0aa05a', conf:'UEFA',     fifa:6,  form:'WWLWW', aliases:['portugal'] },
    { id:'ned', name:'Países Bajos',   code:'NED', color:'#ff8a1e', conf:'UEFA',     fifa:7,  form:'WWDLW', aliases:['netherlands','holland','holanda','países bajos','paises bajos'] },
    { id:'bel', name:'Bélgica',        code:'BEL', color:'#e5484d', conf:'UEFA',     fifa:8,  form:'WLWDW', aliases:['belgium','bélgica','belgica'] },
    { id:'ger', name:'Alemania',       code:'GER', color:'#1a1a1a', conf:'UEFA',     fifa:9,  form:'DWWLW', aliases:['germany','alemania'] },
    { id:'cro', name:'Croacia',        code:'CRO', color:'#c8102e', conf:'UEFA',     fifa:10, form:'DWDWL', aliases:['croatia','croacia'] },
    { id:'uru', name:'Uruguay',        code:'URU', color:'#6cabdd', conf:'CONMEBOL', fifa:11, form:'WDWWL', aliases:['uruguay'] },
    { id:'mar', name:'Marruecos',      code:'MAR', color:'#c8102e', conf:'CAF',      fifa:12, form:'WWDWL', aliases:['morocco','marruecos'] },
    { id:'col', name:'Colombia',       code:'COL', color:'#ffd23f', conf:'CONMEBOL', fifa:13, form:'DWWDW', aliases:['colombia'] },
    { id:'ita', name:'Italia',         code:'ITA', color:'#1f5fd6', conf:'UEFA',     fifa:9,  form:'WWDWL', aliases:['italy','italia'] },
    { id:'mex', name:'México',         code:'MEX', color:'#0a7d3c', conf:'CONCACAF', fifa:14, form:'LWDWL', aliases:['mexico','méxico'] },
    { id:'usa', name:'Estados Unidos', code:'USA', color:'#1f5fd6', conf:'CONCACAF', fifa:16, form:'WLWDL', aliases:['usa','united states','estados unidos'] },
    { id:'jpn', name:'Japón',          code:'JPN', color:'#1f3a93', conf:'AFC',      fifa:17, form:'WWLWD', aliases:['japan','japón','japon'] },
    { id:'sen', name:'Senegal',        code:'SEN', color:'#0aa05a', conf:'CAF',      fifa:18, form:'WDWLW', aliases:['senegal'] },
    { id:'sui', name:'Suiza',          code:'SUI', color:'#e5484d', conf:'UEFA',     fifa:19, form:'DWDLW', aliases:['switzerland','suiza'] },
    { id:'den', name:'Dinamarca',      code:'DEN', color:'#c8102e', conf:'UEFA',     fifa:20, form:'WLDWW', aliases:['denmark','dinamarca'] },
    { id:'aut', name:'Austria',        code:'AUT', color:'#e5484d', conf:'UEFA',     fifa:22, form:'WWDLW', aliases:['austria'] },
    { id:'kor', name:'Corea del Sur',  code:'KOR', color:'#1f5fd6', conf:'AFC',      fifa:23, form:'WDLWD', aliases:['south korea','korea republic','corea del sur'] },
    { id:'ecu', name:'Ecuador',        code:'ECU', color:'#ffd23f', conf:'CONMEBOL', fifa:24, form:'DWDWL', aliases:['ecuador'] },
    { id:'ukr', name:'Ucrania',        code:'UKR', color:'#ffd23f', conf:'UEFA',     fifa:25, form:'WLDWD', aliases:['ukraine','ucrania'] },
    { id:'tur', name:'Turquía',        code:'TUR', color:'#c8102e', conf:'UEFA',     fifa:26, form:'WWLDW', aliases:['turkey','turquia','türkiye','turkiye'] },
    { id:'can', name:'Canadá',         code:'CAN', color:'#c8102e', conf:'CONCACAF', fifa:27, form:'WLWDL', aliases:['canada','canadá'] },
    { id:'pol', name:'Polonia',        code:'POL', color:'#e5484d', conf:'UEFA',     fifa:28, form:'LWDWL', aliases:['poland','polonia'] },
    { id:'wal', name:'Gales',          code:'WAL', color:'#c8102e', conf:'UEFA',     fifa:29, form:'DLWDW', aliases:['wales','gales'] },
    { id:'pan', name:'Panamá',         code:'PAN', color:'#c8102e', conf:'CONCACAF', fifa:30, form:'WDLWL', aliases:['panama','panamá'] },
    { id:'sco', name:'Escocia',        code:'SCO', color:'#1f3a93', conf:'UEFA',     fifa:31, form:'WDWLL', aliases:['scotland','escocia'] },
    { id:'nor', name:'Noruega',        code:'NOR', color:'#c8102e', conf:'UEFA',     fifa:32, form:'WWWDL', aliases:['norway','noruega'] },
    { id:'egy', name:'Egipto',         code:'EGY', color:'#c8102e', conf:'CAF',      fifa:33, form:'WDWLW', aliases:['egypt','egipto'] },
    { id:'nga', name:'Nigeria',        code:'NGA', color:'#0aa05a', conf:'CAF',      fifa:34, form:'DWLWD', aliases:['nigeria'] },
    { id:'aus', name:'Australia',      code:'AUS', color:'#ffd23f', conf:'AFC',      fifa:35, form:'WDWLW', aliases:['australia'] },
    { id:'civ', name:'Costa de Marfil',code:'CIV', color:'#ff8a1e', conf:'CAF',      fifa:40, form:'WWDLW', aliases:['ivory coast','cote d\'ivoire','costa de marfil'] },
    { id:'cri', name:'Costa Rica',     code:'CRC', color:'#c8102e', conf:'CONCACAF', fifa:43, form:'LWDLW', aliases:['costa rica'] },
    { id:'qat', name:'Catar',          code:'QAT', color:'#7d1128', conf:'AFC',      fifa:44, form:'WLDWW', aliases:['qatar','catar'] },
    { id:'sau', name:'Arabia Saudí',   code:'KSA', color:'#0aa05a', conf:'AFC',      fifa:58, form:'LDWLW', aliases:['saudi arabia','arabia saudi','arabia saudí'] },
    { id:'irn', name:'Irán',           code:'IRN', color:'#0aa05a', conf:'AFC',      fifa:20, form:'WDWWL', aliases:['iran','irán','ir iran'] },
];

/* ---------------- club database (Elo ratings) ----------------
   For league football. Elo ≈ clubelo scale (top ≈ 2000+, mid ≈ 1750,
   low ≈ 1550). The model uses `elo` directly instead of a FIFA rank.
   Add/adjust clubs freely; tweak `elo` to retune the value model.
   `aliases` must match the names The Odds API returns. */
function club(id, name, code, color, elo, form, aliases) { return { id, name, code, color, conf:'Club', elo, form, aliases: aliases || [] }; }
const CLUBS_DB = [
    // LaLiga
    club('rmad','Real Madrid','RMA','#e8e8ee',2030,'WWWDW',['real madrid','real madrid cf']),
    club('fcba','Barcelona','BAR','#1f5fd6',1985,'WWDWW',['barcelona','fc barcelona']),
    club('atm','Atlético Madrid','ATM','#c8102e',1945,'WDWWL',['atletico madrid','atlético madrid','atletico de madrid','club atletico de madrid']),
    club('ath','Athletic Club','ATH','#c8102e',1825,'WDWLW',['athletic bilbao','athletic club']),
    club('rso','Real Sociedad','RSO','#1f5fd6',1805,'DWLWD',['real sociedad']),
    club('vil','Villarreal','VIL','#ffd23f',1815,'WWDLW',['villarreal','villarreal cf']),
    club('bet','Real Betis','BET','#0aa05a',1780,'DWDWL',['real betis','betis']),
    club('sev','Sevilla','SEV','#e5484d',1755,'LWDLW',['sevilla','sevilla fc']),
    club('gir','Girona','GIR','#c8102e',1795,'WLWDW',['girona','girona fc']),
    club('vcf','Valencia','VAL','#ff8a1e',1715,'LWDLW',['valencia','valencia cf']),
    // Premier League
    club('mci','Manchester City','MCI','#6cabdd',2055,'WWWDW',['manchester city','man city']),
    club('ars','Arsenal','ARS','#e5484d',2010,'WWDWW',['arsenal']),
    club('liv','Liverpool','LIV','#c8102e',2005,'WDWWW',['liverpool']),
    club('che','Chelsea','CHE','#1f5fd6',1905,'WDWLW',['chelsea']),
    club('tot','Tottenham','TOT','#e8e8ee',1880,'WLWDL',['tottenham','tottenham hotspur','spurs']),
    club('mun','Manchester United','MUN','#e5484d',1865,'LWDWL',['manchester united','man utd','man united']),
    club('avl','Aston Villa','AVL','#7d1128',1875,'WDWLW',['aston villa']),
    club('new','Newcastle','NEW','#1a1a1a',1870,'WWLDW',['newcastle','newcastle united']),
    club('bha','Brighton','BHA','#1f5fd6',1820,'DWLDW',['brighton','brighton and hove albion','brighton & hove albion']),
    club('whu','West Ham','WHU','#7d1128',1775,'LWDLL',['west ham','west ham united']),
    // Serie A
    club('int','Inter','INT','#1f5fd6',1985,'WWDWW',['inter milan','internazionale','inter']),
    club('juv','Juventus','JUV','#1a1a1a',1905,'WDWDL',['juventus']),
    club('mil','AC Milan','MIL','#e5484d',1900,'WDLWW',['ac milan','milan']),
    club('nap','Napoli','NAP','#6cabdd',1910,'WWWDL',['napoli']),
    club('ata','Atalanta','ATA','#1f3a93',1925,'WWDWW',['atalanta','atalanta bc']),
    club('rom','Roma','ROM','#7d1128',1850,'DWLWD',['as roma','roma']),
    club('laz','Lazio','LAZ','#6cabdd',1830,'WDLDW',['lazio','ss lazio']),
    club('fio','Fiorentina','FIO','#b07bff',1810,'LWDWL',['fiorentina','acf fiorentina']),
    // Bundesliga
    club('bay','Bayern Múnich','BAY','#e5484d',2010,'WWWDW',['bayern munich','bayern münchen','fc bayern munich','bayern munchen']),
    club('lev','Bayer Leverkusen','LEV','#e5484d',1975,'WWDWW',['bayer leverkusen','leverkusen']),
    club('bvb','Borussia Dortmund','BVB','#ffd23f',1905,'WDLWW',['borussia dortmund','dortmund']),
    club('rbl','RB Leipzig','RBL','#e5484d',1900,'WLWDW',['rb leipzig','leipzig']),
    club('stu','Stuttgart','STU','#e8e8ee',1835,'WWDLW',['vfb stuttgart','stuttgart']),
    club('ein','Eintracht Frankfurt','SGE','#1a1a1a',1825,'DWLWD',['eintracht frankfurt','frankfurt']),
    // Ligue 1
    club('psg','PSG','PSG','#1f3a93',1985,'WWWDW',['paris saint germain','psg','paris saint-germain']),
    club('mon','Monaco','MON','#e5484d',1855,'WDWLW',['monaco','as monaco']),
    club('mar','Marseille','OM','#6cabdd',1825,'WLDWW',['marseille','olympique marseille']),
    club('lil','Lille','LIL','#e5484d',1820,'DWWLD',['lille','losc lille']),
    club('lyo','Lyon','LYO','#1f5fd6',1785,'LWDWL',['lyon','olympique lyonnais']),
    club('nic','Nice','NIC','#e5484d',1800,'WDLDW',['nice','ogc nice']),
    // Portugal / Netherlands / others (CL/EL regulars)
    club('ben','Benfica','BEN','#e5484d',1875,'WWDWW',['benfica','sl benfica']),
    club('por','Porto','POR','#1f5fd6',1855,'WDWWL',['porto','fc porto']),
    club('spo','Sporting CP','SCP','#0aa05a',1880,'WWWDL',['sporting cp','sporting lisbon','sporting']),
    club('psv','PSV','PSV','#e5484d',1825,'WWDWW',['psv','psv eindhoven']),
    club('fey','Feyenoord','FEY','#e5484d',1820,'WDWLW',['feyenoord']),
    club('aja','Ajax','AJA','#e5484d',1785,'LWDWL',['ajax']),
    club('gal','Galatasaray','GAL','#e5a000',1820,'WWWDW',['galatasaray']),
    club('fnb','Fenerbahce','FEN','#1f3a93',1820,'WWDWL',['fenerbahce','fenerbahçe']),
    club('cel','Celtic','CEL','#0aa05a',1785,'WWDWW',['celtic']),
];
const BOOK_COLORS = {
    bet365:'#0a7d3c', bwin:'#1a1a1a', williamhill:'#1f5fd6', betfair:'#ffb01f', winamax:'#e5484d',
    codere:'#0aa05a', pinnacle:'#3a4660', sport888:'#ff8a1e', unibet:'#0aa05a', marathonbet:'#1f5fd6',
    betclic:'#e5484d', nordicbet:'#1f3a93', betsson:'#ff8a1e', leovegas:'#e5a000', tipico:'#c8102e',
    onexbet:'#1f5fd6', coolbet:'#0aa05a', betonlineag:'#1a1a1a',
};

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const aliasMap = {};
[...TEAMS_DB, ...CLUBS_DB].forEach(t => { aliasMap[norm(t.name)] = t; (t.aliases||[]).forEach(a => aliasMap[norm(a)] = t); });

function resolveTeam(name, sink) {
    const hit = aliasMap[norm(name)];
    if (hit) { sink[hit.id] = { id:hit.id, name:hit.name, code:hit.code, color:hit.color, conf:hit.conf, fifa:hit.fifa, elo:hit.elo, form:hit.form, known:true }; return hit.id; }
    const id = norm(name).replace(/[^a-z0-9]/g,'').slice(0,6) || ('t' + Object.keys(sink).length);
    sink[id] = { id, name, code: name.replace(/[^A-Za-z]/g,'').slice(0,3).toUpperCase() || 'TBD', color:'#5a6b8c', conf:'—', fifa:55, form:'', known:false };
    return id;
}

/* normalise regional bookmaker keys to a single brand id (best price kept) */
const REGION = /(_ex)?(_(eu|uk|us|au|fr|de|se|nl|it|es|dk|no|fi|ie|pt|be|ca))+$/;
function baseBook(key){ return (key||'').toLowerCase().replace(REGION,'').replace(/[^a-z0-9]/g,'') || key; }
function bookName(title){ return (title||'').replace(/\s*\(.*\)\s*$/,'').trim(); }
function bookAbbr(name){ return (name||'').replace(/[^A-Za-z0-9]/g,'').slice(0,4).toUpperCase(); }

/* ---------------- the model (ported 1:1 from model.js) -------- */
function ratingFromRank(rank){ return 1500 + 560 * Math.exp(-0.035 * (rank - 1)); }
function baseRating(team){ if(!team) return ratingFromRank(55); if(team.elo!=null) return team.elo; return ratingFromRank(team.fifa!=null?team.fifa:55); }
function formScore(form){ if(!form) return 0; const p={W:3,D:1,L:0}; let s=0,n=0; for(const c of form){ if(p[c]!=null){s+=p[c];n++;} } return n ? ((s/n)-1.5)*28 : 0; }
const _f=[1]; function factorial(n){ if(_f[n]!=null)return _f[n]; let r=_f[_f.length-1]; for(let i=_f.length;i<=n;i++){r*=i;_f[i]=r;} return _f[n]; }
function poisson(k,l){ return Math.exp(-l)*Math.pow(l,k)/factorial(k); }
function dcTau(i,j,lh,la,rho){ if(i===0&&j===0)return 1-lh*la*rho; if(i===0&&j===1)return 1+lh*rho; if(i===1&&j===0)return 1+la*rho; if(i===1&&j===1)return 1-rho; return 1; }
function computeModel(homeId, awayId, teams, opts){
    opts=opts||{}; const H=teams[homeId], A=teams[awayId];
    if(!H||!A) return { home:1/3, draw:1/3, away:1/3 };
    const rH=baseRating(H)+formScore(H.form);
    const rA=baseRating(A)+formScore(A.form);
    const homeAdv = opts.neutral===false ? 65 : 16;
    const sup=(rH-rA+homeAdv)/120;
    const avg=(rH+rA)/2;
    let totals=Math.max(2.1,Math.min(3.1, 2.7-(avg-1850)/650));
    const lh=Math.max(0.18,(totals+sup)/2), la=Math.max(0.18,(totals-sup)/2);
    const rho=-0.08, MAX=10; let pH=0,pD=0,pA=0;
    for(let i=0;i<=MAX;i++){ const pi=poisson(i,lh); for(let j=0;j<=MAX;j++){ const p=pi*poisson(j,la)*dcTau(i,j,lh,la,rho); if(i>j)pH+=p; else if(i===j)pD+=p; else pA+=p; } }
    const s=pH+pD+pA||1;
    return { home:pH/s, draw:pD/s, away:pA/s, lambdaH:lh, lambdaA:la, ratingH:rH, ratingA:rA, sup };
}

/* ---------------- value helpers ------------------------------ */
function bestPrice(map){ let best=null; for(const b in map) if(!best||map[b]>best.price) best={book:b,price:map[b]}; return best; }
function marketProbs(m){ const avg=o=>{const v=Object.values(o);return v.reduce((s,x)=>s+1/x,0)/v.length;}; const h=avg(m.odds.home),d=avg(m.odds.draw),a=avg(m.odds.away),s=h+d+a; return {home:h/s,draw:d/s,away:a/s}; }
function matchValue(m){ const mk=marketProbs(m); const outs=['home','draw','away'].map(k=>{ const best=bestPrice(m.odds[k]); return {k,modelP:m.model[k],mktP:mk[k],best,edge:(m.model[k]-mk[k])*100}; }); outs.sort((a,b)=>b.edge-a.edge); const top=outs[0]; return {pick:top,edge:top.edge,positive:top.edge>=2}; }

/* ---------------- API ---------------------------------------- */
// Pull one sport key. A 422/404 (competition out of season) is not fatal:
// we just skip it and keep the others.
async function fetchOne(sportKey){
    const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${API_KEY}&regions=${REGIONS}&markets=${MARKET}&oddsFormat=decimal`;
    const res = await fetch(url);
    if (res.status === 422 || res.status === 404) { console.log(`  - ${sportKey}: sin eventos (fuera de temporada)`); return []; }
    if (!res.ok) { console.log(`  - ${sportKey}: API ${res.status} (omitido)`); return []; }
    console.log(`  - ${sportKey}: ok · creditos restantes ${res.headers.get('x-requests-remaining')}`);
    return res.json();
}
async function fetchOdds(){
    const keys = SPORT.split(',').map(s => s.trim()).filter(Boolean);
    let all = [];
    for (const k of keys) {
        try { const part = await fetchOne(k); if (Array.isArray(part)) all = all.concat(part); }
        catch (e) { console.log(`  - ${k}: error ${e.message} (omitido)`); }
    }
    return all;
}
const fmtGroup = (iso)=> new Date(iso).toLocaleDateString('es-ES',{weekday:'short',day:'2-digit',month:'short',timeZone:'Europe/Madrid'});
const fmtTime  = (iso)=> new Date(iso).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Madrid'});
const fmtDay   = (iso)=> new Date(iso||Date.now()).toLocaleDateString('es-ES',{day:'2-digit',month:'short',timeZone:'Europe/Madrid'}).toUpperCase();

/* ---------------- SCORES (auto-settlement) -------------------
   The Odds API /scores returns finished games with their score, so
   the robot can mark each tracked pick as WON/LOST by itself. */
async function fetchScoresOne(sportKey){
    const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/scores/?apiKey=${API_KEY}&daysFrom=3`;
    const res = await fetch(url);
    if (!res.ok) { console.log(`  scores ${sportKey}: API ${res.status} (omitido)`); return []; }
    return res.json();
}
async function fetchScores(keys){
    let all = [];
    for (const k of keys) { try { const p = await fetchScoresOne(k); if (Array.isArray(p)) all = all.concat(p); } catch(e){} }
    return all;
}
/* winner from a finished score event → 'home' | 'draw' | 'away' | null */
function winnerOf(ev){
    if (!ev || !ev.completed || !Array.isArray(ev.scores)) return null;
    const h = ev.scores.find(s => s.name === ev.home_team);
    const a = ev.scores.find(s => s.name === ev.away_team);
    if (!h || !a) return null;
    const hs = +h.score, as = +a.score;
    if (Number.isNaN(hs) || Number.isNaN(as)) return null;
    return hs > as ? 'home' : (hs < as ? 'away' : 'draw');
}
/* settle PENDING picks against finished scores → append results to RECORD */
function settle(pending, scores, RECORD){
    const byId = {}; scores.forEach(s => { if (s && s.id) byId[s.id] = s; });
    const stillPending = [];
    let settled = 0;
    for (const p of pending) {
        const ev = byId[p.id];
        const w = winnerOf(ev);
        if (!w) { stillPending.push(p); continue; }    // not finished yet → keep waiting
        const result = (w === p.pickKey) ? 'W' : 'L';
        RECORD.unshift({ id: p.id, date: p.date, pick: p.pickLabel, match: p.match, odd: p.odd, book: p.book, stake: 1, result });
        settled++;
    }
    if (settled) console.log(`· liquidados ${settled} picks (resultado real)`);
    return { stillPending, RECORD };
}

/* ---------------- build daily.json --------------------------- */
async function main(){
    const events = await fetchOdds();
    console.log(`· ${events.length} events returned`);

    const TEAMS = {}, BOOKS = {}, MATCHES = [];

    for (const ev of events) {
        if (!/^soccer/.test(ev.sport_key || '')) continue;   // FOOTBALL only
        // time window: only matches kicking off from ~3h ago up to WINDOW_HOURS ahead
        const ko = new Date(ev.commence_time).getTime();
        if (Number.isNaN(ko)) continue;
        if (ko < Date.now() - 3*3600*1000) continue;                 // already finished/old
        if (ko > Date.now() + WINDOW_HOURS*3600*1000) continue;       // too far away (e.g. World Cup)

        const homeId = resolveTeam(ev.home_team, TEAMS);
        const awayId = resolveTeam(ev.away_team, TEAMS);
        const odds = { home:{}, draw:{}, away:{} };

        for (const bk of (ev.bookmakers || [])) {
            const id = baseBook(bk.key);
            if (BOOK_WHITELIST.length && !BOOK_WHITELIST.includes(id)) continue;
            const mkt = (bk.markets || []).find(x => x.key === 'h2h');
            if (!mkt) continue;
            BOOKS[id] = BOOKS[id] || { name: bookName(bk.title) || id, abbr: bookAbbr(bookName(bk.title)) || id.slice(0,4).toUpperCase(), color: BOOK_COLORS[id] || '#5a6b8c', url:'#' };
            for (const o of mkt.outcomes) {
                let slot = null;
                if (o.name === ev.home_team) slot = 'home';
                else if (o.name === ev.away_team) slot = 'away';
                else if (/draw|empate|tie|x/i.test(o.name)) slot = 'draw';
                if (!slot) continue;
                // keep the BEST (highest) price across a brand's regional variants
                if (!odds[slot][id] || o.price > odds[slot][id]) odds[slot][id] = o.price;
            }
        }
        if (!Object.keys(odds.home).length || !Object.keys(odds.draw).length || !Object.keys(odds.away).length) continue;

        MATCHES.push({ id: ev.id || `${homeId}-${awayId}`, group: fmtGroup(ev.commence_time), time: fmtTime(ev.commence_time), home: homeId, away: awayId, odds, _commence: ev.commence_time, _sport: ev.sport_key });
    }

    // Attach probabilities:
    //  · both teams known (FIFA rank) → full value model (can surface value)
    //  · otherwise (e.g. clubs we don't rate) → use de-vigged market so we NEVER
    //    fabricate value; the match still shows with the full odds comparison.
    MATCHES.forEach(m => {
        const bothKnown = TEAMS[m.home].known && TEAMS[m.away].known;
        m.model = bothKnown
            ? computeModel(m.home, m.away, TEAMS, { neutral:true })
            : Object.assign(marketProbs(m), { fromMarket:true });
    });
    const valued = MATCHES.map(m => ({ m, v: matchValue(m) })).filter(x => x.v.positive).sort((a,b)=>b.v.pick.modelP - a.v.pick.modelP);

    // ---- auto-build the day's accumulators ----
    const label = (m,k) => k==='draw' ? 'Empate' : (k==='home' ? TEAMS[m.home].name : TEAMS[m.away].name);
    const legOf = (x) => ({ match:`${TEAMS[x.m.home].name} – ${TEAMS[x.m.away].name}`, pick:label(x.m,x.v.pick.k), odd:+x.v.pick.best.price.toFixed(2), book:x.v.pick.best.book });
    const confOf = (arr) => Math.round(arr.reduce((p,x)=>p*x.v.pick.modelP,1)*100);
    const COMBOS = [];
    if (valued.length >= 2) COMBOS.push({ id:'c1', tier:'single', conf:confOf(valued.slice(0,3)), name:'Combinada del Día', legs:valued.slice(0,3).map(legOf) });
    const byEdge = [...valued].sort((a,b)=>b.v.edge-a.v.edge);
    if (byEdge.length >= 2) COMBOS.push({ id:'c2', tier:'all', conf:confOf(byEdge.slice(0,3)), name:'Combinada Valor', legs:byEdge.slice(0,3).map(legOf) });
    if (valued.length >= 4) COMBOS.push({ id:'c3', tier:'all', conf:confOf(valued.slice(0,4)), name:'Combinada Alto Valor', legs:valued.slice(0,4).map(legOf) });

    // ---- track record: read previous state, settle finished picks ----
    let RECORD = [], PENDING = [];
    try { const prev = JSON.parse(fs.readFileSync(OUT,'utf8')); RECORD = prev.RECORD || []; PENDING = prev.PENDING || []; } catch (e) {}
    try {
        // only query scores for competitions that actually have a pending pick (saves credits)
        const need = [...new Set(PENDING.map(p => p.sport).filter(Boolean))];
        if (need.length) {
            const scores = await fetchScores(need);
            const out = settle(PENDING, scores, RECORD);
            PENDING = out.stillPending; RECORD = out.RECORD;
        }
    } catch (e) { console.log('· scores no disponibles:', e.message); }

    // ---- register today's headline value picks as PENDING (to settle later) ----
    // Track up to the top 3 value picks of the day; never duplicate by event id.
    const haveId = new Set([...PENDING.map(p=>p.id), ...RECORD.map(r=>r.id).filter(Boolean)]);
    valued.slice(0,3).forEach(x => {
        if (haveId.has(x.m.id)) return;
        PENDING.push({
            id: x.m.id,
            sport: x.m._sport,
            date: fmtDay(x.m._commence),
            match: `${TEAMS[x.m.home].name} – ${TEAMS[x.m.away].name}`,
            pickKey: x.v.pick.k,
            pickLabel: label(x.m, x.v.pick.k),
            odd: +x.v.pick.best.price.toFixed(2),
            book: x.v.pick.best.book,
        });
        haveId.add(x.m.id);
    });
    RECORD = RECORD.slice(0, 60);   // keep the ledger tidy
    // strip internal fields from matches before writing
    MATCHES.forEach(m => { delete m._commence; delete m._sport; });

    const daily = {
        meta: { updatedAt:new Date().toISOString(), source:'the-odds-api', sport:SPORT, regions:REGIONS, market:MARKET, matches:MATCHES.length, valuePicks:valued.length, books:Object.keys(BOOKS).length },
        TEAMS, BOOKS, MATCHES, COMBOS, RECORD, PENDING,
    };
    fs.writeFileSync(OUT, JSON.stringify(daily, null, 2));
    console.log(`✓ wrote ${OUT}\n  ${MATCHES.length} football matches · ${valued.length} value picks · ${Object.keys(BOOKS).length} books · ${COMBOS.length} accas · ${RECORD.length} en récord · ${PENDING.length} pendientes`);
    if (!MATCHES.length) console.log('  (no football matches for this sport key right now — see SETUP to test with an in-season league)');
}

main().catch(e => { console.error('✗', e.message); process.exit(1); });
