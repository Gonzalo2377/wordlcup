/* ============================================================
   GOLVALUE — forma real de selecciones vía SofaScore (gratis)
   ------------------------------------------------------------
   Para cada selección busca su ID en SofaScore, lee sus últimos
   partidos OFICIALES (+ amistosos con menos peso) y calcula:
     · form: string W/D/L de los últimos 5 (para mostrar)
     · formScore: puntuación ponderada por rival e importancia
   Persistente en teams-db.json (refresco semanal → 0 coste diario).
   No necesita clave. Cabeceras de navegador para evitar bloqueos.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const HOST = 'https://api.sofascore.com/api/v1';
const DB = path.join(__dirname, 'teams-db.json');
const UA = {
  'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
  'Accept':'application/json',
};
const WEEK = 7*24*3600*1000;
const norm = s => (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z ]/g,' ').replace(/\s+/g,' ').trim();

async function jget(url){ try{ const r=await fetch(url,{headers:UA}); if(!r.ok) return null; return await r.json(); }catch(e){ return null; } }

/* busca el ID del equipo NACIONAL (national:true) por nombre */
async function findTeamId(name){
  const j = await jget(`${HOST}/search/all?q=${encodeURIComponent(name)}`);
  if (!j || !j.results) return null;
  const teams = j.results.filter(x=>x.type==='team' && x.entity && x.entity.id);
  // prioriza selección nacional con nombre que coincide
  const national = teams.find(x=>x.entity.national) || teams[0];
  return national ? national.entity.id : null;
}

/* últimos partidos → forma real ponderada (oficial vale 1, amistoso 0.5; rival fuerte pesa más) */
async function teamForm(id){
  const j = await jget(`${HOST}/team/${id}/events/last/0`);
  if (!j || !j.events) return null;
  const done = j.events.filter(e=>e.status && e.status.type==='finished').slice(-8);  // últimos 8 jugados
  if (!done.length) return null;
  const last5 = [];
  let wsum=0, n=0;
  done.slice(-5).forEach(e=>{
    const home = e.homeTeam && e.homeTeam.id===id;
    const hs=(e.homeScore&&e.homeScore.current)||0, as=(e.awayScore&&e.awayScore.current)||0;
    const my=home?hs:as, opp=home?as:hs;
    last5.push(my>opp?'W':my<opp?'L':'D');
  });
  done.forEach(e=>{
    const home = e.homeTeam && e.homeTeam.id===id;
    const hs=(e.homeScore&&e.homeScore.current)||0, as=(e.awayScore&&e.awayScore.current)||0;
    const my=home?hs:as, opp=home?as:hs;
    const res = my>opp?3:my<opp?0:1;
    // importancia: amistoso (tournament friendly) pesa menos
    const tn = ((e.tournament&&e.tournament.name)||'').toLowerCase();
    const w = /friendl|amist/.test(tn) ? 0.5 : 1;
    wsum += res*w; n += w;
  });
  const avg = n? wsum/n : 1.5;
  return { form: last5.join(''), formScore: +(((avg)-1.5)*28).toFixed(1) };
}

/* devuelve { [normNombre]: {form, formScore} } desde la BD persistente (refresco semanal) */
module.exports = async function sofaTeams(names){
  let db = { _ts:0, teams:{} };
  try { db = JSON.parse(fs.readFileSync(DB,'utf8')); if(!db.teams) db.teams={}; } catch(e){}
  const stale = (Date.now()-(db._ts||0)) > WEEK;
  if (stale){
    let upd=0;
    for (const name of [...new Set(names)]){
      const k = norm(name); if (!k) continue;
      const id = (db.teams[k]&&db.teams[k].id) || await findTeamId(name);
      if (!id) continue;
      const f = await teamForm(id);
      if (f) { db.teams[k] = { id, form:f.form, formScore:f.formScore }; upd++; }
    }
    if (upd){ db._ts=Date.now(); try{ fs.writeFileSync(DB, JSON.stringify(db)); }catch(e){} }
    console.log(`· SofaScore selecciones → ${upd} con forma real`);
  } else {
    console.log(`· teams-db: caché vigente (${Object.keys(db.teams).length} selecciones)`);
  }
  const out={}; for(const k in db.teams) out[k]={form:db.teams[k].form, formScore:db.teams[k].formScore};
  return out;
};
