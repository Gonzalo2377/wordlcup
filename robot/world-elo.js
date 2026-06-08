/* ============================================================
   GOLVALUE — Elo histórico de selecciones (World Football Elo)
   ------------------------------------------------------------
   Rating Elo por selección (mejor predictor que el ranking FIFA:
   pondera resultados, rival, margen y localía a lo largo de años).
   El modelo lo usa como base (computeModel → baseRating). Editable.
   Clave = nombre normalizado (inglés de The Odds API + español).
   ============================================================ */
(function(){
  // valores Elo aprox. (World Football Elo, escala ~1600-2100 para top)
  const E = {
    argentina:2090, france:2050, spain:2045, england:1990, brazil:1985, portugal:1975,
    netherlands:1960, belgium:1925, italy:1920, germany:1915, croatia:1880, uruguay:1875,
    colombia:1855, morocco:1840, switzerland:1820, usa:1800, mexico:1790, senegal:1790,
    japan:1785, denmark:1780, ecuador:1770, ivorycoast:1755, ukraine:1750, austria:1760,
    sweden:1745, southkorea:1740, iran:1735, serbia:1735, peru:1720, poland:1720,
    chile:1715, panama:1690, australia:1700, turkey:1730, egypt:1715, nigeria:1740,
    norway:1755, scotland:1730, paraguay:1700, qatar:1660, canada:1700, ghana:1690,
    czechrepublic:1730, tunisia:1690, algeria:1730, capeverde:1640, uzbekistan:1640,
    jordan:1630, iraq:1620, southafrica:1640, bosniaherzegovina:1700, newzealand:1610,
    haiti:1560, curacao:1560, jamaica:1640, honduras:1610, drcongo:1700, saudiarabia:1640,
    venezuela:1690, greece:1740, hungary:1730, wales:1710, romania:1700,
  };
  // alias español → clave inglesa
  const ES = {
    'espana':'spain','francia':'france','inglaterra':'england','brasil':'brazil','alemania':'germany',
    'paises bajos':'netherlands','holanda':'netherlands','belgica':'belgium','italia':'italy','croacia':'croatia',
    'marruecos':'morocco','suiza':'switzerland','estados unidos':'usa','mexico':'mexico','japon':'japan',
    'dinamarca':'denmark','costa de marfil':'ivorycoast','ucrania':'ukraine','suecia':'sweden',
    'corea del sur':'southkorea','iran':'iran','serbia':'serbia','peru':'peru','polonia':'poland',
    'chile':'chile','panama':'panama','turquia':'turkey','egipto':'egypt','nigeria':'nigeria','noruega':'norway',
    'escocia':'scotland','paraguay':'paraguay','catar':'qatar','canada':'canada','ghana':'ghana',
    'republica checa':'czechrepublic','tunez':'tunisia','argelia':'algeria','cabo verde':'capeverde',
    'uzbekistan':'uzbekistan','jordania':'jordan','irak':'iraq','sudafrica':'southafrica',
    'bosnia':'bosniaherzegovina','nueva zelanda':'newzealand','haiti':'haiti','curazao':'curacao',
    'rd congo':'drcongo','arabia saudi':'saudiarabia','arabia saudita':'saudiarabia',
  };
  function norm(s){ return (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,''); }
  function normEs(s){ return (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z ]/g,'').trim(); }
  // exporta para Node (robot) y navegador
  const api = function worldElo(name){
    const n = norm(name);
    if (E[n] != null) return E[n];
    const es = ES[normEs(name)];
    if (es && E[es] != null) return E[es];
    return null;   // desconocida → el modelo usa ranking FIFA de respaldo
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.worldElo = api;
})();
