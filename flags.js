/* ============================================================
   GOLVALUE — banderas de selecciones (flagcdn, gratis)
   Mapa nombre normalizado → ISO2. window.flagUrl(team) devuelve
   la URL de la bandera (imagen) o null. Cubre selecciones del
   Mundial 2026 en inglés (The Odds API) y español (TEAMS_DB).
   ============================================================ */
(function(){
  const ISO = {
    // —— en inglés (lo que devuelve The Odds API) ——
    'mexico':'mx','south africa':'za','south korea':'kr','korea republic':'kr','czech republic':'cz','czechia':'cz',
    'canada':'ca','bosnia & herzegovina':'ba','bosnia and herzegovina':'ba','usa':'us','united states':'us','paraguay':'py',
    'qatar':'qa','switzerland':'ch','brazil':'br','morocco':'ma','haiti':'ht','scotland':'gb-sct','australia':'au',
    'turkey':'tr','turkiye':'tr','germany':'de','curacao':'cw','netherlands':'nl','japan':'jp','ivory coast':'ci',
    'cote divoire':'ci','ecuador':'ec','sweden':'se','tunisia':'tn','spain':'es','cape verde':'cv','belgium':'be',
    'egypt':'eg','saudi arabia':'sa','uruguay':'uy','iran':'ir','new zealand':'nz','france':'fr','senegal':'sn',
    'iraq':'iq','norway':'no','argentina':'ar','algeria':'dz','austria':'at','jordan':'jo','portugal':'pt',
    'dr congo':'cd','congo dr':'cd','england':'gb-eng','croatia':'hr','ghana':'gh','panama':'pa','uzbekistan':'uz',
    'colombia':'co','wales':'gb-wls','italy':'it','poland':'pl','denmark':'dk','nigeria':'ng','cameroon':'cm',
    'ukraine':'ua','peru':'pe','chile':'cl','greece':'gr','serbia':'rs','venezuela':'ve','costa rica':'cr',
    'jamaica':'jm','honduras':'hn',
    // —— en español (TEAMS_DB) ——
    'mexico_es':'mx','sudafrica':'za','corea del sur':'kr','republica checa':'cz','canada_es':'ca',
    'bosnia':'ba','estados unidos':'us','catar':'qa','suiza':'ch','brasil':'br','marruecos':'ma','haiti_es':'ht',
    'escocia':'gb-sct','turquia':'tr','alemania':'de','curazao':'cw','paises bajos':'nl','holanda':'nl','japon':'jp',
    'costa de marfil':'ci','suecia':'se','tunez':'tn','espana':'es','cabo verde':'cv','belgica':'be','egipto':'eg',
    'arabia saudi':'sa','arabia saudita':'sa','iran_es':'ir','nueva zelanda':'nz','francia':'fr','senegal_es':'sn',
    'irak':'iq','noruega':'no','argelia':'dz','jordania':'jo','rd congo':'cd','inglaterra':'gb-eng','croacia':'hr',
    'ghana_es':'gh','panama_es':'pa','uzbekistan_es':'uz','italia':'it','polonia':'pl','dinamarca':'dk','ucrania':'ua',
  };
  function norm(s){ return (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z ]/g,' ').replace(/\s+/g,' ').trim(); }
  // re-normaliza las claves del mapa para que "bosnia & herzegovina" case con cualquier grafía
  const N = {}; for (const k in ISO) N[norm(k)] = ISO[k];
  N['bosnia and herzegovina']='ba'; N['bosnia herzegovina']='ba'; N['bosnia']='ba';
  window.flagUrl = function(team){
    if (!team) return null;
    const n = norm(team.name);
    const iso = N[n] || ISO[norm(team.name)+'_es'] || N[n.replace(' and ',' ')];
    return iso ? ('https://flagcdn.com/w160/' + iso + '.png') : null;
  };
})();
